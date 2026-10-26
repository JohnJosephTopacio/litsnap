// A stand-in for `fetch` that answers by exact URL, so provider tests never touch the network.

/** What a fake request was sent with. */
export interface FakeRequest {
  url: string;
  headers: Headers;
  signal: AbortSignal | undefined;
}

/** Builds the response for one request. */
export type Reply = (request: FakeRequest) => Response | Promise<Response>;

export const json =
  (body: unknown, status = 200): Reply =>
  () =>
    Response.json(body, { status });

export const status =
  (code: number, body = ''): Reply =>
  () =>
    new Response(body, { status: code });

/** A 200 whose body isn't JSON. */
export const text =
  (body: string): Reply =>
  () =>
    new Response(body, { status: 200, headers: { 'Content-Type': 'text/html' } });

/** Never answers. Rejects with the signal's reason once the request is aborted. */
export const hang: Reply = ({ signal }) =>
  new Promise((_resolve, reject) => {
    signal?.addEventListener('abort', () => {
      reject(signal.reason as Error);
    });
  });

export const networkError: Reply = () => Promise.reject(new TypeError('Network connection lost.'));

/** `fetch` that answers each URL in `routes`, and rejects anything else so a wrong URL is loud. */
export function fakeFetch(routes: Record<string, Reply>) {
  const requests: FakeRequest[] = [];
  const fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const sent: FakeRequest = {
      url: request.url,
      headers: request.headers,
      signal: init?.signal ?? (input instanceof Request ? input.signal : undefined) ?? undefined,
    };
    requests.push(sent);
    const reply = routes[sent.url];
    if (!reply) return Promise.reject(new Error(`fakeFetch: no route for ${sent.url}`));
    return Promise.resolve(reply(sent));
  }) as typeof globalThis.fetch;
  return { fetch, requests, urls: () => requests.map((request) => request.url) };
}
