// TERMS-5 from docs/features/terms-page.md: licence notices ship with the site.
import { expect, test } from '@playwright/test';

test('TERMS-5: /third-party-licenses.txt lists the bundled packages with their licence text', async ({
  request,
}) => {
  const response = await request.get('/third-party-licenses.txt');

  expect(response.ok()).toBe(true);
  expect(response.headers()['content-type']).toMatch(/^text\/plain/);
  const text = await response.text();
  for (const name of ['react', 'react-dom', 'scheduler']) {
    expect(text).toMatch(new RegExp(`^${name} \\d+\\.\\d+\\.\\d+ \\(MIT\\)$`, 'm'));
  }
  expect(text).toContain('Permission is hereby granted, free of charge');
  // Vendored code (decision 0001), versioned by the commit in VENDORED.md.
  expect(text).toMatch(/^foliate-js \(vendored\) 78914aef[0-9a-f]+ /m);
  expect(text).toMatch(/^foliate-js\/licenses\/zip\.js \(vendored\) /m);
  expect(text).toContain('BSD 3-Clause License');
});

test('TERMS-5: the Terms page links to the notices', async ({ page }) => {
  await page.goto('/terms');

  await page.getByRole('link', { name: 'Third-party licences' }).click();

  await expect(page).toHaveURL(/\/third-party-licenses\.txt$/);
  await expect(page.getByText('Third-party software in LitSnap')).toBeVisible();
});
