// Where the Worker keeps finished lookups (API-7…10). Decision: docs/decisions/0004.
import type { DefinitionSection, ImageSection } from '@litsnap/shared';

/** Found definitions: 30 days (API-7). */
export const FOUND_TTL_SECONDS = 30 * 24 * 60 * 60;
/** Not-found definitions: 1 day, so new Wiktionary entries show up (API-8). */
export const NOT_FOUND_TTL_SECONDS = 24 * 60 * 60;

/** The `caches.default` key for a normalised term's definition section (API-10). */
export const definitionCacheKey = (term: string) =>
  `https://lookup-cache.invalid/v1/definition/${encodeURIComponent(term)}`;

/** The `caches.default` key for a normalised term's images section (API-20). */
export const imagesCacheKey = (term: string) =>
  `https://lookup-cache.invalid/v1/images/${encodeURIComponent(term)}`;

async function read<Section>(key: string): Promise<Section | undefined> {
  const cached = await caches.default.match(key);
  return cached ? await cached.json<Section>() : undefined;
}

/** Never called for failures (API-9). `short`: keep a found section only as long as not-found. */
function store(
  key: string,
  section: { status: 'found' | 'not-found' },
  short = false,
): Promise<void> {
  const ttl = section.status === 'found' && !short ? FOUND_TTL_SECONDS : NOT_FOUND_TTL_SECONDS;
  return caches.default.put(
    key,
    Response.json(section, { headers: { 'Cache-Control': `max-age=${String(ttl)}` } }),
  );
}

export const readDefinition = (term: string) => read<DefinitionSection>(definitionCacheKey(term));
export const storeDefinition = (
  term: string,
  section: DefinitionSection & { status: 'found' | 'not-found' },
) => store(definitionCacheKey(term), section);
export const readImages = (term: string) => read<ImageSection>(imagesCacheKey(term));
/** `incomplete` images are kept for a day, so the missing ones can arrive (API-20). */
export const storeImages = (
  term: string,
  section: ImageSection & { status: 'found' | 'not-found' },
  incomplete = false,
) => store(imagesCacheKey(term), section, incomplete);
