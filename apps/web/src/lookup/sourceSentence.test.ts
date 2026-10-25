// Acceptance criteria TERM-10…17 from docs/features/lookup-term.md.
// RED PHASE: `it.fails` until the implementation PR, which changes only `it.fails` → `it`.
import { describe, expect, it } from 'vitest';
import { MAX_SENTENCE_LENGTH, sourceSentence, type SourceSentence } from './sourceSentence';
import { bookBody, select } from './testing/select';

const whole = ({ before, match, after }: SourceSentence) => before + match + after;

describe('sourceSentence', () => {
  describe('TERM-10: the sentence around the selection', () => {
    it.fails('returns the sentence split around the selection', () => {
      const body = bookBody(
        '<p>The door was shut. The house had a hipped roof and two chimneys. Nobody came.</p>',
      );
      expect(sourceSentence(select(body, 'hipped roof'))).toEqual({
        before: 'The house had a ',
        match: 'hipped roof',
        after: ' and two chimneys.',
      });
    });

    it.fails('treats a heading with no final punctuation as one sentence', () => {
      const body = bookBody('<p>Before.</p><h2>The Hipped Roof of the Old House</h2>');
      expect(sourceSentence(select(body, 'Roof'))).toEqual({
        before: 'The Hipped ',
        match: 'Roof',
        after: ' of the Old House',
      });
    });
  });

  describe("TERM-11: abbreviations don't end a sentence", () => {
    it.fails('keeps "Mr." with the rest of its sentence', () => {
      const body = bookBody(
        '<p>He nodded. Mr. Utterson the lawyer was a man of a rugged countenance.</p>',
      );
      expect(sourceSentence(select(body, 'rugged countenance')).before).toBe(
        'Mr. Utterson the lawyer was a man of a ',
      );
    });

    it.fails.each([
      'Mrs.',
      'Ms.',
      'Dr.',
      'St.',
      'Mt.',
      'Prof.',
      'Rev.',
      'Sr.',
      'Jr.',
      'Gen.',
      'Capt.',
      'Col.',
      'Lt.',
      'Sgt.',
    ])('keeps "%s" with the name after it', (abbreviation) => {
      const body = bookBody(`<p>It rained. ${abbreviation} Lanyon saw the hipped roof.</p>`);
      expect(sourceSentence(select(body, 'hipped')).before).toBe(`${abbreviation} Lanyon saw the `);
    });

    it.fails('ignores case ("DR.")', () => {
      const body = bookBody('<p>It rained. DR. LANYON saw the hipped roof.</p>');
      expect(sourceSentence(select(body, 'hipped')).before).toBe('DR. LANYON saw the ');
    });

    it.fails.each(['vs.', 'etc.', 'e.g.', 'i.e.'])(
      'keeps "%s" inside its sentence before a capital',
      (abbreviation) => {
        const body = bookBody(`<p>It rained. Roofs ${abbreviation} Gables and the spire.</p>`);
        expect(whole(sourceSentence(select(body, 'spire')))).toBe(
          `Roofs ${abbreviation} Gables and the spire.`,
        );
      },
    );

    it.fails('keeps single initials with the name after them', () => {
      const body = bookBody('<p>It rained. J. G. Ballard wrote about the hipped roof.</p>');
      expect(sourceSentence(select(body, 'hipped')).before).toBe('J. G. Ballard wrote about the ');
    });

    it.fails('still ends a sentence at a word that only looks like an abbreviation', () => {
      // "Hester." is not on the list, so the sentence before it is left alone.
      const body = bookBody('<p>He called for Hester. The hipped roof leaked.</p>');
      expect(whole(sourceSentence(select(body, 'hipped')))).toBe('The hipped roof leaked.');
    });
  });

  describe("TERM-12: a lowercase continuation doesn't start a new sentence", () => {
    it.fails('joins "she asked." to the quoted question', () => {
      const body = bookBody('<p>“Who is he?” she asked. “Nobody.”</p>');
      expect(sourceSentence(select(body, 'asked'))).toEqual({
        before: '“Who is he?” she ',
        match: 'asked',
        after: '.',
      });
    });

    it.fails('looks past opening quotes and brackets', () => {
      // After "?" the segmenter breaks even before a lowercase word; after "." it already doesn't.
      const body = bookBody('<p>Was it late? (“and the roof leaked”) said nobody. Then.</p>');
      expect(whole(sourceSentence(select(body, 'roof')))).toBe(
        'Was it late? (“and the roof leaked”) said nobody.',
      );
    });
  });

  describe('TERM-13: inline markup inside the sentence', () => {
    it.fails('uses the paragraph, not the inline element', () => {
      const body = bookBody('<p>It had a <em>hipped</em> <a href="#n1">roof</a>.</p>');
      expect(sourceSentence(select(body, 'hipped', 'roof'))).toEqual({
        before: 'It had a ',
        match: 'hipped roof',
        after: '.',
      });
    });

    it.fails('treats <div class="para"> as a paragraph', () => {
      const body = bookBody(
        '<div class="para">Last line. <span>A hipped roof.</span></div><div class="para">Next.</div>',
      );
      expect(whole(sourceSentence(select(body, 'hipped')))).toBe('A hipped roof.');
    });
  });

  describe('TERM-14: a selection across sentences', () => {
    it.fails('covers every sentence the selection touches', () => {
      const body = bookBody('<p>One. It ended with a flying buttress. Then it went on. Three.</p>');
      expect(sourceSentence(select(body, 'buttress', 'Then'))).toEqual({
        before: 'It ended with a flying ',
        match: 'buttress. Then',
        after: ' it went on.',
      });
    });
  });

  describe('TERM-15: a selection across paragraphs', () => {
    it.fails('uses the block around both paragraphs, with the break as a space', () => {
      const body = bookBody(
        '<div><p>He saw the roof.</p><p>It was hipped and old.</p><p>Later.</p></div>',
      );
      expect(sourceSentence(select(body, 'roof', 'hipped'))).toEqual({
        before: 'He saw the ',
        match: 'roof. It was hipped',
        after: ' and old.',
      });
    });

    it.fails('never joins sentences across a paragraph break', () => {
      const body = bookBody(
        '<div><p>Send for the Dr.</p><p>He saw the roof.</p><p>It was hipped.</p><p>and old.</p></div>',
      );
      expect(whole(sourceSentence(select(body, 'roof', 'hipped')))).toBe(
        'He saw the roof. It was hipped.',
      );
    });
  });

  describe('TERM-16: whitespace and invisible characters from the HTML source', () => {
    it.fails('collapses whitespace and removes soft hyphens', () => {
      const body = bookBody('<p>\n    The hip\u00ADped\n    roof.\n</p>');
      expect(sourceSentence(select(body, 'roof'))).toEqual({
        before: 'The hipped ',
        match: 'roof',
        after: '.',
      });
    });
  });

  describe('TERM-17: very long sentences are shortened around the selection', () => {
    // 1-to-4-letter words, so cutting only between words loses at most 5 characters a side.
    const words = (count: number, prefix: string) =>
      Array.from({ length: count }, (_, i) => `${prefix}${String(i % 100)}`).join(' ');
    const visible = ({ before, match, after }: SourceSentence) =>
      (before + match + after).replace(/…/g, '');

    it.fails('keeps the match whole, with an even share of the text either side', () => {
      const sentence = `${words(80, 'a')} buttress ${words(80, 'b')}.`;
      const result = sourceSentence(select(bookBody(`<p>${sentence}</p>`), 'buttress'));

      expect(result.match).toBe('buttress');
      expect(visible(result).length).toBeLessThanOrEqual(MAX_SENTENCE_LENGTH);
      expect(visible(result).length).toBeGreaterThan(MAX_SENTENCE_LENGTH - 12);
      expect(result.before.startsWith('…')).toBe(true);
      expect(result.after.endsWith('…')).toBe(true);
      expect(Math.abs(result.before.length - result.after.length)).toBeLessThanOrEqual(6);
      // Cut only between words: what's left is a run of whole words from the sentence.
      expect(` ${sentence} `).toContain(` ${result.before.slice(1)}buttress`);
      expect(` ${sentence} `).toContain(`buttress${result.after.slice(0, -1)} `);
    });

    it.fails('gives the space a short side does not need to the other side', () => {
      const sentence = `The buttress ${words(120, 'b')}.`;
      const result = sourceSentence(select(bookBody(`<p>${sentence}</p>`), 'buttress'));

      expect(result.before).toBe('The ');
      expect(result.after.endsWith('…')).toBe(true);
      expect(visible(result).length).toBeLessThanOrEqual(MAX_SENTENCE_LENGTH);
      expect(visible(result).length).toBeGreaterThan(MAX_SENTENCE_LENGTH - 6);
    });

    it.fails('gives the space a short side does not need to the side before the match', () => {
      const sentence = `${words(120, 'a')} buttress.`;
      const result = sourceSentence(select(bookBody(`<p>${sentence}</p>`), 'buttress'));

      expect(result.after).toBe('.');
      expect(result.before.startsWith('…')).toBe(true);
      expect(visible(result).length).toBeLessThanOrEqual(MAX_SENTENCE_LENGTH);
      expect(visible(result).length).toBeGreaterThan(MAX_SENTENCE_LENGTH - 6);
    });

    // 10-letter words: a word starts every 11 characters, so these limits land mid-word.
    const word = 'abcdefghij';

    it.fails('cuts before the match at the start of a word', () => {
      const sentence = `${`${word} `.repeat(40)}buttress.`;
      const result = sourceSentence(select(bookBody(`<p>${sentence}</p>`), 'buttress'));
      expect(result.before).toMatch(new RegExp(`^…${word} `));
      expect(visible(result).length).toBeLessThanOrEqual(MAX_SENTENCE_LENGTH);
    });

    it.fails('cuts after the match at the end of a word', () => {
      const sentence = `The buttress${` ${word}`.repeat(40)}.`;
      const result = sourceSentence(select(bookBody(`<p>${sentence}</p>`), 'buttress'));
      expect(result.after).toMatch(new RegExp(` ${word}…$`));
      expect(visible(result).length).toBeLessThanOrEqual(MAX_SENTENCE_LENGTH);
    });

    it.fails('leaves a sentence of exactly the limit alone', () => {
      const start = 'The buttress ';
      const sentence = `${start}${'x'.repeat(MAX_SENTENCE_LENGTH - start.length - 1)}.`;
      const result = sourceSentence(select(bookBody(`<p>${sentence}</p>`), 'buttress'));
      expect(whole(result)).toBe(sentence);
    });
  });
});
