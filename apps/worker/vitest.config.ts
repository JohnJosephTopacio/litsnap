import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } })],
  test: {
    // The first request in a file boots the Worker and its Durable Object, which took over the
    // default 5 s when `pnpm check` ran the web tests alongside.
    testTimeout: 15_000,
  },
});
