/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `pnpm dev` only: the Worker to use instead of `wrangler dev` (lookup-client.md, CLIENT-7). */
  readonly VITE_LOOKUP_URL?: string;
}
