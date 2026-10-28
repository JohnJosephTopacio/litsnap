// Upstream requests shared by the definition providers (DEF-1…5).
import type { ProviderContext } from './types';

/** Wikimedia's User-Agent policy asks for a name and a way to reach us (DEF-2). */
export const USER_AGENT = 'LitSnap/1.0 (https://github.com/JohnJosephTopacio/litsnap)';

export type JsonReply =
  { status: 'ok'; body: unknown } | { status: 'missing' } | { status: 'failed'; reason: string };

/** Which server answered an error, and when to come back: `" (server …, retry-after 15)"` (IMG-16). */
function serverDetails(response: Response): string {
  const server = response.headers.get('server');
  const retryAfter = response.headers.get('retry-after');
  const details = [
    server && `server ${server.slice(0, 40)}`,
    retryAfter && `retry-after ${retryAfter}`,
  ].filter(Boolean);
  return details.length > 0 ? ` (${details.join(', ')})` : '';
}

/** More for one request: headers to add, and a look at the response (image Action API, IMG-17/18). */
export interface RequestExtras {
  headers?: Record<string, string>;
  onResponse?: (response: Response) => void;
}

/** GETs JSON. `missingStatuses` mean "no such entry"; any other non-2xx or a bad body fails. */
export async function getJson(
  url: string,
  context: ProviderContext,
  missingStatuses: readonly number[] = [404],
  extras: RequestExtras = {},
): Promise<JsonReply> {
  try {
    const response = await context.fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...extras.headers },
      signal: AbortSignal.timeout(context.timeoutMs),
    });
    extras.onResponse?.(response);
    if (missingStatuses.includes(response.status)) return { status: 'missing' };
    if (!response.ok)
      return {
        status: 'failed',
        reason: `HTTP ${String(response.status)}${serverDetails(response)}`,
      };
    return { status: 'ok', body: await response.json() };
  } catch (error) {
    return { status: 'failed', reason: error instanceof Error ? error.name : 'unknown error' };
  }
}

/** Characters Wikimedia page titles can't contain (DEF-5). */
const NOT_IN_TITLES = /[#<>[\]{}|]/;

/** The term as a Wikimedia page title in a URL, or `undefined` if it can't be one. */
export function pageTitle(term: string): string | undefined {
  return NOT_IN_TITLES.test(term) ? undefined : encodeURIComponent(term.replaceAll(' ', '_'));
}
