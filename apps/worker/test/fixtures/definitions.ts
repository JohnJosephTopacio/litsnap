// Upstream responses for the definition-provider tests. Each copies the structure of a real
// response (recorded 2026-10-26) with our own wording, so no third-party text is committed.

export const WIKTIONARY = 'https://en.wiktionary.org/api/rest_v1/page/definition/';
export const DICTIONARY_API = 'https://api.dictionaryapi.dev/api/v2/entries/en/';
export const WIKIPEDIA = 'https://en.wikipedia.org/api/rest_v1/page/summary/';

export const CC_BY_SA_4 = {
  licence: 'CC BY-SA 4.0',
  licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
};

// --- Wiktionary --------------------------------------------------------------------------------

/** Wiktionary puts an empty usage-label span before many senses. */
const LABEL = '<span class="usage-label-sense" about="#mwt4" typeof="mw:Transclusion"></span> ';

const link = (title: string, text = title) =>
  `<a rel="mw:WikiLink" href="/wiki/${title.replaceAll(' ', '_')}" title="${title}">${text}</a>`;

/** A "form of" sense, as Wiktionary's templates mark it up (DEF-10). */
const crossReference = (lead: string, target: string, end = '') =>
  `<span class="form-of-definition use-with-mention" about="#mwt5" typeof="mw:Transclusion">${lead} ` +
  `<span class="form-of-definition-link"><i class="Latn mention" lang="en">${link(target)}</i></span></span>${end}`;

const english = (partOfSpeech: string, definitions: string[]) => ({
  partOfSpeech,
  language: 'English',
  definitions: definitions.map((definition) => ({ definition })),
});

export const WIKT_ROOF = {
  en: [
    {
      partOfSpeech: 'Noun',
      language: 'English',
      definitions: [
        {
          definition: `${LABEL}The outer ${link('covering')} on ${link('top')} of a building.`,
          parsedExamples: [{ example: 'Rain ran off the roof.' }],
          examples: ['Rain ran off the <b>roof</b>.'],
        },
        { definition: `The top of a ${link('vehicle')} &amp; similar things.` },
      ],
    },
    english('Verb', [`To put a roof on.`]),
  ],
  nl: [
    { partOfSpeech: 'Noun', language: 'Dutch', definitions: [{ definition: 'A Dutch sense.' }] },
  ],
  other: [
    { partOfSpeech: 'Noun', language: 'Scots', definitions: [{ definition: 'A Scots sense.' }] },
  ],
};

export const WIKT_ROOF_ENTRIES = [
  {
    partOfSpeech: 'noun',
    senses: ['The outer covering on top of a building.', 'The top of a vehicle & similar things.'],
  },
  { partOfSpeech: 'verb', senses: ['To put a roof on.'] },
];

export const WIKT_ROOFS = {
  en: [
    english('Noun', [crossReference(link('Appendix:Glossary', 'plural') + ' of', 'roof')]),
    english('Verb', [
      crossReference(
        `${link('Appendix:Glossary', 'third-person')} ${link('Appendix:Glossary', 'singular')} ` +
          `<span class="inflection-of-conjoined">simple ${link('Appendix:Glossary', 'present')}</span> ` +
          `${link('Appendix:Glossary', 'indicative')} of`,
        'roof',
      ),
    ]),
  ],
};

export const WIKT_HIPPED_ROOF = {
  en: [english('Noun', [LABEL + crossReference('Synonym of', 'hip roof', '.')])],
};

export const WIKT_HIP_ROOF = {
  en: [
    english('Noun', [
      `${LABEL}A ${link('roof')} that slopes down to the walls on every side, with no gables.`,
    ]),
  ],
};

export const WIKT_HIP_ROOF_ENTRIES = [
  {
    partOfSpeech: 'noun',
    senses: ['A roof that slopes down to the walls on every side, with no gables.'],
  },
];

/** `hipped roofs` points to `hipped roof`, which itself only points to `hip roof`. */
export const WIKT_HIPPED_ROOFS = {
  en: [english('Noun', [crossReference('plural of', 'hipped roof')])],
};

/** A cross-reference next to an ordinary sense (DEF-12). */
export const WIKT_LEFT = {
  en: [
    english('Verb', [crossReference('simple past of', 'leave')]),
    english('Adjective', ['On the west side when facing north.']),
  ],
};

