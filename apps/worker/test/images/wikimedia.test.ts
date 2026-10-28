// IMG-17 and IMG-18 from docs/features/image-providers.md: Action API requests as LitSnap's own
// Wikimedia account (decision 0006).
import { describe, expect, it } from 'vitest';
import { actionApiJson, CookieJar } from '../../src/images/wikimedia';
import { fakeFetch, type Reply } from '../fakeFetch';

const WIKIDATA = 'https://www.wikidata.org/w/api.php?action=wbgetclaims&format=json';
const COMMONS = 'https://commons.wikimedia.org/w/api.php?action=query&format=json';
const ENWIKI = 'https://en.wikipedia.org/w/api.php?action=query&format=json';

/** A JSON answer that sets `cookies` (each a full Set-Cookie value). */
const withCookies =
  (...cookies: string[]): Reply =>
  () => {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    for (const cookie of cookies) headers.append('Set-Cookie', cookie);
    return new Response('{}', { status: 200, headers });
  };

const response = (...cookies: string[]) =>
  withCookies(...cookies)({ url: '', headers: new Headers(), signal: undefined });

describe('IMG-18: the cookie jar', () => {
  it('keeps names and values, without attributes, and sends them back to the same site', async () => {
    const jar = new CookieJar();

    jar.keep(
      WIKIDATA,
      await response('WMF-Uniq=abc; Domain=.wikidata.org; Path=/; HttpOnly', 'GeoIP=PH; Path=/'),
    );

    expect(jar.header('https://www.wikidata.org/w/api.php?other=1')).toBe('WMF-Uniq=abc; GeoIP=PH');
  });

  it('keeps sites apart, by the last two parts of the host', async () => {
    const jar = new CookieJar();
    jar.keep(COMMONS, await response('a=commons'));
    jar.keep(ENWIKI, await response('a=enwiki'));

    expect(jar.header('https://upload.wikimedia.org/x')).toBe('a=commons');
    expect(jar.header('https://de.wikipedia.org/w/api.php')).toBe('a=enwiki');
    expect(jar.header(WIKIDATA)).toBeUndefined();
  });

  it('replaces a cookie with a later value of the same name', async () => {
    const jar = new CookieJar();
    jar.keep(WIKIDATA, await response('a=1', 'b=2'));
    jar.keep(WIKIDATA, await response('a=3'));

    expect(jar.header(WIKIDATA)).toBe('a=3; b=2');
  });

  it('keeps at most 20 per site', async () => {
    const jar = new CookieJar();
    jar.keep(WIKIDATA, await response(...Array.from({ length: 25 }, (_, i) => `c${String(i)}=v`)));

    expect(jar.header(WIKIDATA)?.split('; ')).toHaveLength(20);
  });

  it('ignores malformed cookies', async () => {
    const jar = new CookieJar();
    jar.keep(WIKIDATA, await response('no-equals-sign', '=no-name', 'ok=1'));

    expect(jar.header(WIKIDATA)).toBe('ok=1');
  });
});

describe('IMG-17, IMG-18: actionApiJson', () => {
  it('sends the token and the cookies, and keeps the cookies it gets back', async () => {
    const fake = fakeFetch({ [WIKIDATA]: withCookies('WMF-Uniq=abc; Path=/') });
    const cookies = new CookieJar();
    const context = { fetch: fake.fetch, timeoutMs: 1000, wikimediaToken: 'secret-token', cookies };

    await actionApiJson(WIKIDATA, context);
    await actionApiJson(WIKIDATA, context);

    expect(fake.requests.map(({ headers }) => headers.get('Authorization'))).toEqual([
      'Bearer secret-token',
      'Bearer secret-token',
    ]);
    expect(fake.requests.map(({ headers }) => headers.get('Cookie'))).toEqual([
      null,
      'WMF-Uniq=abc',
    ]);
    expect(fake.requests[0]?.headers.get('User-Agent')).toMatch(/^LitSnap\//);
  });

  it('without a token or a jar, sends neither', async () => {
    const fake = fakeFetch({ [WIKIDATA]: withCookies('WMF-Uniq=abc') });

    await actionApiJson(WIKIDATA, { fetch: fake.fetch, timeoutMs: 1000 });

    expect(fake.requests[0]?.headers.get('Authorization')).toBeNull();
    expect(fake.requests[0]?.headers.get('Cookie')).toBeNull();
  });

  it('never puts the token in a failure reason', async () => {
    const fake = fakeFetch({ [WIKIDATA]: () => new Response('', { status: 503 }) });

    const reply = await actionApiJson(WIKIDATA, {
      fetch: fake.fetch,
      timeoutMs: 1000,
      wikimediaToken: 'secret-token',
    });

    expect(JSON.stringify(reply)).not.toContain('secret-token');
    expect(reply).toEqual({ status: 'failed', reason: 'HTTP 503' });
  });
});
