// Acceptance criteria DEF-6…12 from docs/features/definition-providers.md.
import { describe, expect, it } from 'vitest';
import { wiktionary } from '../../src/definitions/wiktionary';
import { fakeFetch, json, status, type Reply } from '../fakeFetch';
import {
  CC_BY_SA_4,
  WIKT_HIP_ROOF,
  WIKT_HIP_ROOF_ENTRIES,
  WIKT_HIPPED_ROOF,
  WIKT_HIPPED_ROOF_WITH_EMPTY_SENSE,
  WIKT_HIPPED_ROOFS,
  WIKT_LEFT,
  WIKT_MANY,
  WIKT_MARKUP,
  WIKT_MARKUP_SENSES,
  WIKT_MIXED_LANGUAGES,
  WIKT_NO_ENGLISH,
  WIKT_OCLOCK,
  WIKT_OCLOCK_MISSPELLING,
  WIKT_ROOF,
  WIKT_ROOF_ENTRIES,
  WIKT_ROOFS,
  WIKT_TRANSLINGUAL_ONLY,
  WIKTIONARY,
} from '../fixtures/definitions';

/** Looks `term` up with Wiktionary pages served by title (`hip_roof`). */
async function lookUp(term: string, pages: Record<string, Reply>) {
  const fake = fakeFetch(
    Object.fromEntries(Object.entries(pages).map(([title, reply]) => [WIKTIONARY + title, reply])),
  );
  const outcome = await wiktionary.lookup(term, { fetch: fake.fetch, timeoutMs: 1000 });
  return { outcome, fake };
}

const source = (title: string) => ({
  sourceName: 'Wiktionary',
  sourceUrl: `https://en.wiktionary.org/wiki/${title}`,
  ...CC_BY_SA_4,
});

const found = (definition: object) => ({ status: 'found', definition });

describe('DEF-6: English entries only', () => {
  it('ignores Translingual and other languages', async () => {
    const { outcome } = await lookUp('roof', { roof: json(WIKT_MIXED_LANGUAGES) });

    expect(outcome).toEqual(
      found({
        from: 'dictionary',
        entries: [{ partOfSpeech: 'noun', senses: ['An English sense.'] }],
        source: source('roof'),
      }),
    );
  });

  it.each([
    ['other languages', WIKT_NO_ENGLISH],
    ['Translingual', WIKT_TRANSLINGUAL_ONLY],
    ['an empty response', {}],
  ])('only %s is not found', async (_name, body) => {
    const { outcome } = await lookUp('hund', { hund: json(body) });

    expect(outcome).toEqual({ status: 'not-found' });
  });
});

describe('DEF-7: senses become plain text', () => {
  it('strips markup, decodes entities, collapses whitespace and drops empty senses', async () => {
    const { outcome } = await lookUp('roof', { roof: json(WIKT_MARKUP) });

    expect(outcome).toEqual(
      found({
        from: 'dictionary',
        entries: [{ partOfSpeech: 'proper noun', senses: WIKT_MARKUP_SENSES }],
        source: source('roof'),
      }),
    );
  });

  it('leaves out examples and other languages', async () => {
    const { outcome } = await lookUp('roof', { roof: json(WIKT_ROOF) });

    expect(outcome).toEqual(
      found({ from: 'dictionary', entries: WIKT_ROOF_ENTRIES, source: source('roof') }),
    );
  });
});

describe('DEF-8: limits', () => {
  it('keeps 3 parts of speech and 5 senses each', async () => {
    const { outcome } = await lookUp('many', { many: json(WIKT_MANY) });

    expect(outcome).toEqual(
      found({
        from: 'dictionary',
        entries: [
          { partOfSpeech: 'noun', senses: ['n1', 'n2', 'n3', 'n4', 'n5'] },
          { partOfSpeech: 'verb', senses: ['v1'] },
          { partOfSpeech: 'adjective', senses: ['a1'] },
        ],
        source: source('many'),
      }),
    );
  });
});

describe('DEF-9: attribution', () => {
  it('credits Wiktionary with the page and its licence', async () => {
    const { outcome } = await lookUp('hip roof', { hip_roof: json(WIKT_HIP_ROOF) });

    expect(outcome).toEqual(
      found({
        from: 'dictionary',
        entries: WIKT_HIP_ROOF_ENTRIES,
        source: {
          sourceName: 'Wiktionary',
          sourceUrl: 'https://en.wiktionary.org/wiki/hip_roof',
          licence: 'CC BY-SA 4.0',
          licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
        },
      }),
    );
  });
});

