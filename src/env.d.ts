// Bindings from wrangler.jsonc. Replace with `npm run types` output once wrangler can run locally.
interface Env {
  AI: Ai;
  DB: D1Database;
  CACHE: KVNamespace;
  API_LIMITER: RateLimit;
  // Secret for /api/admin/* routes (`wrangler secret put ADMIN_KEY`).
  ADMIN_KEY?: string;
  // Hard ceiling on Neurons per UTC day for this Worker; stays well under the 10,000 free allocation.
  DAILY_NEURON_BUDGET: string;
  // Optional AI Gateway id. Empty means calls go straight to Workers AI.
  AI_GATEWAY_ID: string;
}
