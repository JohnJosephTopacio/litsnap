// Acceptance criteria TERM-1…9 from docs/features/lookup-term.md.
import { describe, expect, it } from 'vitest';
import { countWords, displayTerm, MAX_LOOKUP_WORDS, normalise } from './term';

describe('normalise', () => {
  describe("TERM-1: the spec's rules", () => {
    it.each([
      ['Hipped-Roof,', 'hipped roof'],
      ['  flying\n\tbuttress  ', 'flying buttress'],
      ['flying\u00A0buttress', 'flying buttress'],
    ])('%j → %j', (selection, term) => {
      expect(normalise(selection)).toBe(term);
    });
  });

  describe('TERM-2: only surrounding punctuation is stripped', () => {
    it.each([
      ['“(buttress)!”', 'buttress'],
      ['U.S.', 'u.s'],
      ["o'clock", "o'clock"],
      ["Gatsby's", "gatsby's"],
      ['roofs', 'roofs'],
    ])('%j → %j', (selection, term) => {
      expect(normalise(selection)).toBe(term);
    });
  });

  describe('TERM-3: invisible characters are removed', () => {
    it.each([
      ['soft hyphen', 'hip\u00ADped'],
      ['zero-width space', 'hip\u200Bped'],
      ['zero-width non-joiner', 'hip\u200Cped'],
      ['zero-width joiner', 'hip\u200Dped'],
      ['word joiner', 'hip\u2060ped'],
      ['byte-order mark', '\uFEFFhipped'],
    ])('%s', (_name, selection) => {
      expect(normalise(selection)).toBe('hipped');
    });
  });

  describe('TERM-4: Unicode is normalised to NFC, and accents are kept', () => {
    it('a combining accent and a precomposed \u00E9 give the same term', () => {
      expect(normalise('cafe\u0301')).toBe('caf\u00E9');
      expect(normalise('Caf\u00E9')).toBe('caf\u00E9');
    });
  });

  describe('TERM-5: curly quotes become straight', () => {
    it.each([
      ['Gatsby’s', "gatsby's"],
      ['Gatsbyʼs', "gatsby's"],
      ['‘tis', 'tis'],
      ['“roof”', 'roof'],
      ['the “roof” tile', 'the "roof" tile'],
    ])('%j → %j', (selection, term) => {
      expect(normalise(selection)).toBe(term);
    });
  });

  describe('TERM-6: dashes and slashes separate words', () => {
    it.each([
      ['roof—and', 'roof and'],
      ['1914–1918', '1914 1918'],
      ['and/or', 'and or'],
      ['mother\u2010in\u2010law', 'mother in law'],
      ['non\u2011breaking', 'non breaking'],
      ['figure\u2012dash', 'figure dash'],
      ['horizontal\u2015bar', 'horizontal bar'],
      ['—roof—', 'roof'],
    ])('%j → %j', (selection, term) => {
      expect(normalise(selection)).toBe(term);
    });
  });

  describe('TERM-7: nothing left', () => {
    it.each(['—', '  ', '!?', '\u00AD', ''])('%j → empty', (selection) => {
      expect(normalise(selection)).toBe('');
    });
  });
});

describe('countWords', () => {
  describe('TERM-8: counting words', () => {
    it.each([
      ['hipped roof', 2],
      ['roof , and', 2],
      ['', 0],
      ['one two three four five six', 6],
      ['one two three four five six seven', 7],
    ])('%j → %i', (term, words) => {
      expect(countWords(term)).toBe(words);
    });

    it('counts a hyphenated compound as its parts, once normalised', () => {
      expect(countWords(normalise('mother-in-law'))).toBe(3);
    });

    it('allows up to 6 words', () => {
      expect(MAX_LOOKUP_WORDS).toBe(6);
    });
  });
});

describe('displayTerm', () => {
  describe("TERM-9: display term keeps the book's casing", () => {
    it.each([
      ['“Hipped-Roof,”', 'Hipped-Roof'],
      ['Mr.\n  Utterson', 'Mr. Utterson'],
      ['hip\u00ADped', 'hipped'],
      ['Cafe\u0301', 'Caf\u00E9'],
      ['Gatsby’s', 'Gatsby’s'],
    ])('%j → %j', (selection, shown) => {
      expect(displayTerm(selection)).toBe(shown);
    });
  });
});
