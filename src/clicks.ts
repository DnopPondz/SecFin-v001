import { sha256 } from "./hash";
import { CATEGORIES } from "./sources";

// Reader clicks go to Workers Analytics Engine; the weekly "most read" list is queried back with
// the Analytics SQL binding (no API token). URLs are checked against stored articles before they
// are shown, so a forged beacon cannot put an arbitrary link on the page.

const KINDS = ["brief", "search", "ticker", "ask", "popular", "watch", "timeline"] as const;
const POPULAR_TTL_SECONDS = 1800;

export interface ClickBody {
  url?: unknown;
  category?: unknown;
  kind?: unknown;
}

export function validClick(body: ClickBody): { url: string; category: string; kind: string } | null {
  const { url, category, kind } = body;
  if (typeof url !== "string" || url.length > 500 || !/^https?:\/\//.test(url)) return null;
  const cat = typeof category === "string" && (CATEGORIES as string[]).includes(category) ? category : "other";
  const k = typeof kind === "string" && (KINDS as readonly string[]).includes(kind) ? kind : "brief";
  return { url, category: cat, kind: k };
}

export function recordClick(env: Env, click: { url: string; category: string; kind: string }): void {
  // Non-blocking by design; no await.
  env.CLICKS?.writeDataPoint({ indexes: [click.category], blobs: [click.category, click.kind, click.url] });
}

export interface PopularItem {
  url: string;
  title: string;
  source: string;
  category: string;
  clicks: number;
}

export async function popular(env: Env): Promise<PopularItem[]> {
  if (!env.CLICKS) return [];
  const cached = await env.CACHE.get<PopularItem[]>("popular", "json");
  if (cached) return cached;
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const res = await env.ANALYTICS_SQL.query<{ url: string; clicks: number }>({
    query: `SELECT blob3 AS url, COUNT(*) AS clicks FROM events.analyticsEngine.secfin_clicks WHERE timestamp >= $since GROUP BY blob3 ORDER BY clicks DESC LIMIT 20`,
    params: { since },
  });
  const rows = res.data ?? [];
  const items: PopularItem[] = [];
  for (const r of rows) {
    const a = await env.DB.prepare("SELECT title, source, category FROM articles WHERE id = ?").bind(await sha256(r.url)).first<{ title: string; source: string; category: string }>();
    if (a) items.push({ url: r.url, title: a.title, source: a.source, category: a.category, clicks: Number(r.clicks) });
    if (items.length >= 5) break;
  }
  // An empty list is not cached: Analytics Engine data lands a minute or so after the click.
  if (items.length > 0) await env.CACHE.put("popular", JSON.stringify(items), { expirationTtl: POPULAR_TTL_SECONDS });
  return items;
}
