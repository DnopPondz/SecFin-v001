// Bindings from wrangler.jsonc. Replace with `npm run types` output once wrangler can run locally.
interface Env {
  AI: Ai;
  DB: D1Database;
  CACHE: KVNamespace;
  VECTORS: Vectorize;
  INGEST_QUEUE: Queue<import("./ingest").IngestMessage>;
  BRIEF_WORKFLOW: Workflow<import("./workflow").BriefParams>;
  LIVE: DurableObjectNamespace<import("./live").LiveFeed>;
  BROWSER: BrowserQuickActions;
  // Optional until Analytics Engine is enabled on the account; clicks are dropped without it.
  CLICKS?: AnalyticsEngineDataset;
  // Page views for /adms (dataset secfin_views).
  VIEWS?: AnalyticsEngineDataset;
  ANALYTICS_SQL: AnalyticsSqlBinding;
  API_LIMITER: RateLimit;
  SEARCH_LIMITER: RateLimit;
  ASK_LIMITER: RateLimit;
  LOGIN_LIMITER: RateLimit;
  // 10-digit PIN for /adms (`wrangler secret put ADMS_PIN`). /adms login is disabled without it.
  ADMS_PIN?: string;
  // Secret for /api/admin/* routes (`wrangler secret put ADMIN_KEY`).
  ADMIN_KEY?: string;
  // Turnstile secret for /api/ask; the matching public site key is in public/chat.js.
  TURNSTILE_SECRET?: string;
  // Free EIA open-data key (https://www.eia.gov/opendata/register.php) for Brent and WTI. Oil is skipped without it.
  EIA_API_KEY?: string;
  // Hard ceiling on Neurons per UTC day for this Worker; stays well under the 10,000 free allocation.
  DAILY_NEURON_BUDGET: string;
  // AI Gateway id. Empty means calls go straight to Workers AI.
  AI_GATEWAY_ID: string;
}

// Browser Run binding, Quick Actions only (needs compatibility_date 2026-03-24 or later).
interface BrowserQuickActions {
  quickAction(action: "pdf" | "screenshot" | "content" | "markdown", options: Record<string, unknown>): Promise<Response>;
}

// Analytics SQL binding (https://developers.cloudflare.com/workers/runtime-apis/bindings/analytics-sql/).
interface AnalyticsSqlBinding {
  query<T = Record<string, unknown>>(request: { query: string; params?: Record<string, string | number | boolean | null> | (string | number | boolean | null)[] }): Promise<{ data?: T[] }>;
}
