import { parseFeed } from "./feed";
import { classify } from "./select";
import { SOURCES, type Source } from "./sources";

// Feeds per run. Each cron invocation gets 10 ms CPU on Workers Free; regex parsing of a
// 300 KB feed takes about a millisecond, so three feeds leave headroom. With a 30-minute cron
// every feed is refreshed roughly every 2.5 hours, which is enough for a daily brief.
const FEEDS_PER_RUN = 3;
const ITEMS_PER_FEED = 20;
const RETENTION_DAYS = 14;

export interface IngestResult {
  source: string;
  status: string;
  count: number;
}

export async function ingest(env: Env, now = Date.now()): Promise<IngestResult[]> {
  const { results } = await env.DB.prepare("SELECT source, last_run FROM feed_state").all<{ source: string; last_run: number }>();
  const lastRun = new Map(results.map((r) => [r.source, r.last_run]));
  const due = [...SOURCES].sort((a, b) => (lastRun.get(a.id) ?? 0) - (lastRun.get(b.id) ?? 0)).slice(0, FEEDS_PER_RUN);
  return Promise.all(due.map((s) => ingestOne(env, s, now)));
}

async function ingestOne(env: Env, source: Source, now: number): Promise<IngestResult> {
  let status = "ok";
  let count = 0;
  try {
    const res = await fetch(source.url, {
      headers: { "user-agent": "SecFinBrief/0.1 (personal news digest)", accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = parseFeed(await res.text(), ITEMS_PER_FEED);
    const stmts = await Promise.all(
      items.map(async (it) =>
        env.DB.prepare(
          "INSERT OR IGNORE INTO articles (id, url, source, category, region, lang, title, snippet, published_at, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ).bind(
          await sha256(it.link),
          it.link,
          source.id,
          classify(source.category, it.title, it.summary),
          source.region,
          source.lang,
          it.title,
          it.summary,
          // Feeds without dates get the fetch time; a future date (bad feed clock) is clamped to now.
          Math.min(it.published || now, now),
          now,
        ),
      ),
    );
    if (stmts.length > 0) {
      const out = await env.DB.batch(stmts);
      count = out.reduce((n, r) => n + (r.meta.changes ?? 0), 0);
    }
  } catch (err) {
    status = String(err instanceof Error ? err.message : err).slice(0, 120);
  }
  await env.DB.prepare(
    "INSERT INTO feed_state (source, last_run, last_status, last_count) VALUES (?, ?, ?, ?) ON CONFLICT (source) DO UPDATE SET last_run = excluded.last_run, last_status = excluded.last_status, last_count = excluded.last_count",
  ).bind(source.id, now, status, count).run();
  return { source: source.id, status, count };
}

export async function pruneArticles(env: Env, now = Date.now()): Promise<void> {
  await env.DB.prepare("DELETE FROM articles WHERE fetched_at < ?").bind(now - RETENTION_DAYS * 86_400_000).run();
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
