// The provider tests' fake `fetch` must work, so the red tests can only fail for the right reason.
import { describe, expect, it } from 'vitest';
import { fakeFetch, hang, json, networkError, status, text } from './fakeFetch';

const URL_A = 'https://example.com/a';

describe('fakeFetch', () => {
  it('answers a routed URL and records the request', async () => {
    const fake = fakeFetch({ [URL_A]: json({ ok: true }) });

    const response = await fake.fetch(URL_A, { headers: { 'User-Agent': 'Test/1' } });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(fake.urls()).toEqual([URL_A]);
    expect(fake.requests[0]?.headers.get('User-Agent')).toBe('Test/1');
  });

  it('records requests sent as a Request object', async () => {
    const fake = fakeFetch({ [URL_A]: status(404) });

    const response = await fake.fetch(new Request(URL_A, { headers: { Accept: 'text/plain' } }));

    expect(response.status).toBe(404);
    expect(fake.requests[0]?.headers.get('Accept')).toBe('text/plain');
  });

  it('rejects a URL with no route', async () => {
    const fake = fakeFetch({});

    await expect(fake.fetch('https://example.com/other')).rejects.toThrow(/no route/);
    expect(fake.urls()).toEqual(['https://example.com/other']);
  });

  it('can answer with a status, a non-JSON body or a network error', async () => {
    const fake = fakeFetch({
      [URL_A]: status(500, 'oops'),
      'https://example.com/text': text('<html></html>'),
      'https://example.com/down': networkError,
    });

    const failed = await fake.fetch(URL_A);
    expect([failed.status, await failed.text()]).toEqual([500, 'oops']);
    await expect((await fake.fetch('https://example.com/text')).json()).rejects.toThrow();
    await expect(fake.fetch('https://example.com/down')).rejects.toThrow(TypeError);
  });

  it('can hang until the request is aborted', async () => {
    const fake = fakeFetch({ [URL_A]: hang });
    const controller = new AbortController();

    const pending = fake.fetch(URL_A, { signal: controller.signal });
    controller.abort(new Error('timed out'));

    await expect(pending).rejects.toThrow('timed out');
    expect(fake.requests[0]?.signal?.aborted).toBe(true);
  });
});
