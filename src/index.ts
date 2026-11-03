import { Hono } from "hono";
import { neuronsUsed } from "./ai";
import { buildBrief, saveBrief, type Brief } from "./brief";
import { ingest, pruneArticles } from "./ingest";
import { renderRss } from "./rss";

// 05:30 Thai time. Must match the second entry of triggers.crons in wrangler.jsonc.
const BRIEF_CRON = "30 22 * * *";

const app = new Hono<{ Bindings: Env }>();

// Per-IP ceiling in front of everything the Worker serves (static assets never reach this).
app.use("*", async (c, next) => {
  const { success } = await c.env.API_LIMITER.limit({ key: c.req.header("CF-Connecting-IP") ?? "unknown" });
  if (!success) return c.json({ ok: false, error: "ใช้งานถี่เกินไป รอสักครู่แล้วลองใหม่" }, 429);
  await next();
});

app.get("/api/health", (c) => c.text("secfin-brief: ok"));

async function latestBrief(env: Env): Promise<string | null> {
  const cached = await env.CACHE.get("brief:latest");
  if (cached) return cached;
  const row = await env.DB.prepare("SELECT body FROM briefs ORDER BY date DESC LIMIT 1").first<{ body: string }>();
  return row?.body ?? null;
}

const jsonHeaders = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=300" };

app.get("/api/brief/latest", async (c) => {
  const body = await latestBrief(c.env);
  return body ? c.body(body, 200, jsonHeaders) : c.json({ ok: false, error: "ยังไม่มีสรุปข่าว" }, 404);
});

app.get("/api/brief/:date{\\d{4}-\\d{2}-\\d{2}}", async (c) => {
  const row = await c.env.DB.prepare("SELECT body FROM briefs WHERE date = ?").bind(c.req.param("date")).first<{ body: string }>();
  return row ? c.body(row.body, 200, jsonHeaders) : c.json({ ok: false, error: "ไม่พบสรุปข่าวของวันนี้" }, 404);
});

app.get("/api/briefs", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT date FROM briefs ORDER BY date DESC LIMIT 30").all<{ date: string }>();
  return c.json(results.map((r) => r.date), 200, { "Cache-Control": "public, max-age=300" });
});

app.get("/rss.xml", async (c) => {
  const body = await latestBrief(c.env);
  const brief = body ? (JSON.parse(body) as Brief) : null;
  return c.body(renderRss(brief, new URL(c.req.url).origin), 200, {
    "Content-Type": "application/rss+xml; charset=utf-8",
    "Cache-Control": "public, max-age=900",
  });
});

// Constant-time comparison so the key cannot be guessed byte by byte.
function keyMatches(given: string | undefined, expected: string | undefined): boolean {
  if (!given || !expected) return false;
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  return a.byteLength === b.byteLength && crypto.subtle.timingSafeEqual(a, b);
}

// Feed health and today's Neuron spend. Admin-only because it reveals operating details.
app.get("/api/admin/status", async (c) => {
  if (!keyMatches(c.req.header("x-admin-key"), c.env.ADMIN_KEY)) return c.notFound();
  const { results } = await c.env.DB.prepare("SELECT source, last_run, last_status, last_count FROM feed_state ORDER BY source").all();
  const articles = await c.env.DB.prepare("SELECT category, COUNT(*) AS n FROM articles GROUP BY category").all();
  return c.json({ feeds: results, articles: articles.results, neuronsToday: await neuronsUsed(c.env), budget: Number(c.env.DAILY_NEURON_BUDGET) });
});

// Manual runs for testing. ?task=ingest fetches the next feeds; ?task=brief rebuilds today's brief (costs Neurons).
app.post("/api/admin/run", async (c) => {
  if (!keyMatches(c.req.header("x-admin-key"), c.env.ADMIN_KEY)) return c.notFound();
  const task = c.req.query("task");
  if (task === "ingest") return c.json(await ingest(c.env));
  if (task === "brief") {
    const brief = await buildBrief(c.env);
    await saveBrief(c.env, brief);
    return c.json({ date: brief.date, neurons: brief.neurons, notes: brief.notes, counts: Object.fromEntries(Object.entries(brief.sections).map(([k, v]) => [k, v.length])) });
  }
  return c.json({ ok: false, error: "task must be ingest or brief" }, 400);
});

export default {
  fetch: app.fetch,
  async scheduled(controller, env, ctx) {
    if (controller.cron === BRIEF_CRON) {
      const brief = await buildBrief(env, controller.scheduledTime);
      await saveBrief(env, brief);
      ctx.waitUntil(pruneArticles(env, controller.scheduledTime));
      console.log(`brief ${brief.date}: ${brief.neurons.toFixed(0)} neurons`, brief.notes);
      return;
    }
    const results = await ingest(env, controller.scheduledTime);
    console.log("ingest", results);
  },
} satisfies ExportedHandler<Env>;
