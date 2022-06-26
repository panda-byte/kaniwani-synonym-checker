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

(function() {
    'use strict';

    const allTwins = new Map([
        [["Fire", "noun"], ["火", "火事"]],
        [["To Be Born", "intransitive verb", "ichidan verb"]]
    ]);

    // TODO get only subjects with synonyms
    const subjects = {
        "2467": {
            "characters": "一",
            "primary_meaning": "One",
            "other_meanings": [],
            "auxiliary_meanings": ["1"]
        },
        "2468": {
            "characters": "一つ",
            "primary_meaning": "One Thing",
            "other_meanings": [],
            "auxiliary_meanings": ["1 Thing"]
        }
    };
    const allSynonyms = {
        "1 Thing": [2468, 4258],
        "1 Volume": [4173, 4823]
    };

    // set cooldown time in ms for blocking enter on wrong answer
    const cooldownTime = 1000;

    let answerField = null;
    let answerBox = null;
    let primaryMeaningElement = null;
    let otherMeaningsElement = null;
    let partsOfSpeechElement = null; // sc-1m1r938-0

    let inReviewSession = false;

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


    const submitAnswer = event => {
        if (!(inReviewSession && answerBox !== null)) {
            answerIncorrect = false;
            return;
        }

        const primaryMeaning = primaryMeaningElement.textContent;
        const otherMeaningsString = otherMeaningsElement.textContent;
        const otherMeanings =
            otherMeaningsString ? otherMeaningsString.split(', ') : [];

        const partsOfSpeech = [
            ...partsOfSpeechElement.querySelectorAll('li > span')
        ].map(span => span.textContent);

        const answer = answerField.value;

        const meanings = [primaryMeaning, ...otherMeanings];
        const hints = meanings + partsOfSpeech
        const synonyms = meanings.map(meaning => allSynonyms[meaning])
                                 .filter(meaning => meaning !== undefined);

        const twins = allTwins.get(hints);

        if (!synonyms) {
            return;
        }



        if (!synonyms && twins) {
            // TODO check if answer correct
            // TODO create userscript that let's player try twice
        }

        event.stopPropagation();

        // TODO make options about storing synonyms


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

                primaryMeaningElement = document.querySelector(
                    'div[data-question-primary]'
                )

                otherMeaningsElement = document.querySelector(
                    'div[data-question-secondary]'
                );

                partsOfSpeechElement = document.querySelector(
                    'ul.sc-1m1r938-0'
                );

                if (![answerField, answerBox, primaryMeaningElement, otherMeaningsElement, partsOfSpeechElement].includes(null)) {
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
            primaryMeaningElement = null;
            otherMeaningsElement = null;
            partsOfSpeechElement = null;
        }

        inReviewSession = hasSessionStarted;
    }, 200);
})();
