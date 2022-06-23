import functools
import json
from pathlib import Path
from pprint import pprint
from typing import Any

import requests


def get_all_subjects(token):  # -> list[dict[str, Any]]:
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
                  only_primary: bool = False, store_slug: bool = False):
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
                subject['slug'] if store_slug else subject['id']
                for subject in subjects if meaning in subject['meanings']
            ]

            if len(synonyms) > 1:
                all_synonyms[subject_type][meaning] = synonyms

        if not quiet:
            print("")

    return all_synonyms


def list_synonyms(synonyms: dict[str, dict[str, list[int]]]) -> str:
    pass


def extract_meanings():
    with (open('full_subjects.json', 'r', encoding='utf-8') as file_full_subjects,
          open('subjects.json', 'w', encoding='utf-8') as file_meanings):
        full_subjects = json.load(file_full_subjects)

        subjects = []

        for full_subject in full_subjects:
            primary_meaning = \
                next(m['meaning'] for m in full_subject['data']['meanings']
                     if m['primary'])

            other_meanings = \
                [m['meaning'] for m in full_subject['data']['meanings']
                 if not m['primary']] \
                + [m['meaning'] for m in full_subject['data']['auxiliary_meanings']
                   if m['type'] == 'whitelist']

            subjects.append({
                'id': full_subject['id'],
                'object': full_subject['object'],
                'slug': full_subject['data']['slug'],
                'document_url': full_subject['data']['document_url'],
                'primary_meaning': primary_meaning,
                'other_meanings': other_meanings
            })

        json.dump(subjects, file_meanings)


if __name__ == '__main__':
    # token = args[1]
    #
    # with open('full_subjects.json', 'w', encoding='utf-8') as file:
    #     json.dump(get_all_subjects(token),
    #               file, ensure_ascii=False)

    # extract_meanings()
    #
    # with open('subjects.json', 'r', encoding='utf-8') as file:
    #     full_subjects = json.load(file)
    #
    # grouped_synonyms = find_synonyms(full_subjects)
    #
    # with open('synonyms.json', 'w', encoding='utf-8') as file:
    #     json.dump(grouped_synonyms, file)
    #
    # pprint(grouped_synonyms)
    #
    # with open('synonyms.json', 'r', encoding='utf-8') as file:
    #     grouped_synonyms = json.load(file)
    #
    # with open('subjects.json', 'r', encoding='utf-8') as file:
    #     full_subjects = json.load(file)
    #
    # # grouped_synonyms = dict(sorted(all_synonyms.items(), key=lambda x: len(x[1]), reverse=True))
    #
    # for subject_type, synonyms in grouped_synonyms:
    #     for meaning, ids in synonyms.items():
    #         subjects = filter(lambda subject: subject['id'] in ids, full_subjects)
    #         subjects = [f"{subject['object']} ({subject['data']['slug']})" for subject in subjects]
    #
    #         print(f"{meaning}: {','.join(subjects)})")
    #         exit()
    #

    # three types of synonyms:
    # main

    # extract_meanings()
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
    #                 subjects[id]['slug'] for id in synonym_ids
    #             )
    #
    #             file_text.write(f"* {meaning}: {synonyms_formatted}\n")
    #
    #         file_text.write("[/details]\n")

    with (open('synonyms.json', 'r', encoding='utf-8') as file_synonyms,
          open('subjects.json', 'r', encoding='utf-8') as file_subjects):
        all_synonyms = json.load(file_synonyms)
        subjects = {
            subject['id']: subject for subject in json.load(file_subjects)
        }

        for subject_type, synonyms in all_synonyms.items():
            print(subject_type)

            max_meaning = None
            max_value = 0

            for meaning, synonym_ids in synonyms.items():
                if len(synonym_ids) > max_value:
                    max_value = len(synonym_ids)
                    max_meaning = meaning

            print(f"{max_meaning}: {max_value}")

