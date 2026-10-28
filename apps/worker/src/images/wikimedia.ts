// Requests to Wikimedia's Action API as LitSnap's own account: the token and Wikimedia's cookies
// (IMG-17, IMG-18; docs/decisions/0006-wikimedia-identity.md). Wikimedia counts anonymous requests
// per IP, and Cloudflare's IPs are shared, so anonymous requests from the Worker are throttled.
import { getJson, type JsonReply } from '../definitions/http';
import type { ProviderContext } from '../definitions/types';

const MAX_PER_SITE = 20;

/** `wikipedia.org` for `en.wikipedia.org`: Wikimedia sets its cookies for the whole site. */
const siteOf = (url: string) => new URL(url).hostname.split('.').slice(-2).join('.');

/**
 * The cookies Wikimedia sets, by site, names and values only (IMG-18). Its CDN identifies clients
 * by cookie as well as by token. They identify LitSnap's Worker, never a reader.
 */
export class CookieJar {
  readonly #sites = new Map<string, Map<string, string>>();

  keep(url: string, response: Response): void {
    const site = siteOf(url);
    const cookies = this.#sites.get(site) ?? new Map<string, string>();
    for (const setCookie of response.headers.getSetCookie()) {
      const pair = setCookie.split(';', 1)[0] ?? '';
      const equals = pair.indexOf('=');
      const name = pair.slice(0, equals).trim();
      if (equals < 1 || name === '') continue;
      if (!cookies.has(name) && cookies.size >= MAX_PER_SITE) continue;
      cookies.set(name, pair.slice(equals + 1).trim());
    }
    if (cookies.size > 0) this.#sites.set(site, cookies);
  }

  /** The `Cookie` header for a request to `url`'s site, if there's anything to send. */
  header(url: string): string | undefined {
    const cookies = this.#sites.get(siteOf(url));
    if (!cookies || cookies.size === 0) return undefined;
    return [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }
}

/** GETs JSON from an Action API URL, with LitSnap's token and Wikimedia's cookies when we have them. */
export function actionApiJson(url: string, context: ProviderContext): Promise<JsonReply> {
  const headers: Record<string, string> = {};
  if (context.wikimediaToken) headers.Authorization = `Bearer ${context.wikimediaToken}`;
  const cookie = context.cookies?.header(url);
  if (cookie) headers.Cookie = cookie;
  return getJson(url, context, [404], {
    headers,
    onResponse: (response) => {
      context.cookies?.keep(url, response);
    },
  });
}
