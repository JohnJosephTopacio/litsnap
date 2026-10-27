// The Worker that answers lookups. Decision: docs/decisions/0003-lookup-api-origin.md.

/** The production Worker's origin. The CSP's `connect-src` allows exactly this (CLIENT-8). */
export const LOOKUP_ORIGIN = 'https://litsnap-worker.johnjoseph-topacio-110503.workers.dev';
