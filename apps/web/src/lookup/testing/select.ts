// Test helpers: parse book-like HTML and select text in it, like a reader dragging over it.

/** The `<body>` of an HTML document parsed from `html` (parsed, never inserted into our UI). */
export function bookBody(html: string): HTMLElement {
  return new DOMParser().parseFromString(`<!doctype html><body>${html}</body>`, 'text/html').body;
}

/**
 * A range from the start of the first `from` to the end of the first `to` that begins at or after
 * it. Text is matched across element boundaries, against the text nodes joined with nothing in
 * between, as they are in the DOM.
 */
export function select(root: Node, from: string, to = from): Range {
  const doc = root.ownerDocument ?? (root as Document);
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: { node: Text; start: number }[] = [];
  let text = '';
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    nodes.push({ node: node as Text, start: text.length });
    text += (node as Text).data;
  }

  const start = text.indexOf(from);
  if (start < 0) throw new Error(`${JSON.stringify(from)} isn't in the text`);
  const toAt = text.indexOf(to, start);
  if (toAt < 0) throw new Error(`${JSON.stringify(to)} isn't after ${JSON.stringify(from)}`);
  const end = toAt + to.length;

  // A start offset belongs to the node it begins in; an end offset to the node it finishes in.
  const locate = (offset: number, isEnd: boolean) => {
    const found = nodes.find(({ node, start: nodeStart }) =>
      isEnd
        ? offset > nodeStart && offset <= nodeStart + node.data.length
        : offset >= nodeStart && offset < nodeStart + node.data.length,
    );
    if (!found) throw new Error(`No text node at offset ${String(offset)}`);
    return { node: found.node, offset: offset - found.start };
  };

  const range = doc.createRange();
  const startAt = locate(start, false);
  const endAt = locate(end, true);
  range.setStart(startAt.node, startAt.offset);
  range.setEnd(endAt.node, endAt.offset);
  return range;
}
