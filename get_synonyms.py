import json
import sys
from pprint import pprint
from typing import Any

import requests


def get_all_subjects(token): # -> list[dict[str, Any]]:
    url = 'https://api.wanikani.com/v2/subjects'
    headers = {
        'Wanikani-Revision': "20170710",
        'Authorization': f"Bearer {token}"
    }

    subjects = []

    while url is not None:
        response = requests.get(url, headers=headers).json()
        subjects += response['data']
        url = response['pages']['next_url']

    return subjects


def find_synonyms(subjects: dict[str: Any], quiet: bool = False,
                  only_primary: bool = False, store_characters: bool = False):
    # group by object type (kanji, vocabulary), remove radicals
    grouped_subjects = {'kanji': [], 'vocabulary': []}

    for subject in subjects:
        if subject['object'] in grouped_subjects.keys():
            subject['meanings'] = [subject['primary_meaning']]

            if not only_primary:
                subject['meanings'] += subject['other_meanings'] \
                                       + subject['auxiliary_meanings']

            grouped_subjects[subject['object']].append(subject)

    all_synonyms = {'kanji': {}, 'vocabulary': {}}

    for subject_type, subjects in grouped_subjects.items():
        all_meanings = sorted({
            meaning for subject in subjects for meaning in subject['meanings']
        })

        if not quiet:
            print(f"{subject_type}:")

        for i, meaning in enumerate(all_meanings, 1):
            if not quiet:
                print(f"{i} / {len(all_meanings)}\r")

            synonyms = [
                subject['characters'] if store_characters else subject['id']
                for subject in subjects if meaning in subject['meanings']
            ]

            if len(synonyms) > 1:
                all_synonyms[subject_type][meaning] = synonyms

        if not quiet:
            print("")

    return all_synonyms


def list_synonyms(synonyms: dict[str, dict[str, list[int]]]) -> str:
    pass


def simplify_subjects(full_subjects: list):
    # `accepted_answer` is always `true` for meanings.

    # In a few cases, there are multiple primary meanings:
    # https://www.wanikani.com/kanji/%E4%BC%9A
    # https://www.wanikani.com/vocabulary/%E7%88%B6%E8%A6%AA
    # https://www.wanikani.com/vocabulary/%E9%80%A3%E8%A6%87
    # https://www.wanikani.com/kanji/%E7%BE%A8
    # However, on the WaniKani page for them, only the first is
    # presented as a 'PRIMARY' meaning, while the others are displayed
    # as 'ALTERNATIVE' together with the `other_meanings` in order
    # of appearance in `other_meanings`. Thus, the same is done here,
    # using only the first 'primary' meaning as such, while the others
    # are put in `other_meanings`. Note also that the first meaning is
    # not always 'primary'.

    subjects = []

    for subject in full_subjects:
        if subject['data']['hidden_at'] is not None:
            continue

        first_primary_meaning = next(
            m['meaning'] for m in subject['data']['meanings'] if m['primary']
        )

        subjects.append({
            'id': subject['id'],
            'object': subject['object'],
            'characters': subject['data']['characters'],
            'document_url': subject['data']['document_url'],
            'primary_meaning': first_primary_meaning,
            'other_meanings': [
                m['meaning'] for m in subject['data']['meanings']
                if m['meaning'] != first_primary_meaning
            ],
            'auxiliary_meanings': [
                m['meaning']
                for m in subject['data']['auxiliary_meanings']
                if m['type'] == 'whitelist'
            ],
            'parts_of_speech':
                subject['data']['parts_of_speech']
                if subject['object'] == 'vocabulary' else None
        })

    return subjects


def print_by_num_synonyms():
    with open('synonyms.json', 'r', encoding='utf-8') as file:
        all_synonyms = json.load(file)

        for subject_type, synonyms in all_synonyms.items():
            print(subject_type)

            max_meaning = None
            max_value = 0

            synonyms_by_length = sorted([
                (meaning, len(synonym_ids))
                for meaning, synonym_ids in synonyms.items()
            ], key=lambda x: x[1])

            pprint(synonyms_by_length)


