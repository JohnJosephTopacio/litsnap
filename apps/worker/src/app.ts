// The Worker's routes. `/lookup` spec: docs/features/lookup-api.md.
import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import {
  countWords,
  MAX_LOOKUP_WORDS,
  normalise,
  type DefinitionSection,
  type HealthResponse,
  type LookupErrorBody,
  type LookupKind,
  type LookupResult,
} from '@litsnap/shared';
import { readDefinition, storeDefinition } from './cache';
import { DEFINITION_PROVIDERS, lookupDefinition } from './definitions/chain';
import {
  DEFAULT_TIMEOUT_MS,
  type DefinitionProvider,
  type ProviderContext,
} from './definitions/types';
import { lookupImages } from './images/chain';
import type { ImageOutcome } from './images/types';
import { checkRateLimit, type RateVerdict } from './rateLimit';

/** Pages allowed to read `/lookup` responses (API-15). */
export const ALLOWED_ORIGINS = [
  'https://litsnap.pages.dev',
  'http://localhost:5173',
  'http://localhost:4173',
] as const;

/** Longest normalised term the Worker looks up (API-3). */
export const MAX_TERM_LENGTH = 100;

/** What one `/lookup` request logs: never the term or the IP (API-16). */
export interface LookupLog {
  route: 'lookup';
  status: number;
  kind?: LookupKind;
  cache: 'hit' | 'miss' | 'none';
  rateLimit: 'allowed' | 'denied' | 'error';
  ms: number;
  providers: {
    name: DefinitionProvider['name'];
    outcome: 'found' | 'not-found' | 'failed';
    reason?: string;
    ms: number;
  }[];
  /** Only when images were asked for (API-22). */
  images?: {
    cache: 'hit' | 'miss';
    outcome: 'found' | 'not-found' | 'failed';
    reason?: string;
    ms: number;
  };
}

export interface AppDeps {
  providers: readonly DefinitionProvider[];
  /** The image chain (API-17). RED PHASE: not called until the implementation PR. */
  images: (term: string, context: ProviderContext) => Promise<ImageOutcome>;
  rateLimit: (env: Env, ip: string) => Promise<RateVerdict>;
  log: (entry: LookupLog) => void;
}

/** What production uses; tests replace some of these (lookup-api.md, "Notes for implementation"). */
export const DEFAULT_DEPS: AppDeps = {
  providers: DEFINITION_PROVIDERS,
  images: lookupImages,
  rateLimit: checkRateLimit,
  log: (entry) => {
    console.log(JSON.stringify(entry));
  },
};

const KINDS: readonly string[] = ['definition', 'image', 'both'] satisfies LookupKind[];
const isKind = (kind: string | undefined): kind is LookupKind =>
  kind !== undefined && KINDS.includes(kind);

/** Wraps each provider so the log records its outcome and duration, never its term (API-16). */
const observed = (providers: readonly DefinitionProvider[], entry: LookupLog) =>
  providers.map((provider): DefinitionProvider => ({
    name: provider.name,
    async lookup(term, context) {
      const started = Date.now();
      const outcome = await provider.lookup(term, context);
      entry.providers.push({
        name: provider.name,
        outcome: outcome.status,
        ...(outcome.status === 'failed' && { reason: outcome.reason }),
        ms: Date.now() - started,
      });
      return outcome;
    },
  }));

export function createApp(deps: Partial<AppDeps> = {}) {
  const { providers, rateLimit, log } = { ...DEFAULT_DEPS, ...deps };
  const app = new Hono<{ Bindings: Env }>();

  app.use(
    '*',
    cors({
      origin: (origin) => ((ALLOWED_ORIGINS as readonly string[]).includes(origin) ? origin : null),
      allowMethods: ['GET'],
    }),
  );

  app.get('/health', (c) => c.json<HealthResponse>({ status: 'ok', service: 'litsnap-worker' }));

  app.get('/lookup', async (c) => {
    const started = Date.now();
    const entry: LookupLog = {
      route: 'lookup',
      status: 0,
      cache: 'none',
      rateLimit: 'allowed',
      ms: 0,
      providers: [],
    };
    const respond = (body: LookupResult | LookupErrorBody, status: 200 | 400 | 429 | 502) => {
      entry.status = status;
      entry.ms = Date.now() - started;
      log(entry);
      c.header('Cache-Control', status === 200 ? 'public, max-age=86400' : 'no-store');
      return c.json(body, status);
    };

    // Every request counts, so this comes first (API-12); if the check fails, go ahead (API-14).
    try {
      const verdict = await rateLimit(c.env, c.req.header('CF-Connecting-IP') ?? 'unknown');
      if (!verdict.allowed) {
        entry.rateLimit = 'denied';
        c.header('Retry-After', String(verdict.retryAfterSeconds));
        return respond({ error: 'rate-limited' }, 429);
      }
    } catch {
      entry.rateLimit = 'error';
    }

    const kind = c.req.query('kind');
    const term = normalise(c.req.query('term') ?? '');
    if (
      !isKind(kind) ||
      term === '' ||
      countWords(term) > MAX_LOOKUP_WORDS ||
      term.length > MAX_TERM_LENGTH
    )
      return respond({ error: 'invalid-request' }, 400);
    entry.kind = kind;

    const result: LookupResult = { term };
    if (kind !== 'image') {
      const definition = await definitionFor(c, term, entry);
      if (!definition) return respond({ error: 'upstream-failed' }, 502);
      result.definition = definition;
    }
    if (kind !== 'definition') result.images = { status: 'not-found' };
    return respond(result, 200);
  });

  /** From the cache, or the providers (then cached); `undefined` if the chain failed. */
  async function definitionFor(
    c: Context<{ Bindings: Env }>,
    term: string,
    entry: LookupLog,
  ): Promise<DefinitionSection | undefined> {
    const cached = await readDefinition(term);
    if (cached) {
      entry.cache = 'hit';
      return cached;
    }
    entry.cache = 'miss';
    const context = {
      // A wrapper, because calling the global `fetch` detached from `globalThis` throws
      // "Illegal invocation" in Workers.
      fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init),
      timeoutMs: DEFAULT_TIMEOUT_MS,
    };
    const outcome = await lookupDefinition(term, context, observed(providers, entry));
    if (outcome.status === 'failed') return undefined;
    const section: DefinitionSection =
      outcome.status === 'found' ? { status: 'found', ...outcome.definition } : outcome;
    c.executionCtx.waitUntil(storeDefinition(term, section));
    return section;
  }

  return app;
}
