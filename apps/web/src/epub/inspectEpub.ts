// Decides whether an EPUB can be opened, before it is rendered or stored.
// Spec: docs/features/drm-detection.md. This only looks for DRM markers; it never decrypts anything.

export type DrmScheme = 'adobe-adept' | 'readium-lcp' | 'apple-fairplay' | 'unknown-encryption';

export type EpubInspection =
  { status: 'ok' } | { status: 'drm'; scheme: DrmScheme } | { status: 'invalid' };

export function inspectEpub(file: Blob): Promise<EpubInspection> {
  return Promise.reject(
    new Error(`inspectEpub is not implemented yet (got ${String(file.size)} bytes)`),
  );
}
