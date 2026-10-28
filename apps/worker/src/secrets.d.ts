// Secrets aren't in wrangler.jsonc, so `wrangler types` doesn't know them. Set in the Cloudflare
// dashboard (decision 0006); missing in tests and `pnpm dev` unless given.
interface Env {
  WIKIMEDIA_TOKEN?: string;
}
