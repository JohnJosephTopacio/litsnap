import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { configDefaults, defineConfig } from 'vitest/config';
import { CONTENT_SECURITY_POLICY, headersFile } from './config/csp.ts';

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

export default defineConfig({
  plugins: [react(), cloudflareHeaders()],
  // Same policy as production, so Playwright tests what ships (decision 0002).
  preview: { headers: { 'Content-Security-Policy': CONTENT_SECURITY_POLICY } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    // e2e/ is Playwright's, run with `pnpm test:e2e`.
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
});