/** An empty, label-only sense next to a cross-reference: still followed (DEF-7, DEF-10). */
export const WIKT_HIPPED_ROOF_WITH_EMPTY_SENSE = {
  en: [english('Noun', [LABEL, crossReference('Synonym of', 'hip roof', '.')])],
};

/** A cross-reference whose target title has an entity in its `title` attribute (DEF-10). */
export const WIKT_OCLOCK_MISSPELLING = {
  en: [
    english('Noun', [
      '<span class="form-of-definition use-with-mention">Misspelling of ' +
        '<span class="form-of-definition-link"><i class="Latn mention" lang="en">' +
        '<a rel="mw:WikiLink" href="/wiki/o%27clock#English" title="o&#39;clock">o&#39;clock</a>' +
        '</i></span></span>.',
    ]),
  ],
};

export const WIKT_OCLOCK = { en: [english('Adverb', ['According to the clock.'])] };

export const WIKT_MIXED_LANGUAGES = {
  en: [
    {
      partOfSpeech: 'Symbol',
      language: 'Translingual',
      definitions: [{ definition: 'A symbol sense.' }],
    },
    english('Noun', ['An English sense.']),
  ],
  nl: [
    { partOfSpeech: 'Noun', language: 'Dutch', definitions: [{ definition: 'A Dutch sense.' }] },
  ],
};

export const WIKT_NO_ENGLISH = {
  other: [
    {
      partOfSpeech: 'Noun',
      language: 'Alemannic German',
      definitions: [{ definition: `${LABEL}${link('dog')}` }],
    },
  ],
};

export const WIKT_TRANSLINGUAL_ONLY = {
  en: [
    {
      partOfSpeech: 'Letter',
      language: 'Translingual',
      definitions: [{ definition: 'A letter of the Latin script.' }],
    },
  ],
};

/** Markup, entities, whitespace and empty senses (DEF-7). */
export const WIKT_MARKUP = {
  en: [
    english('Proper noun', [
      `${LABEL}The <a href="/wiki/top">top</a> covering &amp; its&#160;frame`,
      LABEL,
      '<i>Nested\n    <b>markup</b></i>,\n  across lines.',
      '&lt;b&gt; is &quot;bold&quot;, &apos;a&apos; &#39;b&#39; x&nbsp;y &#8212; &#x2014;',
    ]),
  ],
};

export const WIKT_MARKUP_SENSES = [
  'The top covering & its frame',
  'Nested markup, across lines.',
  `<b> is "bold", 'a' 'b' x y — —`,
];

/** Four parts of speech; the first has seven senses and an empty one (DEF-8). */
export const WIKT_MANY = {
  en: [
    english('Noun', ['n1', 'n2', LABEL, 'n3', 'n4', 'n5', 'n6', 'n7']),
    english('Verb', ['v1']),
    english('Adjective', ['a1']),
    english('Adverb', ['d1']),
  ],
};

// --- dictionaryapi.dev -------------------------------------------------------------------------

const DICT_LICENSE = {
  name: 'CC BY-SA 3.0',
  url: 'https://creativecommons.org/licenses/by-sa/3.0',
};

const dictEntry = (
  word: string,
  meanings: { partOfSpeech: string; definitions: string[] }[],
  credit: { license?: typeof DICT_LICENSE; sourceUrls?: string[] } = {
    license: DICT_LICENSE,
    sourceUrls: [`https://en.wiktionary.org/wiki/${word}`],
  },
) => ({
  word,
  phonetic: '/ɡeɪbəl/',
  phonetics: [],
  meanings: meanings.map(({ partOfSpeech, definitions }) => ({
    partOfSpeech,
    definitions: definitions.map((definition) => ({
      definition,
      synonyms: ['a synonym'],
      antonyms: [],
      example: 'An example sentence.',
    })),
    synonyms: [],
    antonyms: [],
  })),
  ...credit,
});

/** Two homographs that both have a noun meaning (DEF-13). */
export const DICT_GABLE = [
  dictEntry('gable', [
    { partOfSpeech: 'noun', definitions: ['The triangular top of an end wall.', '  '] },
  ]),
  dictEntry('gable', [
    { partOfSpeech: 'verb', definitions: ['To give a building gables.'] },
    { partOfSpeech: 'noun', definitions: ['A gable-shaped canopy over a window.'] },
  ]),
];

