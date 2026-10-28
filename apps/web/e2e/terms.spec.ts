// Acceptance criteria TERMS-1…4 from docs/features/terms-page.md.
import { expect, test } from '@playwright/test';
import { CONTENT_SECURITY_POLICY } from '../config/csp';

test('TERMS-1: the page renders its heading, date and sections 1–10', async ({ page }) => {
  await page.goto('/terms');

  await expect(page.getByRole('heading', { level: 1, name: 'Terms of Use' })).toBeVisible();
  await expect(page.getByText(/^Last updated: /)).toBeVisible();
  const sections = page.getByRole('heading', { level: 2 });
  await expect(sections).toHaveCount(10);
  for (let n = 1; n <= 10; n++) {
    await expect(sections.nth(n - 1)).toHaveText(new RegExp(`^${String(n)}\\. `));
  }
});

test('TERMS-2: /terms has the same CSP as /', async ({ request }) => {
  const terms = await request.get('/terms');
  const home = await request.get('/');

  expect(terms.headers()['content-security-policy']).toBe(CONTENT_SECURITY_POLICY);
  expect(home.headers()['content-security-policy']).toBe(CONTENT_SECURITY_POLICY);
});

test('TERMS-3: terms.html has no scripts or inline event handlers', async ({ request }) => {
  const html = await (await request.get('/terms')).text();

  expect(html).not.toMatch(/<script\b/i);
  expect(html).not.toMatch(/\son[a-z]+\s*=/i);
  expect(html).not.toMatch(/javascript:/i);
});

test('TERMS-4: the footer link opens /terms in a new tab', async ({ page, context }) => {
  await page.goto('/');

  const [terms] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('link', { name: 'Terms' }).click(),
  ]);

  await expect(terms).toHaveURL(/\/terms$/);
  await expect(terms.getByRole('heading', { level: 1, name: 'Terms of Use' })).toBeVisible();
});
