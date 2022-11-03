// ==UserScript==
// @name         KaniWani Synonym Checker
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Checks for synonyms before answer is submit.
// @author       You
// @match        https://www.kaniwani.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=kaniwani.com
// @grant        none
// @require      https://unpkg.com/wanakana
// ==/UserScript==

(async function() {
    'use strict';

    class Utils {
        // modified from https://stackoverflow.com/a/16436975
        static arraysEqualOrdered(a, b) {
            if (a === b) return true;
            if (a == null || b == null) return (a == null && b == null);
            if (a.length !== b.length) return false;

            for (let i = 0; i < a.length; ++i) {
                if (a[i] !== b[i]) return false;
            }
            return true;
        }

        // https://developer.mozilla.org/en-US/docs/Web/JavaScript
        // /Reference/Global_Objects/Set
        static intersection(a, b) {
            return new Set([...a].filter(x => b.has(x)));
        }

        static areIntersecting(a, b) {
            for (const x of a) {
                if (b.has(x)) return true;
            }

            return false;
        }
    }

    class Hook {
        #session;
        #callbacks = [];

        constructor(session) {
            this.#session = session;
        }

        register(callback) {
            this.#callbacks.push(callback);
        }

        call(event = null, data = null) {
            const messages = []

            for (const callback of this.#callbacks) {
                const result = callback(this.#session, event, data, messages);

                messages.push(result);

                if ((result === false) || (event && event.cancelBubble)) {
                    return false;
                }
            }

            return true;
        }

        clear() {
            this.#callbacks = [];
        }
    }

    class Session {
        sessionStartHook;
        sessionEndHook;
        submitAnswerHook;

        #selectors = new Map([
            ['answerField', '#answer'],
            ['questionBox', 'div.lltPfd'],
            ['primary', 'div[data-question-primary]'],
            ['secondary', 'div[data-question-secondary]'],
            ['partsOfSpeech', 'ul.hyPboY'],
            ['submitButton', 'button[aria-label="Submit answer"]'],
        ]);

        #elements = new Map();
        #app;
        #subjects;
        #twins;
        #possibleAnswers = null;

        static states = Object.freeze({
            INITIALIZING: Symbol('INITIALIZING'),
            NOT_IN_SESSION: Symbol('NOT_IN_SESSION'),
            AWAITING_ANSWER: Symbol('AWAITING_ANSWER'),
            AWAITING_CONFIRMATION: Symbol('AWAITING_CONFIRMATION'),
        });

        #state = Session.states.NOT_IN_SESSION;

        constructor(subjects, twins) {
            this.#subjects = subjects;
            this.#twins = twins;
            this.#app = document.querySelector('#app');
            this.sessionStartHook = new Hook(this);
            this.sessionEndHook = new Hook(this);
            this.submitAnswerHook = new Hook(this);
            this.#observeReviewSession();
        }

        static createSession() {
            const url = 'https://raw.githubusercontent.com/panda-byte/'
                + 'kaniwani-synonym-checker/main/data/';

            return Promise.all([
                fetch(`${url}vocab_subjects.json`),
                fetch(`${url}twins.json`),
            ]).then(responses => Promise.all(responses.map(
                response => response.json()
            ))).then(objects => {
                return new Session(
                    new Map(Object.entries(objects[0])),
                    new Map(objects[1])
                );
            });
        }

        #observeReviewSession() {
            const checkURL = () => {
                if (document.URL.endsWith('/reviews/session')) {
                    if (!this.inSession()) {
                        this.#setState(Session.states.INITIALIZING);
                        this.#initSession();
                    }
                } else {
                    if (this.inSession()) {
                        this.#endSession();
                    }
                }
            }

            checkURL();

            new MutationObserver(checkURL).observe(
                this.#app, {childList: true, subtree: true}
            );
        }

        get state(){
            return this.#state;
        }

        #setState(state) {
            console.log("New state: ");
            console.log(state);

            this.#state = state;
        }

        inSession() {
            return this.#state !== Session.states.NOT_IN_SESSION
        }

        #startSession() {
            console.log("Session started!");
            this.#awaitAnswer();

            window.addEventListener(
                'click', this.#clickListener.bind(this), {capture: true}
            );

            window.addEventListener(
                'keydown', this.#keyDownListener.bind(this), {capture: true}
            );

            this.sessionStartHook.call();
        }

        #awaitAnswer() {
            this.#setState(Session.states.AWAITING_ANSWER);

            const secondaryText = this.#elements.get('secondary').textContent.trim();

            // TODO: find out correct answer
            const hints = {
                primary: this.#elements.get('primary').textContent,
                secondary: secondaryText ?
                    secondaryText.split(', ') : [],
                partsOfSpeech: [
                    ...this.#elements.get('partsOfSpeech')
                        .querySelectorAll('li > span')
                ].map(span => this.#adjustPartOfSpeech(span.textContent))
            }

            const meanings = new Set([hints.primary, ...hints.secondary]);

            this.#possibleAnswers = Array.from(this.#subjects.values()).filter(
                subject => Utils.areIntersecting(
                    meanings, new Set([
                        subject.primary_meaning, ...subject.other_meanings
                    ])
                )
            );

            console.log(hints.partsOfSpeech)
            console.log("Possible answers: ");
            console.log(this.#possibleAnswers);
            console.log(hints.partsOfSpeech)

            // TODO Include parts of speech in vocab!

        }

        #endSession() {
            console.log("Session ended!");
            this.#setState(Session.states.NOT_IN_SESSION);
            this.sessionEndHook.call();
            this.#elements.clear();
        }

        #clickListener(event) {
            if (!this.inSession()) {
                return;
            }

            console.log("Captured click!");

            if (this.#elements.get('submitButton').contains(event.target)) {
                this.#submitAnswer(event);
            }
        }

        #keyDownListener(event) {
            if (!this.inSession()) {
                return;
            }

            console.log("Captured keydown!");

            if (event.key === 'Enter') {
                this.#submitAnswer(event);
            } else if (event.key === 'Backspace') {
                if (this.#state === Session.states.AWAITING_CONFIRMATION) {
                    this.#ignoreResult();
                }
            }
        }

        #isValidCharacter(char) {
            // see https://stackoverflow.com/questions/19899554/unicode-range-for-japanese
            return (
                wanakana.isKana()
                || wanakana.isKanji()
                || char.match(/[\d!?n\u3000-\u30ff\uff00-\uffef\u4e00-\u9faf]/)
            );
        }

        #isValidAnswer(answer) {
            for (const char of answer) {
                if (!this.#isValidCharacter(char)) {
                    return false;
                }
            }

            return true;
        }

        #adjustAnswer(answer) {
            if (answer.endsWith('n')) {
                return answer.replace('n', 'ん');
            }

            return answer;
        }

        #adjustPartOfSpeech(partOfSpeech) {
            return partOfSpeech.toLowerCase();
        }

        #submitAnswer(event) {
            const answer = this.#elements.get('answerField').value;

            if (!this.#isValidAnswer(answer)) {
                console.log("Invalid answer!");
                return;
            }

            const secondary = this.#elements.get('secondary').textContent;

            const data = {
                answer: this.#adjustAnswer(answer),
                question: {
                    primary: this.#elements.get('primary').textContent,
                    secondary: secondary ? secondary.split(', ') : [],
                    partsOfSpeech: [
                        ...this.#elements.get('partsOfSpeech')
                               .querySelectorAll('li > span')
                    ].map(span => this.#adjustPartOfSpeech(span.textContent))
                }
            };

            if (!this.submitAnswerHook.call(event, data)) {
                console.log("Submitting answer was stopped by callback!");
                return;
            }

            this.#setState(Session.states.AWAITING_CONFIRMATION);
        }

        #ignoreResult() {
            this.#setState(Session.states.AWAITING_ANSWER);
        }

        #initSession() {
            const findElements = (_, observer) => {
                let foundAll = true;

                for (const [name, selector] of this.#selectors.entries()) {
                    if (this.#elements.has(name)) {
                        continue;
                    }

                    const element = document.querySelector(selector);

                    if (element) {
                        this.#elements.set(name, element);
                    } else {
                        foundAll = false;
                    }
                }

                if (foundAll) {
                    observer.disconnect();

                    this.#elements.set(
                        'answerBox',
                        this.#elements.get('answerField').parentElement
                    );

                    this.#startSession();
                }
            }

            const observer = new MutationObserver(findElements);

            findElements(null, observer);
            observer.observe(this.#app, {childList: true, subtree: true});
        }
    }

    class SynonymChecker {
        #session;

        #subjects;
        #allSynonyms;
        #allTwins;

        constructor(session) {
            this.#session = session;
            this.#fetchSubjects().then(this.#registerHooks.bind(this));
        }

        #fetchSubjects() {
            const url = 'https://raw.githubusercontent.com/panda-byte/'
                + 'kaniwani-synonym-checker/main/data/';

            return Promise.all([
                fetch(`${url}vocab_subjects.json`),
                fetch(`${url}vocab_synonyms.json`),
                fetch(`${url}twins.json`),
            ]).then(responses => Promise.all(responses.map(
                response => response.json()
            ))).then(objects => {
                this.#subjects = new Map(Object.entries(objects[0]));
                this.#allSynonyms = new Map(Object.entries(objects[1]));
                this.#allTwins = new Map(objects[2]);
            }).catch(() => {
                console.error("Could not fetch subjects!");
            });
        }

        #registerHooks() {
            this.#session.submitAnswerHook.register((session, event, data, messages) => {
            console.log("Answer submitted!");
            console.log(session);
            console.log(event);
            console.log(data);
            console.log(messages);
        }
    );
        }
    }

    Session.createSession().then(session => new SynonymChecker(session));
})();
