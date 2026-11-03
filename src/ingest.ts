import { embedPending } from "./cluster";
import { parseFeed } from "./feed";
import { sha256 } from "./hash";
import type { TickerItem } from "./live";
import { admit } from "./select";
import { SOURCES, sourceById, type Source } from "./sources";

// Only fresh stories go to the live ticker, not the backlog a feed returns on its first fetch.
const TICKER_MAX_AGE_MS = 6 * 60 * 60 * 1000;

const ITEMS_PER_FEED = 20;
const RETENTION_DAYS = 14;
// Messages are spread out so feeds are fetched one at a time and each batch of vectors is
// queryable before the next feed is clustered against it.
const STAGGER_SECONDS = 30;

export interface IngestMessage {
  source: string;
}

export interface IngestResult {
  source: string;
  status: string;
  count: number;
  embedded: number;
}

// Hourly cron: one queue message per feed. 21 feeds x 24 runs x 3 operations (write, read,
// delete) is about 1,500 of the 10,000 free Queues operations a day.
export async function enqueueFeeds(env: Env): Promise<number> {
  await env.INGEST_QUEUE.sendBatch(SOURCES.map((s, i) => ({ body: { source: s.id }, delaySeconds: i * STAGGER_SECONDS })));
  return SOURCES.length;
}

// Queue consumer, one feed per invocation so each gets its own 10 ms CPU budget.
export async function handleIngest(batch: MessageBatch<IngestMessage>, env: Env): Promise<void> {
  for (const msg of batch.messages) {
    const source = sourceById(msg.body.source);
    if (!source) {
      msg.ack(); // a feed removed from SOURCES while its message was queued
      continue;
    }
    const result = await ingestOne(env, source);
    console.log("ingest", result);
    msg.ack();
  }
}

export async function ingestOne(env: Env, source: Source, now = Date.now()): Promise<IngestResult> {
  let status = "ok";
  let count = 0;
  let embedded = 0;
  let fresh: TickerItem[] = [];
  try {
    const res = await fetch(source.url, {
      headers: { "user-agent": "SecFinBrief/0.1 (personal news digest)", accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // admit() drops off-topic items from keyword-filtered feeds and tiny quakes before anything is stored.
    const items = parseFeed(await res.text(), ITEMS_PER_FEED).flatMap((it) => {
      const category = admit(source, it.title, it.summary);
      // Feeds without dates get the fetch time; a future date (bad feed clock) is clamped to now.
      return category ? [{ ...it, category, published: Math.min(it.published || now, now) }] : [];
    });
    const stmts = await Promise.all(
      items.map(async (it) =>
        env.DB.prepare(
          "INSERT OR IGNORE INTO articles (id, url, source, category, region, lang, title, snippet, published_at, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ).bind(await sha256(it.link), it.link, source.id, it.category, source.region, source.lang, it.title, it.summary, it.published, now),
      ),
    );
    if (stmts.length > 0) {
      const out = await env.DB.batch(stmts);
      count = out.reduce((n, r) => n + (r.meta.changes ?? 0), 0);
      fresh = items
        .filter((it, i) => (out[i].meta.changes ?? 0) > 0 && now - it.published <= TICKER_MAX_AGE_MS)
        .map((it) => ({ title: it.title, url: it.link, sourceName: source.name, category: it.category, published: it.published }));
    }
  } catch (err) {
    status = String(err instanceof Error ? err.message : err).slice(0, 120);
  }
  if (fresh.length > 0) {
    try {
      await env.LIVE.get(env.LIVE.idFromName("global")).publish(fresh);
    } catch (err) {
      console.error("live publish:", err);
    }
  }
  // Also picks up articles whose embedding failed on an earlier run.
  try {
    embedded = await embedPending(env, source.id, now);
  } catch (err) {
    console.error(`embed ${source.id}:`, err);
  }
  await env.DB.prepare(
    "INSERT INTO feed_state (source, last_run, last_status, last_count) VALUES (?, ?, ?, ?) ON CONFLICT (source) DO UPDATE SET last_run = excluded.last_run, last_status = excluded.last_status, last_count = excluded.last_count",
  ).bind(source.id, now, status, count).run();
  return { source: source.id, status, count, embedded };
}

// Vectors go first: Vectorize holds 5M stored dimensions on Free (about 4,800 bge-m3 vectors),
// so old ones must not linger after their rows are gone.
export async function pruneArticles(env: Env, now = Date.now()): Promise<number> {
  const cutoff = now - RETENTION_DAYS * 86_400_000;
  const { results } = await env.DB.prepare("SELECT id FROM articles WHERE fetched_at < ? AND embedded = 1 LIMIT 1000").bind(cutoff).all<{ id: string }>();
  if (results.length > 0) await env.VECTORS.deleteByIds(results.map((r) => r.id));
  const out = await env.DB.prepare("DELETE FROM articles WHERE fetched_at < ?").bind(cutoff).run();
  await env.DB.prepare("DELETE FROM cves WHERE checked_at < ?").bind(cutoff).run();
  return out.meta.changes ?? 0;
}
