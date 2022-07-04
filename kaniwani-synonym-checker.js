// ==UserScript==
// @name         KaniWani Synonym Checker
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Checks for synonyms before answer is submit.
// @author       You
// @match        https://www.kaniwani.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=kaniwani.com
// @grant        none
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

        call(event) {
            this.#callbacks.map(callback => callback())
        }

        clear() {
            this.#callbacks = [];
        }
    }

    class SessionManager {
        #inSession;
        sessionStartHook = new Hook();
        sessionEndHook = new Hook();

        #selectors = new Map([
            ['answerField', '#answer'],
            ['questionBox', 'div.lltPfd'],
            ['primary', 'div[data-question-primary]'],
            ['secondary', 'div[data-question-secondary]'],
            ['partsOfSpeech', 'ul.hyPboY'],
        ]);

        #elements = new Map();

        constructor() {
            this.waitForSessionStart();
        }

        get inSession() {
            return this.#inSession;
        }

        #setSession(value) {
            if (this.#inSession === value) {
                return;
            }

            this.#inSession = value;

            if (this.#inSession) {
                this.#startSession();
            } else {
                this.#endSession();
            }
        }

        #startSession() {
            this.sessionStartHook.call();
        }

        #endSession() {
            this.sessionEndHook.call();
            this.#elements.clear();
        }

        waitForSessionStart() {
            const waitInterval = setInterval(() => {
                if (SessionManager.#checkSessionURL()) {
                    clearInterval(waitInterval);
                    this.#setupElements();
                }
            }, 100);
        }



        static #checkSessionURL() {
            return document.URL.endsWith('/reviews/session');
        }

        #setupElements() {
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

                    this.#setSession(true);
                }
            }, 100);
        }
    }

    const session = new SessionManager();

    session.sessionStartHook.register(
        () => console.log(session)
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
    setInterval(() => {
        const hasSessionStarted = document.URL.endsWith('/reviews/session');

        if (hasSessionStarted === inReviewSession) return;

        if (hasSessionStarted) {
            // try to find relevant page elements
            const findPageElements = setInterval(() => {
                answerField = document.getElementById('answer');

                if (answerField !== null) {
                    answerBox = answerField.parentElement;
                }

                questionBox = document.querySelector('div.lltPfd');

                primaryMeaningElement = document.querySelector(
                    'div[data-question-primary]'
                );

                otherMeaningsElement = document.querySelector(
                    'div[data-question-secondary]'
                );

                partsOfSpeechElement = document.querySelector('ul.hyPboY');

                if (![answerField, answerBox, primaryMeaningElement, otherMeaningsElement, partsOfSpeechElement].includes(null)) {
                    ready = true;
                    clearInterval(findPageElements);
                }
            }, 100);

            const findSubmitButton = setInterval(() => {
                const submitButton = document.querySelector('button[aria-label="Submit answer"]');

                if (submitButton === null) return;

                clearInterval(findSubmitButton);
                submitButton.addEventListener('click', event => {
                    submitAnswer(event);
                }, true);
            }, 100);
        } else {
            answerField = null;
            answerBox = null;
            questionBox = null;
            primaryMeaningElement = null;
            otherMeaningsElement = null;
            partsOfSpeechElement = null;

            ready = false;
        }

        inReviewSession = hasSessionStarted;
    }, 200);
})();
