// Where the Worker keeps finished lookups (API-7…10). Decision: docs/decisions/0004.
import type { DefinitionSection } from '@litsnap/shared';

/** Found definitions: 30 days (API-7). */
export const FOUND_TTL_SECONDS = 30 * 24 * 60 * 60;
/** Not-found definitions: 1 day, so new Wiktionary entries show up (API-8). */
export const NOT_FOUND_TTL_SECONDS = 24 * 60 * 60;

/** The `caches.default` key for a normalised term's definition section (API-10). */
export const definitionCacheKey = (term: string) =>
  `https://lookup-cache.invalid/v1/definition/${encodeURIComponent(term)}`;

export async function readDefinition(term: string): Promise<DefinitionSection | undefined> {
  const cached = await caches.default.match(definitionCacheKey(term));
  return cached ? await cached.json<DefinitionSection>() : undefined;
}

/** Never called for failures (API-9). */
export function storeDefinition(term: string, section: DefinitionSection): Promise<void> {
  const ttl = section.status === 'found' ? FOUND_TTL_SECONDS : NOT_FOUND_TTL_SECONDS;
  return caches.default.put(
    definitionCacheKey(term),
    Response.json(section, { headers: { 'Cache-Control': `max-age=${String(ttl)}` } }),
  );
}