describe('DEF-10: a term whose only senses point elsewhere is followed once', () => {
  it('hipped roof → hip roof', async () => {
    const { outcome, fake } = await lookUp('hipped roof', {
      hipped_roof: json(WIKT_HIPPED_ROOF),
      hip_roof: json(WIKT_HIP_ROOF),
    });

    expect(outcome).toEqual(
      found({
        from: 'dictionary',
        entries: WIKT_HIP_ROOF_ENTRIES,
        note: 'Synonym of hip roof.',
        source: source('hip_roof'),
      }),
    );
    expect(fake.urls()).toEqual([`${WIKTIONARY}hipped_roof`, `${WIKTIONARY}hip_roof`]);
  });

  it('roofs → roof, with the first letter of the note capitalised', async () => {
    const { outcome } = await lookUp('roofs', {
      roofs: json(WIKT_ROOFS),
      roof: json(WIKT_ROOF),
    });

    expect(outcome).toEqual(
      found({
        from: 'dictionary',
        entries: WIKT_ROOF_ENTRIES,
        note: 'Plural of roof',
        source: source('roof'),
      }),
    );
  });

  it('the target is not followed again', async () => {
    const { outcome, fake } = await lookUp('hipped roofs', {
      hipped_roofs: json(WIKT_HIPPED_ROOFS),
      hipped_roof: json(WIKT_HIPPED_ROOF),
    });

    expect(outcome).toEqual(
      found({
        from: 'dictionary',
        entries: [{ partOfSpeech: 'noun', senses: ['Synonym of hip roof.'] }],
        note: 'Plural of hipped roof',
        source: source('hipped_roof'),
      }),
    );
    expect(fake.urls()).toHaveLength(2);
  });
});

describe("DEF-11: if the target can't be used, the cross-references are shown as they are", () => {
  it.each([
    ['is not found', status(404)],
    ['fails', status(503)],
    ['has no English senses', json(WIKT_NO_ENGLISH)],
  ])('the target %s', async (_name, target) => {
    const { outcome } = await lookUp('hipped roof', {
      hipped_roof: json(WIKT_HIPPED_ROOF),
      hip_roof: target,
    });

    expect(outcome).toEqual(
      found({
        from: 'dictionary',
        entries: [{ partOfSpeech: 'noun', senses: ['Synonym of hip roof.'] }],
        source: source('hipped_roof'),
      }),
    );
  });
});

describe("DEF-12: mixed senses aren't followed", () => {
  it('shows every sense, cross-references included, from one request', async () => {
    const { outcome, fake } = await lookUp('left', { left: json(WIKT_LEFT) });

    expect(outcome).toEqual(
      found({
        from: 'dictionary',
        entries: [
          { partOfSpeech: 'verb', senses: ['simple past of leave'] },
          { partOfSpeech: 'adjective', senses: ['On the west side when facing north.'] },
        ],
        source: source('left'),
      }),
    );
    expect(fake.urls()).toEqual([`${WIKTIONARY}left`]);
  });
});

// Added by the implementation PR's mutation checks.

describe('DEF-10: more cross-references', () => {
  it('an empty sense next to the cross-reference does not stop the follow', async () => {
    const { outcome } = await lookUp('hipped roof', {
      hipped_roof: json(WIKT_HIPPED_ROOF_WITH_EMPTY_SENSE),
      hip_roof: json(WIKT_HIP_ROOF),
    });

    expect(outcome).toMatchObject(found({ note: 'Synonym of hip roof.' }));
  });

  it("decodes entities in the target's title", async () => {
    const { outcome } = await lookUp('oclock', {
      oclock: json(WIKT_OCLOCK_MISSPELLING),
      "o'clock": json(WIKT_OCLOCK),
    });

    expect(outcome).toEqual(
      found({
        from: 'dictionary',
        entries: [{ partOfSpeech: 'adverb', senses: ['According to the clock.'] }],
        note: "Misspelling of o'clock.",
        source: source("o'clock"),
      }),
    );
  });
});
