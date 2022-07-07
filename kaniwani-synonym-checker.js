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

    class Hook {
        #callbacks;

        constructor() {
            this.#callbacks = [];
        }

        register(callback) {
            this.#callbacks.push(callback);
        }

        call(session = null, event = null, data = null) {
            const messages = []

            for (const callback of this.#callbacks) {
                const result = callback(session, event, data, messages);

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
        sessionStartHook = new Hook();
        sessionEndHook = new Hook();
        submitAnswerHook = new Hook();

        #selectors = new Map([
            ['answerField', '#answer'],
            ['questionBox', 'div.lltPfd'],
            ['primary', 'div[data-question-primary]'],
            ['secondary', 'div[data-question-secondary]'],
            ['partsOfSpeech', 'ul.hyPboY'],
            ['submitButton', 'button[aria-label="Submit answer"]'],
        ]);

        #elements = new Map();

        constructor() {
            this.checkIfInReviewSession();
        }

        static states = Object.freeze({
            NOT_IN_SESSION: Symbol('NOT_IN_SESSION'),
            AWAIT_ANSWER: Symbol('AWAIT_ANSWER'),
            AWAIT_CONFIRMATION: Symbol('AWAIT_CONFIRMATION'),
        });

        #currentState = Session.states.NOT_IN_SESSION;

        get currentState(){
            return this.#currentState;
        }

        #setCurrentState(state) {
            console.log("New state: ");
            console.log(state);

            this.#currentState = state;
        }

        inSession() {
            return this.#currentState !== Session.states.NOT_IN_SESSION
        }

        #startSession() {
            console.log("Session started!");

            window.addEventListener(
                'click', this.#clickListener.bind(this), {capture: true}
            );

            window.addEventListener(
                'keydown', this.#keyDownListener.bind(this), {capture: true}
            );

            this.sessionStartHook.call(this);
        }

        #endSession() {
            console.log("Session ended!");
            this.sessionEndHook.call(this);
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
                if (this.#currentState === Session.states.AWAIT_CONFIRMATION) {
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

            if (!this.submitAnswerHook.call(this, event, data)) {
                console.log("Submitting answer was stopped by callback!");
                return;
            }

            this.#setCurrentState(Session.states.AWAIT_CONFIRMATION);
        }

        #ignoreResult() {
            this.#setCurrentState(Session.states.AWAIT_ANSWER);
        }

        checkIfInReviewSession() {
            setInterval(() => {
                if (Session.#checkSessionURL()) {
                    if (!this.inSession()) {
                        this.#setCurrentState(Session.states.AWAIT_ANSWER);
                        this.#initSession();
                    }
                } else {
                    if (this.inSession()) {
                        this.#setCurrentState(Session.states.NOT_IN_SESSION);
                        this.#endSession();
                    }
                }
            }, 100);
        }

        static #checkSessionURL() {
            return document.URL.endsWith('/reviews/session');
        }

        #initSession() {
            const findElements = setInterval(() => {
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
                    clearInterval(findElements);

                    this.#elements.set(
                        'answerBox',
                        this.#elements.get('answerField').parentElement
                    );

                    this.#startSession()
                }
            }, 100);
        }
    }

    const session = new Session();

    session.sessionStartHook.register(
        () => console.log(session)
    );

    session.submitAnswerHook.register((session, event, data, messages) => {
            console.log("Answer submitted!");
            console.log(session);
            console.log(event);
            console.log(data);
            console.log(messages);
        }
    );

    const gitURL = "https://raw.githubusercontent.com/panda-byte/kaniwani-synonym-checker/main/data/";

    let [subjectsObject, allSynonymsObject, allTwinsLists]
            = (await Promise.all([
        Promise.all([
            fetch(gitURL + "vocab_subjects.json"),
            fetch(gitURL + "vocab_synonyms.json"),
            fetch(gitURL + "twins.json"),
        ]).then(responses =>
            Promise.all(responses.map(response => response.json()))
        )
    ]))[0];



    const subjects = new Map(Object.entries(subjectsObject));
    const allSynonyms = new Map(Object.entries(allSynonymsObject));
    const allTwins = new Map(allTwinsLists);

    // set cooldown time in ms for blocking enter on wrong answer
    const cooldownTime = 1000;

    let answerField = null;
    let answerBox = null;
    let questionBox = null;
    let primaryMeaningElement = null;
    let otherMeaningsElement = null;
    let partsOfSpeechElement = null; // sc-1m1r938-0

    let inReviewSession = false;
    let ready = false;

    let answerIncorrect = false;
    let cooldown = false;
    const red = 'rgb(226, 50, 91)';

    window.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            submitAnswer(event);

            // if (answerIncorrect && cooldown) {
            //     event.stopPropagation();
            // }
        }
    }, true);

    // check if subject in question has twins
    session.submitAnswerHook.register((session, event, data, messages) => {
        const twins = allTwins.get([
            data.question.primary,
            ...data.question.secondary,
            ...data.question.partsOfSpeech
        ]);

        if (twins) {
            console.log("Twins!");
            console.log(twins);
            event.stopPropagation();
            return false;
        } else {
            console.log("No twins!");
            return true;
        }
    });

    const submitAnswer = async event => {
        if (!(ready && answerBox !== null)) {
            answerIncorrect = false;
            return;
        }

        console.log("----------------------------------------------");

        const primaryMeaning = primaryMeaningElement.textContent;
        const otherMeaningsString = otherMeaningsElement.textContent;
        const otherMeanings =
            otherMeaningsString ? otherMeaningsString.split(', ') : [];

        const partsOfSpeech = [
            ...partsOfSpeechElement.querySelectorAll('li > span')
        ].map(span => span.textContent);

        let answer = answerField.value;

        if (answer.endsWith('n')) {
            answer = answer.replace('n', 'ん');
        }

        console.log(`Answer: ${answer}`);

        const meanings = [primaryMeaning, ...otherMeanings];
        const hints = meanings + partsOfSpeech
        const synonyms = [...new Set(meanings
            .map(meaning => allSynonyms.get(meaning))
            .filter(synonymId => synonymId !== undefined)
            .flat()
        )].map(synonymId => subjects.get(synonymId.toString()));

        const synonymousAnswers
            = synonyms.map(synonym => synonym['characters'] + " (" + synonym['readings'] + ")");

        const twins = allTwins.get(hints);

        console.log(`Twins: ${twins}`);
        console.log(`Synonyms: ${synonymousAnswers}`);

        const matchingSynonym = synonyms.filter(synonym =>
            [synonym['characters'], ...synonym['readings']].includes(answer)
        );

        console.log(`Matching synonym:`);
        console.log(matchingSynonym[0]);

        // not possible due to CORS violation at the moment
        // get Jisho.org synonyms
        // const controller = new AbortController()
        // setTimeout(() => controller.abort(), 1000)
        //
        // const jishoMeanings = await fetch(
        //     "https://jisho.org/api/v1/search/words?keyword="
        //     + encodeURIComponent(answer),
        //     {signal: controller.signal}
        // ).then(response => response.json());

        console.log("Jisho: ");
        console.log(jishoMeanings);

        if (!(synonyms.length > 0) || !(matchingSynonym.length > 0)) {
            console.log("No synonyms found or answer not in synonyms!");
            return;
        }

        if (twins) {
            console.log(`Twins found: ${twins}`);
            return;
            // TODO check if answer correct
            // TODO create userscript that let's player try twice
        }

        // find correct answer
        const correctSubject = [...subjects.values()].filter(subject =>
            subject['primary_meaning'] === primaryMeaning
            && subject['other_meanings'].every(
                (value, index) => value === otherMeanings[index]
               )
        );

        if (correctSubject.length === 0) {
            throw "No correct answer found!";
        } else if (correctSubject.length > 1) {
            throw "Multiple correct answers found!";
        }

        console.log(`Correct subject:`);
        console.log(correctSubject[0]);


        // const correctAnswers = [
        //     correctSubject[0]['characters'], ...correctSubject[0]['readings']
        // ];
        //
        // console.log(`correct: ${correctAnswers}`);

        if (correctSubject[0] === matchingSynonym[0]) {
            console.log("Answer was correct!");
            return;
        }

        console.log("Answer was incorrect!");

        // TODO event is currently not stopped!
        event.stopPropagation();

        // TODO make options about storing synonyms

        // TODO: always: if not correct, try again

        // check with small delay
        // setTimeout(() => {
        //     const isIncorrect
        //     = window.getComputedStyle(answerBox).backgroundColor === red;
        //
        //     // start cooldown if it changed to incorrect
        //     if (isIncorrect && !answerIncorrect) {
        //         cooldown = true;
        //         setTimeout(() => {
        //             cooldown = false;
        //         }, cooldownTime);
        //     }
        //
        //     answerIncorrect = isIncorrect;
        // }, 10);
    };

    // //  update state of answer inbetween
    // // accounts for ignoring wrong answers etc. to reset state
    // // regardless
    // setInterval(() => {
    //     if (!(inReviewSession && answerBox !== null)) {
    //         answerIncorrect = false;
    //         return;
    //     }
    //
    //     answerIncorrect = window.getComputedStyle(answerBox).backgroundColor === red;
    // }, 200);

    // check if user entered review session
})();