def get_twin_subjects(subjects: dict):
    """
    Get subjects which are identical in both primary and other
    meanings as well as the 'part of speech' (e.g. noun, suffix, etc.)
    attribute. These could present a problem for the userscript, as they
    are indistinguishable for the userscript, so the correct answer
    can't be determined based on the hints provided by KaniWani.
    They require special treatment by the userscript.
    """
    mapping = {}

    for subject in filter(lambda subject: subject['object'] == 'vocabulary',
                          subjects):
        hints = (subject['primary_meaning'], ) \
                + tuple(subject['other_meanings']) \
                + tuple(subject['parts_of_speech'])

        if hints in mapping:
            mapping[hints].append(subject['characters'])
        else:
            mapping[hints] = [subject['characters']]

    return [
        [meanings, vocabulary]
        for meanings, vocabulary in mapping.items()
        if len(vocabulary) > 1
    ]


def prepare_all_files(token: str):
    subjects = prepare_synonyms(token)
    synonyms = prepare_synonyms(subjects)

    prepare_userscript_files(subjects, synonyms)
    prepare_forum_post(subjects, synonyms)


def prepare_subjects(token: str):
    full_subjects = get_all_subjects(token)

    with open('full_subjects.json', 'w', encoding='utf-8') as file:
        json.dump(full_subjects, file, ensure_ascii=False)

    subjects = simplify_subjects(full_subjects)

    with open('subjects.json', 'w', encoding='utf-8') as file:
        json.dump(subjects, file, ensure_ascii=False)

    return subjects


def prepare_synonyms(subjects: list):
    synonyms = find_synonyms(subjects)

    with open('synonyms.json', 'w', encoding='utf-8') as file:
        json.dump(synonyms, file, ensure_ascii=False)

    return synonyms


def prepare_forum_post(subjects, synonyms):
    with open('forum_synonyms.txt', 'w', encoding='utf-8') as file:
        subjects = {subject['id']: subject for subject in subjects}

        for subject_type, synonyms_by_type in synonyms.items():
            file.write(f"[details='{subject_type.title()}']\n")

            for meaning, synonym_ids in synonyms_by_type.items():
                synonyms_formatted = ', '.join(
                    subjects[id]['characters'] for id in synonym_ids
                )

                file.write(f"* {meaning}: {synonyms_formatted}\n")

            file.write("[/details]\n")


def prepare_userscript_files(subjects, synonyms):
    synonym_subject_ids = set(
        v for values in synonyms['vocabulary'].values() for v in values
    )

    def _get_sub_dict(d, keys):
        return {k: d[k] for k in keys}

    vocab_subjects = {
        subject['id']: _get_sub_dict(subject, (
            'characters',
            'primary_meaning',
            'other_meanings',
            'auxiliary_meanings'
        )) for subject in subjects
        if subject['object'] == 'vocabulary'
           and subject['id'] in synonym_subject_ids
    }

    twins = get_twin_subjects(subjects)

    # pack structure for smaller size
    vocab_subjects = {
        id: [subject[k] for k in subject.keys()]
        for id, subject in vocab_subjects.items()
    }

    with open('vocab_subjects.json', 'w', encoding='utf-8') as file:
        json.dump(vocab_subjects, file, ensure_ascii=False)

    with open('vocab_synonyms.json', 'w', encoding='utf-8') as file:
        json.dump(synonyms['vocabulary'], file, ensure_ascii=False)

    with open('twins.json', 'w', encoding='utf-8') as file:
        json.dump(twins, file, ensure_ascii=False)


if __name__ == '__main__':
    # prepare_all_files(sys.argv[1])

    with (open('subjects.json', 'r', encoding='utf-8') as file_subjects,
          open('synonyms.json', 'r', encoding='utf-8') as file_synonyms):
        subjects = json.load(file_subjects)
        synonyms = json.load(file_synonyms)

        prepare_userscript_files(subjects, synonyms)
