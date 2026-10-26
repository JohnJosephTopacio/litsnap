// Finds the sentence a selection came from, for the lookup modal's header (spec §4.2).
// Spec: docs/features/lookup-term.md (TERM-10…17).

/**
 * The sentence split around the selection. The modal renders `before`, then `match` in a
 * `<mark>`, then `after`, all as text: never as HTML (RD-24).
 */
export interface SourceSentence {
  before: string;
  match: string;
  after: string;
}

/** The visible length `before + match + after` is cut down to, around the match (TERM-17). */
export const MAX_SENTENCE_LENGTH = 300;

const BLOCKS =
  'p, li, blockquote, h1, h2, h3, h4, h5, h6, dd, dt, td, th, figcaption, pre, div, section, article, body';
const INVISIBLE = /[\u00AD\u200B-\u200D\u2060\uFEFF]/g;
/** A segment ending like this continues into the next one (TERM-11). */
const ABBREVIATION =
  /(?:^|[^\p{L}.])(?:mr|mrs|ms|dr|st|mt|prof|rev|sr|jr|gen|capt|col|lt|sgt|vs|etc|e\.g|i\.e)\.$/iu;
const INITIAL = /(?:^|[^\p{L}.])\p{Lu}\.$/u;
/** A segment starting like this continues the previous one (TERM-12). */
const LOWERCASE_START = /^[\s"'“‘«([{]*\p{Ll}/u;

const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });

// Book documents live in the reader's iframe, another JavaScript realm: their nodes aren't
// `instanceof` our Text or Element, so check nodeType instead.
const isElement = (node: Node): node is Element => node.nodeType === Node.ELEMENT_NODE;
const isText = (node: Node): node is Text => node.nodeType === Node.TEXT_NODE;

function blockOf(node: Node): Element | null {
  const element = isElement(node) ? node : node.parentElement;
  return element?.closest(BLOCKS) ?? null;
}

interface BlockText {
  text: string;
  /** Text offset of a boundary point of the selection. */
  offsetOf: (container: Node, offset: number) => number;
}

/**
 * The block's text nodes joined in document order, with a line break between blocks. Whitespace is
 * replaced one-for-one by spaces, so source newlines don't break sentences and offsets still match.
 */
function blockText(block: Element): BlockText {
  const doc = block.ownerDocument;
  const walker = doc.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  const nodes: { node: Text; start: number }[] = [];
  let text = '';
  let previousBlock: Element | null = null;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const textNode = node as Text;
    const nodeBlock = blockOf(textNode);
    if (previousBlock && nodeBlock !== previousBlock) text += '\n';
    previousBlock = nodeBlock;
    nodes.push({ node: textNode, start: text.length });
    text += textNode.data.replace(/\s/g, ' ');
  }

  return {
    text,
    offsetOf: (container, offset) => {
      if (isText(container)) {
        const found = nodes.find(({ node }) => node === container);
        if (found) return found.start + offset;
      }
      const point = doc.createRange();
      point.setStart(container, offset);
      const next = nodes.find(({ node }) => point.comparePoint(node, 0) >= 0);
      return next ? next.start : text.length;
    },
  };
}

/** Sentence boundaries, with the segmenter's breaks after abbreviations and before lowercase undone. */
function sentences(text: string): { start: number; end: number }[] {
  const result: { start: number; end: number }[] = [];
  for (const { index, segment } of segmenter.segment(text)) {
    const previous = result.at(-1);
    const previousText = previous && text.slice(previous.start, previous.end);
    const continues =
      previousText !== undefined &&
      !previousText.includes('\n') &&
      (ABBREVIATION.test(previousText.trimEnd()) ||
        INITIAL.test(previousText.trimEnd()) ||
        LOWERCASE_START.test(segment));
    if (previous && continues) previous.end = index + segment.length;
    else result.push({ start: index, end: index + segment.length });
  }
  return result;
}

const clean = (text: string) => text.replace(INVISIBLE, '').replace(/\s+/g, ' ');

/** Keeps at most `budget` characters at the end of `text`, cutting between words. */
function keepEnd(text: string, budget: number): string {
  if (text.length <= budget) return text;
  let tail = text.slice(text.length - budget);
  if (text[text.length - budget - 1] !== ' ') {
    const space = tail.indexOf(' ');
    tail = space < 0 ? '' : tail.slice(space + 1);
  }
  return `…${tail.trimStart()}`;
}

/** Keeps at most `budget` characters at the start of `text`, cutting between words. */
function keepStart(text: string, budget: number): string {
  if (text.length <= budget) return text;
  let head = text.slice(0, budget);
  if (text[budget] !== ' ') {
    const space = head.lastIndexOf(' ');
    head = space < 0 ? '' : head.slice(0, space);
  }
  return `${head.trimEnd()}…`;
}

export function sourceSentence(range: Range): SourceSentence {
  const block =
    blockOf(range.commonAncestorContainer) ?? range.commonAncestorContainer.ownerDocument?.body;
  if (!block) return { before: '', match: clean(range.toString()).trim(), after: '' };

  const { text, offsetOf } = blockText(block);
  const selStart = offsetOf(range.startContainer, range.startOffset);
  const selEnd = offsetOf(range.endContainer, range.endOffset);
  const all = sentences(text);
  const first = all.find(({ end }) => end > selStart) ?? { start: selStart };
  const last = all.findLast(({ start }) => start < selEnd) ?? { end: selEnd };

  let before = clean(text.slice(first.start, selStart)).trimStart();
  const match = clean(text.slice(selStart, selEnd));
  let after = clean(text.slice(selEnd, last.end)).trimEnd();

  if (before.length + match.length + after.length > MAX_SENTENCE_LENGTH) {
    const budget = Math.max(0, MAX_SENTENCE_LENGTH - match.length);
    // An even split, except that space one side doesn't need goes to the other.
    const half = Math.floor(budget / 2);
    const beforeBudget = Math.min(before.length, Math.max(half, budget - after.length));
    before = keepEnd(before, beforeBudget);
    after = keepStart(after, budget - beforeBudget);
  }
  return { before, match, after };
}
