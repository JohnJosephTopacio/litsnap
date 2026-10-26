// Where the Worker keeps finished lookups (API-7…10). Decision: docs/decisions/0004.

/** Found definitions: 30 days (API-7). */
export const FOUND_TTL_SECONDS = 30 * 24 * 60 * 60;
/** Not-found definitions: 1 day, so new Wiktionary entries show up (API-8). */
export const NOT_FOUND_TTL_SECONDS = 24 * 60 * 60;

// RED PHASE: stub until the implementation PR.

/** The `caches.default` key for a normalised term's definition section (API-10). */
export const definitionCacheKey: (term: string) => string = () => {
  throw new Error('definitionCacheKey is not implemented yet');
};
