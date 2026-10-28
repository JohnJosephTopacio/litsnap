import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      // A stand-in for the WIKIMEDIA_TOKEN secret (decision 0006), so tests can see it's used.
      miniflare: { bindings: { WIKIMEDIA_TOKEN: 'test-token' } },
    }),
  ],
  test: {
    // The first request in a file boots the Worker and its Durable Object, which took over the
    // default 5 s when `pnpm check` ran the web tests alongside.
    testTimeout: 15_000,
  },
});
