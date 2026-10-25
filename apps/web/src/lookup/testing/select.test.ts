// The helper the TERM-10…17 tests rely on. Ordinary tests, so a red test can't fail because of it.
import { describe, expect, it } from 'vitest';
import { bookBody, select } from './select';

describe('bookBody', () => {
  it('parses HTML into a body element without running anything', () => {
    const body = bookBody('<p id="a">One</p><p>Two</p>');
    expect(body.tagName).toBe('BODY');
    expect(body.querySelector('#a')?.textContent).toBe('One');
  });
});

describe('select', () => {
  it('selects text inside one text node', () => {
    const range = select(bookBody('<p>The hipped roof.</p>'), 'hipped roof');
    expect(range.toString()).toBe('hipped roof');
    expect(range.startContainer).toBe(range.endContainer);
    expect(range.startOffset).toBe(4);
  });

  it('starts inside one element and ends inside another', () => {
    const body = bookBody('<p>It had a <em>hipped</em> <a href="#n1">roof</a>.</p>');
    const range = select(body, 'hipped', 'roof');
    expect(range.toString()).toBe('hipped roof');
    expect(range.startContainer.parentElement?.tagName).toBe('EM');
    expect(range.endContainer.parentElement?.tagName).toBe('A');
  });

  it('ends at the end of a text node, not the start of the next one', () => {
    const body = bookBody('<p><em>hipped</em> roof</p>');
    const range = select(body, 'hipped');
    expect(range.endContainer.parentElement?.tagName).toBe('EM');
    expect(range.endOffset).toBe(6);
  });

  it('spans paragraphs', () => {
    const body = bookBody('<div><p>He saw the roof.</p><p>It was hipped and old.</p></div>');
    const range = select(body, 'roof', 'hipped');
    expect(range.toString()).toBe('roof.It was hipped');
  });

  it('finds `to` only after `from`', () => {
    const range = select(bookBody('<p>roof one roof two</p>'), 'one', 'roof');
    expect(range.toString()).toBe('one roof');
  });

  it('throws when the text is missing', () => {
    const body = bookBody('<p>roof</p>');
    expect(() => select(body, 'spire')).toThrow("isn't in the text");
    expect(() => select(body, 'roof', 'spire')).toThrow("isn't after");
  });
});
