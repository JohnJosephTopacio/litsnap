// Turning upstream senses into what the modal shows (DEF-7, DEF-8).

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00A0',
};

/** Decodes the named entities above and numeric ones (`&#160;`, `&#xA0;`). */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
    if (name.startsWith('#')) {
      const hex = name[1] === 'x' || name[1] === 'X';
      const code = hex ? parseInt(name.slice(2), 16) : Number(name.slice(1));
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    }
    return ENTITIES[name.toLowerCase()] ?? entity;
  });
}

export const collapse = (text: string) => text.replace(/\s+/g, ' ').trim();

/** Plain text from a sense's HTML. Tags go before entities are decoded, so `&lt;b&gt;` stays. */
export const htmlToText = (html: string) => collapse(decodeEntities(html.replace(/<[^>]*>/g, '')));

const MAX_PARTS_OF_SPEECH = 3;
const MAX_SENSES = 5;

export interface Entry {
  partOfSpeech: string;
  senses: string[];
}

/** Drops empty senses and entries, lowercases parts of speech, and applies the limits (DEF-8). */
export function limitEntries(entries: Entry[]): Entry[] {
  return entries
    .map(({ partOfSpeech, senses }) => ({
      partOfSpeech: partOfSpeech.toLowerCase(),
      senses: senses.filter((sense) => sense !== '').slice(0, MAX_SENSES),
    }))
    .filter(({ senses }) => senses.length > 0)
    .slice(0, MAX_PARTS_OF_SPEECH);
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
