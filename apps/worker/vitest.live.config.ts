// `pnpm --filter @litsnap/worker test:live`: the live-source checks (CLIENT-12), which use the
// network, so they're kept out of `pnpm test`.
import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } })],
  test: {
    include: ['live/**/*.live.ts'],
    testTimeout: 45_000,
  },
});