export const DICT_GABLE_DEFINITION = {
  from: 'dictionary',
  entries: [
    {
      partOfSpeech: 'noun',
      senses: ['The triangular top of an end wall.', 'A gable-shaped canopy over a window.'],
    },
    { partOfSpeech: 'verb', senses: ['To give a building gables.'] },
  ],
  source: {
    sourceName: 'Wiktionary (via Free Dictionary API)',
    sourceUrl: 'https://en.wiktionary.org/wiki/gable',
    licence: 'CC BY-SA 3.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/3.0',
  },
};

export const DICT_MANY = [
  dictEntry('many', [
    { partOfSpeech: 'Noun', definitions: ['n1', 'n2', '', 'n3', 'n4', 'n5', 'n6', 'n7'] },
    { partOfSpeech: 'verb', definitions: ['v1'] },
    { partOfSpeech: 'adjective', definitions: ['a1'] },
    { partOfSpeech: 'adverb', definitions: ['d1'] },
  ]),
];

/** The first homograph has no licence, the second no source URL, the third both (DEF-14). */
export const DICT_PARTLY_CREDITED = [
  dictEntry('eave', [{ partOfSpeech: 'noun', definitions: ['Uncredited sense.'] }], {
    sourceUrls: ['https://en.wiktionary.org/wiki/eave'],
  }),
  dictEntry('eave', [{ partOfSpeech: 'noun', definitions: ['Also uncredited.'] }], {
    license: DICT_LICENSE,
  }),
  dictEntry('eave', [{ partOfSpeech: 'noun', definitions: ['The lower edge of a roof.'] }], {
    license: { name: 'CC BY-SA 3.0', url: 'https://example.org/licence' },
    sourceUrls: ['https://en.wiktionary.org/wiki/eaves', 'https://en.wiktionary.org/wiki/eave'],
  }),
];

export const DICT_UNCREDITED = DICT_PARTLY_CREDITED.slice(0, 2);

/** A part of speech whose only sense is blank (DEF-13). */
export const DICT_SOFFIT = [
  dictEntry('soffit', [
    { partOfSpeech: 'noun', definitions: ['  '] },
    { partOfSpeech: 'verb', definitions: ['To fit a soffit.'] },
  ]),
];

/** Two credited homographs with different source pages: the first one's credit is used (DEF-14). */
export const DICT_TWO_SOURCES = [
  dictEntry('eave', [{ partOfSpeech: 'noun', definitions: ['First sense.'] }]),
  dictEntry('eaves', [{ partOfSpeech: 'noun', definitions: ['Second sense.'] }]),
];

export const DICT_NOT_FOUND = {
  title: 'No Definitions Found',
  message: 'No definitions for that word.',
  resolution: 'Try again later or search the web.',
};

// --- Wikipedia ---------------------------------------------------------------------------------

const summary = (type: string, title: string, extract: string) => ({
  type,
  title,
  displaytitle: `<span class="mw-page-title-main">${title}</span>`,
  pageid: 1234,
  description: 'A short description',
  thumbnail: { source: 'https://upload.wikimedia.org/thumb.jpg', width: 330, height: 178 },
  content_urls: {
    desktop: { page: `https://en.wikipedia.org/wiki/${title.replaceAll(' ', '_')}` },
    mobile: { page: `https://en.m.wikipedia.org/wiki/${title.replaceAll(' ', '_')}` },
  },
  extract,
  extract_html: `<p>${extract}</p>`,
});

/** What `summary/hipped_roof` answers: the redirect target's article. */
export const WP_HIP_ROOF = summary(
  'standard',
  'Hip roof',
  'A hip roof is a roof whose sides all slope down towards the walls, so it has no gables.',
);

export const WP_BASS = summary('disambiguation', 'Bass', 'Bass may refer to:');
export const WP_NO_EXTRACT = summary('no-extract', 'Roof plan', '');
export const WP_EMPTY_EXTRACT = summary('standard', 'Roof plan', '');
export const WP_NOT_FOUND = { status: 404, type: 'Internal error' };
/** Any type other than `standard` is not a definition, even with an extract (DEF-16). */
export const WP_MAIN_PAGE = summary('mainpage', 'Main Page', 'Welcome to the encyclopedia.');
