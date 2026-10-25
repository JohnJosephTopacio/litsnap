// Acceptance criteria TERM-1…9 from docs/features/lookup-term.md.
// RED PHASE: `it.fails` until the implementation PR, which changes only `it.fails` → `it`.
import { describe, expect, it } from 'vitest';
import { countWords, displayTerm, MAX_LOOKUP_WORDS, normalise } from './term';

describe('normalise', () => {
  describe("TERM-1: the spec's rules", () => {
    it.fails.each([
      ['Hipped-Roof,', 'hipped roof'],
      ['  flying\n\tbuttress  ', 'flying buttress'],
      ['flying buttress', 'flying buttress'],
    ])('%j → %j', (selection, term) => {
      expect(normalise(selection)).toBe(term);
    });
  });

  describe('TERM-2: only surrounding punctuation is stripped', () => {
    it.fails.each([
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
    it.fails.each([
      ['soft hyphen', 'hip­ped'],
      ['zero-width space', 'hip​ped'],
      ['zero-width non-joiner', 'hip‌ped'],
      ['zero-width joiner', 'hip‍ped'],
      ['word joiner', 'hip⁠ped'],
      ['byte-order mark', '﻿hipped'],
    ])('%s', (_name, selection) => {
      expect(normalise(selection)).toBe('hipped');
    });
  });

  describe('TERM-4: Unicode is normalised to NFC, and accents are kept', () => {
    it.fails('a combining accent and a precomposed é give the same term', () => {
      expect(normalise('café')).toBe('café');
      expect(normalise('Café')).toBe('café');
    });
  });

  describe('TERM-5: curly quotes become straight', () => {
    it.fails.each([
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
    it.fails.each([
      ['roof—and', 'roof and'],
      ['1914–1918', '1914 1918'],
      ['and/or', 'and or'],
      ['mother‐in‐law', 'mother in law'],
      ['non‑breaking', 'non breaking'],
      ['figure‒dash', 'figure dash'],
      ['horizontal―bar', 'horizontal bar'],
      ['—roof—', 'roof'],
    ])('%j → %j', (selection, term) => {
      expect(normalise(selection)).toBe(term);
    });
  });

  describe('TERM-7: nothing left', () => {
    it.fails.each(['—', '  ', '!?', '­', ''])('%j → empty', (selection) => {
      expect(normalise(selection)).toBe('');
    });
  });
});

describe('countWords', () => {
  describe('TERM-8: counting words', () => {
    it.fails.each([
      ['hipped roof', 2],
      ['roof , and', 2],
      ['', 0],
      ['one two three four five six', 6],
      ['one two three four five six seven', 7],
    ])('%j → %i', (term, words) => {
      expect(countWords(term)).toBe(words);
    });

    it.fails('counts a hyphenated compound as its parts, once normalised', () => {
      expect(countWords(normalise('mother-in-law'))).toBe(3);
    });

    it('allows up to 6 words', () => {
      expect(MAX_LOOKUP_WORDS).toBe(6);
    });
  });
});

describe('displayTerm', () => {
  describe("TERM-9: display term keeps the book's casing", () => {
    it.fails.each([
      ['“Hipped-Roof,”', 'Hipped-Roof'],
      ['Mr.\n  Utterson', 'Mr. Utterson'],
      ['hip­ped', 'hipped'],
      ['Café', 'Café'],
      ['Gatsby’s', 'Gatsby’s'],
    ])('%j → %j', (selection, shown) => {
      expect(displayTerm(selection)).toBe(shown);
    });
  });
});
