import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { configDefaults, defineConfig } from 'vitest/config';
import { CONTENT_SECURITY_POLICY, headersFile } from './config/csp.ts';
import { formatNotices, packageNotices, vendoredNotices } from './config/licenses.ts';

/** Writes `dist/_headers`, which Cloudflare Pages reads to set response headers. */
function cloudflareHeaders(): Plugin {
  return {
    name: 'litsnap:cloudflare-headers',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: '_headers', source: headersFile() });
    },
  };
}

/**
 * Writes `dist/third-party-licenses.txt` (TERMS-5): the licence of every npm package with code in
 * the bundle, plus everything under `vendor/`. Minifying strips licence comments, so the notices
 * that MIT/BSD/Apache require have to ship as a separate file.
 */
function thirdPartyLicenses(): Plugin {
  return {
    name: 'litsnap:third-party-licenses',
    apply: 'build',
    generateBundle(_options, bundle) {
      // Only modules that contributed code: an import that was fully tree-shaken ships nothing.
      const bundled = Object.values(bundle).flatMap((output) =>
        output.type === 'chunk'
          ? Object.entries(output.modules)
              .filter(([, module]) => module.renderedLength > 0)
              .map(([id]) => id)
          : [],
      );
      const vendorDir = fileURLToPath(new URL('./vendor', import.meta.url));
      const notices = [...packageNotices(bundled), ...vendoredNotices(vendorDir)];
      this.emitFile({
        type: 'asset',
        fileName: 'third-party-licenses.txt',
        source: formatNotices(notices),
      });
    },
  };
}

const FOLIATE_DIR = fileURLToPath(new URL('./vendor/foliate-js', import.meta.url));

/** foliate-js modules for formats and features LitSnap doesn't ship (see vendor/foliate-js/VENDORED.md). */
const FOLIATE_UNUSED = new Set([
  './pdf.js',
  './mobi.js',
  './fb2.js',
  './comic-book.js',
  './search.js',
  './tts.js',
  './vendor/fflate.js',
]);
const STUB_PREFIX = '\0foliate-unused:';

/**
 * Resolves foliate's dynamic imports of unused modules to a stub that throws, so the vendored code
 * stays unchanged and pdf.js (about 12 MB) isn't needed. We only pass EPUBs, which never reach them.
 */
function foliateStubs(): Plugin {
  return {
    name: 'litsnap:foliate-stubs',
    enforce: 'pre',
    resolveId(source, importer) {
      const fromFoliate = importer?.replace(/\\/g, '/').startsWith(FOLIATE_DIR.replace(/\\/g, '/'));
      return fromFoliate && FOLIATE_UNUSED.has(source) ? STUB_PREFIX + source : undefined;
    },
    load(id) {
      if (!id.startsWith(STUB_PREFIX)) return undefined;
      const name = JSON.stringify(id.slice(STUB_PREFIX.length));
      return `throw new Error('foliate-js ' + ${name} + ' is not included in LitSnap');`;
    },
  };
}

export default defineConfig({
  plugins: [react(), foliateStubs(), cloudflareHeaders(), thirdPartyLicenses()],
  resolve: { alias: { 'foliate-js': FOLIATE_DIR } },
  // Same policy as production, so Playwright tests what ships (decision 0002).
  preview: { headers: { 'Content-Security-Policy': CONTENT_SECURITY_POLICY } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    // e2e/ is Playwright's, run with `pnpm test:e2e`.
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
});
