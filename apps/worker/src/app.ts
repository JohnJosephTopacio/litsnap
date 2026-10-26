// The Worker's routes. `/lookup` spec: docs/features/lookup-api.md.
import { Hono } from 'hono';
import type { HealthResponse, LookupKind } from '@litsnap/shared';
import { DEFINITION_PROVIDERS } from './definitions/chain';
import type { DefinitionProvider } from './definitions/types';
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
}

export interface AppDeps {
  providers: readonly DefinitionProvider[];
  rateLimit: (env: Env, ip: string) => Promise<RateVerdict>;
  log: (entry: LookupLog) => void;
}

export const DEFAULT_DEPS: AppDeps = {
  providers: DEFINITION_PROVIDERS,
  rateLimit: checkRateLimit,
  log: (entry) => {
    console.log(JSON.stringify(entry));
  },
};

// RED PHASE: `deps` is used by the implementation PR.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function createApp(deps: Partial<AppDeps> = {}) {
  const app = new Hono<{ Bindings: Env }>();

  app.get('/health', (c) => c.json<HealthResponse>({ status: 'ok', service: 'litsnap-worker' }));

  // RED PHASE: stub until the implementation PR.
  app.get('/lookup', (c) => c.text('Not implemented yet', 501));

  return app;
}
