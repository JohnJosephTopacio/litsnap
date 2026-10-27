// The lookup-api tests' helpers must work, so the red tests can only fail for the right reason.
import { describe, expect, it } from 'vitest';
import {
  allowAll,
  fakeImages,
  fakeProvider,
  FOUND,
  IMAGES_FOUND,
  lookupPath,
  setUp,
} from './support';

describe('lookup-api test support', () => {
  it('fakeProvider answers its outcome and records terms', async () => {
    const provider = fakeProvider('wiktionary', FOUND);

    expect(await provider.lookup('roof', { fetch, timeoutMs: 1 })).toBe(FOUND);
    expect(provider.calls).toEqual(['roof']);
  });

  it('fakeImages answers its outcome, or waits for a function, and records what it was asked', async () => {
    const fixed = fakeImages(IMAGES_FOUND);
    const context = { fetch, timeoutMs: 1 };

    expect(await fixed.images('roof', context)).toBe(IMAGES_FOUND);
    expect(fixed.calls).toEqual(['roof']);
    expect(fixed.contexts).toEqual([context]);
    expect(await fakeImages(() => Promise.resolve(IMAGES_FOUND)).images('eave', context)).toBe(
      IMAGES_FOUND,
    );
  });

  it('allowAll allows', async () => {
    expect(await allowAll(Object.create(null) as Env, '203.0.113.1')).toEqual({ allowed: true });
  });

  it('lookupPath encodes the term', () => {
    expect(lookupPath('Hipped-Roof, ok?', 'both')).toBe(
      '/lookup?term=Hipped-Roof%2C%20ok%3F&kind=both',
    );
  });

  it('setUp runs the app with headers', async () => {
    const { get, send } = setUp();

    const health = await get('/health', { Origin: 'https://example.com' });
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: 'ok', service: 'litsnap-worker' });
    expect((await send(new Request('https://worker.test/nope', { method: 'POST' }))).status).toBe(
      404,
    );
  });
});
