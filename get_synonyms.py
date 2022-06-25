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
                subject['meanings'] += subject['other_meanings']

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


def simplify_subjects(full_subjects: dict):
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
            ]
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


def get_identical_vocab_synonyms(subjects: dict):
    """
    Get subjects which are identical in both primary in secondary
    meanings. These could present a problem for the userscript.
    """
    meanings_mapping = {}

    for subject in filter(lambda subject: subject['object'] == 'vocabulary',
                          subjects):
        meanings = tuple(m['meanings'] for m in subject['data']['meanings'])

        if meanings in meanings_mapping:
            meanings_mapping[meanings].append(subject['characters'])
        else:
            meanings_mapping[meanings] = [subject['characters']]

    return {
        meanings: vocabulary
        for meanings, vocabulary in meanings_mapping.items()
        if len(vocabulary) > 1
    }

if __name__ == '__main__':
    # token = sys.argv[1]


    # with open('full_subjects.json', 'w', encoding='utf-8') as file:
    #     json.dump(get_all_subjects(token),
    #               file, ensure_ascii=False)

    with (
        open('full_subjects.json', 'r', encoding='utf-8') as file_full_subjects,
        open('subjects.json', 'w', encoding='utf-8') as file_subjects
    ):
        subjects = simplify_subjects(json.load(file_full_subjects))
        json.dump(subjects, file_subjects, ensure_ascii=False)


    #
    # with (open('subjects.json', 'r', encoding='utf-8') as file_subjects,
    #       open('synonyms.json', 'w', encoding='utf-8') as file_synonyms):
    #     subjects = json.load(file_subjects)
    #     json.dump(find_synonyms(subjects), file_synonyms, ensure_ascii=False)
    #
    # # format for forum post:
    # with (open('synonyms.json', 'r', encoding='utf-8') as file_synonyms,
    #       open('subjects.json', 'r', encoding='utf-8') as file_subjects,
    #       open('synonyms.txt', 'w', encoding='utf-8') as file_text):
    #     all_synonyms = json.load(file_synonyms)
    #     subjects = {
    #         subject['id']: subject for subject in json.load(file_subjects)
    #     }
    #
    #     for subject_type, synonyms in all_synonyms.items():
    #         file_text.write(f"[details='{subject_type.title()}']\n")
    #
    #         for meaning, synonym_ids in synonyms.items():
    #             synonyms_formatted = ', '.join(
    #                 subjects[id]['characters'] for id in synonym_ids
    #             )
    #
    #             file_text.write(f"* {meaning}: {synonyms_formatted}\n")
    #
    #         file_text.write("[/details]\n")

    #
    # with open('full_subjects.json', 'r', encoding='utf-8') as file:
    #     print(get_identical_vocab_synonyms(json.load(file)))
    #
