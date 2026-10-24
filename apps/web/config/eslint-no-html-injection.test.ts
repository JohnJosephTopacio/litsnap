// @vitest-environment node
// RD-25 from docs/features/epub-reader.md: the lint rule catches each banned API.
import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import { noHtmlInjection } from './eslint-no-html-injection';

const linter = new Linter({ configType: 'flat' });

function violations(code: string) {
  return linter
    .verify(
      code,
      [
        {
          files: ['**/*.tsx'],
          languageOptions: {
            parser: tseslint.parser,
            parserOptions: { ecmaFeatures: { jsx: true } },
          },
          rules: noHtmlInjection,
        },
      ],
      'probe.tsx',
    )
    .map((message) => message.ruleId);
}

describe('RD-25: HTML-injection APIs are banned by lint', () => {
  it.each([
    ['dangerouslySetInnerHTML', 'const a = <div dangerouslySetInnerHTML={{ __html: title }} />;'],
    ['innerHTML =', 'el.innerHTML = title;'],
    ['innerHTML +=', 'el.innerHTML += title;'],
    ["['innerHTML'] =", "el['innerHTML'] = title;"],
    ['outerHTML =', 'el.outerHTML = title;'],
    ['insertAdjacentHTML', "el.insertAdjacentHTML('beforeend', title);"],
    ['document.write', 'document.write(title);'],
    ['document.writeln', 'document.writeln(title);'],
  ])('flags %s', (_name, code) => {
    expect(violations(code)).toEqual(['no-restricted-syntax']);
  });

  it.each([
    ['text in JSX', 'const a = <h1>{title}</h1>;'],
    ['textContent', 'el.textContent = title;'],
    ['reading innerHTML', 'const html = el.innerHTML;'],
    ['XML parsing (inspectEpub)', "new DOMParser().parseFromString(xml, 'application/xml');"],
  ])('allows %s', (_name, code) => {
    expect(violations(code)).toEqual([]);
  });
});
