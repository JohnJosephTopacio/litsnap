// A stand-in for the lookup Worker, so Playwright never calls the real one. Requests the CSP
// blocked never reach a route, so a test that sees its request also proves the CSP allows it.
import type { Page } from '@playwright/test';
import type { LookupResult } from '@litsnap/shared';
import { LOOKUP_ORIGIN } from '../config/lookup';

export interface WorkerReply {
  status?: number;
  body: unknown;
}

/** What the Worker says when nothing is found: the sections the kind asked for. */
export function notFound(url: URL): WorkerReply {
  const kind = url.searchParams.get('kind');
  const body: LookupResult = { term: url.searchParams.get('term') ?? '' };
  if (kind !== 'image') body.definition = { status: 'not-found' };
  if (kind !== 'definition') body.images = { status: 'not-found' };
  return { body };
}

/** Answers every request to the Worker with `answer`, and returns the URLs it was asked for. */
export async function fakeWorker(page: Page, answer: (url: URL) => WorkerReply = notFound) {
  const asked: URL[] = [];
  await page.route(`${LOOKUP_ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    asked.push(url);
    const { status = 200, body } = answer(url);
    await route.fulfill({
      status,
      json: body,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  });
  return asked;
}
