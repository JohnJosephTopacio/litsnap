// Decision 0002: the production CSP is served, and our own app runs under it.
// RD-23 (from docs/features/epub-reader.md) lands early, with the CSP itself.
import { expect, test } from '@playwright/test';
import { CONTENT_SECURITY_POLICY } from '../config/csp';

test('RD-23: / carries the CSP from config/csp.ts', async ({ request }) => {
  const response = await request.get('/');

  expect(response.headers()['content-security-policy']).toBe(CONTENT_SECURITY_POLICY);
});

test('the app runs under the CSP without violations', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (message) => {
    if (message.text().includes('Content Security Policy')) violations.push(message.text());
  });
  page.on('pageerror', (error) => violations.push(error.message));

  await page.goto('/');

  // The heading is rendered by React, so this proves our bundled script ran.
  await expect(page.getByRole('heading', { level: 1, name: 'LitSnap' })).toBeVisible();
  expect(violations).toEqual([]);
});
