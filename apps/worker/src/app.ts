// The Worker's routes. `/lookup` spec: docs/features/lookup-api.md.
import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import {
  countWords,
  MAX_LOOKUP_WORDS,
  normalise,
  type DefinitionSection,
  type ImageSection,
  type HealthResponse,
  type LookupErrorBody,
  type LookupKind,
  type LookupResult,
} from '@litsnap/shared';
import { readDefinition, readImages, storeDefinition, storeImages } from './cache';
import { DEFINITION_PROVIDERS, lookupDefinition } from './definitions/chain';
import {
  DEFAULT_TIMEOUT_MS,
  type DefinitionProvider,
  type ProviderContext,
} from './definitions/types';
import { lookupImages } from './images/chain';
import { DETAILS_TIMEOUT_MS, type ImageOutcome } from './images/types';
import { CookieJar } from './images/wikimedia';
import { checkImageBudget, checkRateLimit, clientKey, type RateVerdict } from './rateLimit';

/** Pages allowed to read `/lookup` responses (API-15). */
export const ALLOWED_ORIGINS = [
  'https://litsnap.pages.dev',
  'http://localhost:5173',
  'http://localhost:4173',
] as const;

/** Longest normalised term the Worker looks up (API-3). */
export const MAX_TERM_LENGTH = 100;

/** Wikimedia's cookies for this Worker instance, shared by every lookup (IMG-18). */
const WIKIMEDIA_COOKIES = new CookieJar();

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
  /** The image chain (API-17). */
  images: (term: string, context: ProviderContext) => Promise<ImageOutcome>;
  rateLimit: (env: Env, ip: string) => Promise<RateVerdict>;
  /** The budget for uncached image lookups, shared by everyone (API-24). */
  imageBudget: (env: Env) => Promise<RateVerdict>;
  log: (entry: LookupLog) => void;
}

/** What production uses; tests replace some of these (lookup-api.md, "Notes for implementation"). */
export const DEFAULT_DEPS: AppDeps = {
  providers: DEFINITION_PROVIDERS,
  images: lookupImages,
  rateLimit: checkRateLimit,
  imageBudget: checkImageBudget,
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
  const { providers, images, rateLimit, imageBudget, log } = { ...DEFAULT_DEPS, ...deps };
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
    const respond = (
      body: LookupResult | LookupErrorBody,
      status: 200 | 400 | 429 | 502,
      complete = status === 200,
    ) => {
      entry.status = status;
      entry.ms = Date.now() - started;
      log(entry);
      // A partial answer mustn't be replayed by the browser on Retry (API-21).
      c.header('Cache-Control', complete ? 'public, max-age=86400' : 'no-store');
      return c.json(body, status);
    };

    // Every request counts, so this comes first (API-12); if the check fails, go ahead (API-14).
    try {
      // An IPv6 client counts by its /64 (API-23).
      const ip = clientKey(c.req.header('CF-Connecting-IP') ?? 'unknown');
      const verdict = await rateLimit(c.env, ip);
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

    const context: ProviderContext = {
      // A wrapper, because calling the global `fetch` detached from `globalThis` throws
      // "Illegal invocation" in Workers.
      fetch: (input, init) => fetch(input, init),
      timeoutMs: DEFAULT_TIMEOUT_MS,
      detailsTimeoutMs: DETAILS_TIMEOUT_MS,
      // LitSnap's Wikimedia identity, for the image Action API requests (decision 0006).
      cookies: WIKIMEDIA_COOKIES,
      ...(c.env.WIKIMEDIA_TOKEN ? { wikimediaToken: c.env.WIKIMEDIA_TOKEN } : {}),
    };
    // At the same time: one after the other could outlast the client's timeout (API-19).
    const [definition, imageSection] = await Promise.all([
      kind === 'image' ? undefined : definitionFor(c, term, entry, context),
      kind === 'definition' ? undefined : imagesFor(c, term, entry, context),
    ]);
    const sections = [definition, imageSection].filter((section) => section !== undefined);
    if (sections.every(({ status }) => status === 'failed'))
      return respond({ error: 'upstream-failed' }, 502);
    const result: LookupResult = {
      term,
      ...(definition && { definition }),
      ...(imageSection && { images: imageSection }),
    };
    return respond(result, 200, !sections.some(({ status }) => status === 'failed'));
  });

  /** From the cache, or the providers (then cached unless it failed, API-9). */
  async function definitionFor(
    c: Context<{ Bindings: Env }>,
    term: string,
    entry: LookupLog,
    context: ProviderContext,
  ): Promise<DefinitionSection> {
    const cached = await readDefinition(term);
    if (cached) {
      entry.cache = 'hit';
      return cached;
    }
    entry.cache = 'miss';
    const outcome = await lookupDefinition(term, context, observed(providers, entry));
    if (outcome.status === 'failed') return { status: 'failed' };
    const section: DefinitionSection =
      outcome.status === 'found' ? { status: 'found', ...outcome.definition } : outcome;
    c.executionCtx.waitUntil(storeDefinition(term, section));
    return section;
  }

  /** From the cache, or the image chain (then cached unless it failed, API-20). */
  async function imagesFor(
    c: Context<{ Bindings: Env }>,
    term: string,
    entry: LookupLog,
    context: ProviderContext,
  ): Promise<ImageSection> {
    const started = Date.now();
    const cached = await readImages(term);
    if (cached) {
      entry.images = { cache: 'hit', outcome: cached.status, ms: Date.now() - started };
      return cached;
    }
    // LitSnap's Wikimedia budget, shared by everyone. It fails closed: failing open would send
    // unlimited requests in LitSnap's name (API-24).
    const spent = (reason: 'budget' | 'budget-error'): ImageSection => {
      entry.images = { cache: 'miss', outcome: 'failed', reason, ms: Date.now() - started };
      return { status: 'failed' };
    };
    try {
      if (!(await imageBudget(c.env)).allowed) return spent('budget');
    } catch {
      return spent('budget-error');
    }
    const outcome = await images(term, context);
    entry.images = {
      cache: 'miss',
      outcome: outcome.status,
      ...(outcome.status === 'failed' && { reason: outcome.reason }),
      ...(outcome.status === 'found' &&
        outcome.incomplete && { reason: outcome.incomplete.reason }),
      ms: Date.now() - started,
    };
    if (outcome.status === 'failed') return { status: 'failed' };
    // The reader gets the images, never the `incomplete` flag (API-20).
    const section: ImageSection =
      outcome.status === 'found' ? { status: 'found', images: outcome.images } : outcome;
    const incomplete = outcome.status === 'found' && outcome.incomplete !== undefined;
    c.executionCtx.waitUntil(storeImages(term, section, incomplete));
    return section;
  }

  return app;
}
