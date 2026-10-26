// Acceptance criteria DEF-13 and DEF-14 from docs/features/definition-providers.md.
import { describe, expect, it } from 'vitest';
import { dictionaryApi } from '../../src/definitions/dictionaryApi';
import { fakeFetch, json, type Reply } from '../fakeFetch';
import {
  DICT_GABLE,
  DICT_GABLE_DEFINITION,
  DICT_MANY,
  DICT_NOT_FOUND,
  DICT_PARTLY_CREDITED,
  DICT_UNCREDITED,
  DICTIONARY_API,
} from '../fixtures/definitions';

async function lookUp(term: string, reply: Reply) {
  const fake = fakeFetch({ [DICTIONARY_API + encodeURIComponent(term)]: reply });
  return dictionaryApi.lookup(term, { fetch: fake.fetch, timeoutMs: 1000 });
}

describe('DEF-13: parsing', () => {
  it.fails('merges homographs by part of speech, in order of first appearance', async () => {
    expect(await lookUp('gable', json(DICT_GABLE))).toEqual({
      status: 'found',
      definition: DICT_GABLE_DEFINITION,
    });
  });

  it.fails('lowercases parts of speech and keeps 3 of them, with 5 senses each', async () => {
    const outcome = await lookUp('many', json(DICT_MANY));

    expect(outcome).toMatchObject({
      status: 'found',
      definition: {
        entries: [
          { partOfSpeech: 'noun', senses: ['n1', 'n2', 'n3', 'n4', 'n5'] },
          { partOfSpeech: 'verb', senses: ['v1'] },
          { partOfSpeech: 'adjective', senses: ['a1'] },
        ],
      },
    });
  });

  it.fails('its 404 body is not found', async () => {
    expect(await lookUp('roof', json(DICT_NOT_FOUND, 404))).toEqual({ status: 'not-found' });
  });
});

describe('DEF-14: attribution, or nothing', () => {
  it.fails('skips entries without a licence or a source URL', async () => {
    expect(await lookUp('eave', json(DICT_PARTLY_CREDITED))).toEqual({
      status: 'found',
      definition: {
        from: 'dictionary',
        entries: [{ partOfSpeech: 'noun', senses: ['The lower edge of a roof.'] }],
        source: {
          sourceName: 'Wiktionary (via Free Dictionary API)',
          sourceUrl: 'https://en.wiktionary.org/wiki/eaves',
          licence: 'CC BY-SA 3.0',
          licenceUrl: 'https://example.org/licence',
        },
      },
    });
  });

  it.fails.each([
    ['no credited entries', DICT_UNCREDITED],
    ['no entries', []],
  ])('%s is not found', async (_name, body) => {
    expect(await lookUp('eave', json(body))).toEqual({ status: 'not-found' });
  });
});
