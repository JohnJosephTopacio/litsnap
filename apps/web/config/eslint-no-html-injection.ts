// RD-25: lint bans the DOM APIs that turn strings into HTML, so book text (titles, TOC labels,
// selections) can't be injected into our own UI. Decision 0002, "Our own UI".
// Used by eslint.config.js for apps/web/src; tested in eslint-no-html-injection.test.ts.
import type { Linter } from 'eslint';

const message =
  'Renders a string as HTML. Book text must be rendered as text (RD-25, decision 0002). ' +
  'If this is truly needed, add an eslint-disable comment with the reason and call it out in the PR.';

export const noHtmlInjection: Linter.RulesRecord = {
  'no-restricted-syntax': [
    'error',
    { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message },
    {
      selector: 'AssignmentExpression > MemberExpression.left[property.name=/^(inner|outer)HTML$/]',
      message,
    },
    {
      selector:
        'AssignmentExpression > MemberExpression.left[property.value=/^(inner|outer)HTML$/]',
      message,
    },
    { selector: "CallExpression[callee.property.name='insertAdjacentHTML']", message },
    {
      selector:
        "CallExpression[callee.object.name='document'][callee.property.name=/^(write|writeln)$/]",
      message,
    },
  ],
};
