import { Hono, type Context } from "hono";
import {
  CLEAR_COOKIE, SESSION_COOKIE, isBot, issueSession, pinConfigured, quotas, readCookie, recordView, sessionCookie,
  cached, storyReport, timingSafeEqualStr, traffic, validView, verifySession, type ViewBody,
} from "./adms";
import { BudgetExceeded, neuronsUsed } from "./ai";
import { ask, isThai, validHistory } from "./ask";
import type { Brief } from "./brief";
import { popular, recordClick, validClick, type ClickBody } from "./clicks";
import { enqueueFeeds, handleIngest, type IngestMessage } from "./ingest";
import { renderRss } from "./rss";
import { healthProblems } from "./health";
import { search } from "./search";
import { loadSettings, normalizeSettings, retagRecent, saveSettings } from "./settings";
import { openReports, resolveReport, saveReport, validReport, type ReportBody } from "./reports";
import { SOURCES, sourceById } from "./sources";
import { backfillBriefImages } from "./story";
import { thaiDate } from "./time";
import { verifyTurnstile } from "./turnstile";
import { loadWeekBriefs, makeWeeklyPdf, renderWeeklyHtml } from "./weekly";
import { loadWidgets, refreshWidgets } from "./widgets";

export { BriefWorkflow } from "./workflow";
export { LiveFeed } from "./live";

// Must match triggers.crons in wrangler.jsonc. 05:30 Thai time daily, 06:00 Thai time Sunday.
const BRIEF_CRON = "30 22 * * *";
const WEEKLY_CRON = "0 23 * * 6";

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

// Detailed write-up for one story. Falls back to the brief entry while the write-up is still being
// generated (or if the publisher's page could not be summarised, or the write-up was pruned after
// 14 days), so the story page always has content. ?d=YYYY-MM-DD names the edition the link came from.
app.get("/api/story/:id{[0-9a-f]{64}}", async (c) => {
  const id = c.req.param("id");
  const row = await c.env.DB.prepare("SELECT body FROM stories WHERE id = ?").bind(id).first<{ body: string }>();
  if (row) return c.body(`{"detail":${row.body}}`, 200, jsonHeaders);
  const date = c.req.query("d");
  const edition = date && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? (await c.env.DB.prepare("SELECT body FROM briefs WHERE date = ?").bind(date).first<{ body: string }>())?.body
    : null;
  const latest = edition ?? (await latestBrief(c.env));
  const brief = latest ? (JSON.parse(latest) as Brief) : null;
  const groups: [string, Brief["sections"][keyof Brief["sections"]]][] = Object.entries(brief?.sections ?? {});
  if (brief?.midday) groups.push([brief.midday.category, brief.midday.items]);
  for (const [category, items] of groups) {
    const item = items.find((it) => it.id === id);
    if (item) return c.json({ brief: { ...item, category } }, 200, { "Cache-Control": "no-store" });
  }
  return c.json({ ok: false, error: "ไม่พบข่าวนี้" }, 404);
});

// Every source that carried the story, oldest first (articles are kept 14 days).
app.get("/api/story/:id{[0-9a-f]{64}}/timeline", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT url, source, title, published_at FROM articles WHERE cluster_id = (SELECT cluster_id FROM articles WHERE id = ?) ORDER BY published_at LIMIT 30",
  )
    .bind(c.req.param("id"))
    .all<{ url: string; source: string; title: string; published_at: number }>();
  const items = results.map((r) => ({ url: r.url, title: r.title, sourceName: sourceById(r.source)?.name ?? r.source, published: r.published_at }));
  return c.json(items, 200, { "Cache-Control": "public, max-age=600" });
});

app.get("/api/briefs", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT date FROM briefs ORDER BY date DESC LIMIT 90").all<{ date: string }>();
  return c.json(results.map((r) => r.date), 200, { "Cache-Control": "public, max-age=300" });
});

// PM2.5 for the northern provinces and market numbers, refreshed hourly by the cron.
app.get("/api/widgets", async (c) => {
  const w = await loadWidgets(c.env);
  return w ? c.json(w, 200, { "Cache-Control": "public, max-age=600" }) : c.json({ ok: false, error: "ยังไม่มีข้อมูล" }, 404);
});

// Watchlist matches from the last 72 hours, one per story.
app.get("/api/watch", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT url, source, category, title, published_at, watch, cluster_id FROM articles WHERE watch IS NOT NULL AND published_at >= ? ORDER BY published_at DESC LIMIT 40",
  )
    .bind(Date.now() - 72 * 3_600_000)
    .all<{ url: string; source: string; category: string; title: string; published_at: number; watch: string; cluster_id: string | null }>();
  const seen = new Set<string>();
  const items = results
    .filter((r) => {
      const key = r.cluster_id ?? r.url;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8)
    .map((r) => ({ url: r.url, title: r.title, category: r.category, sourceName: sourceById(r.source)?.name ?? r.source, published: r.published_at, watch: r.watch.split(",") }));
  return c.json(items, 200, { "Cache-Control": "public, max-age=300" });
});

// Each search costs Neurons, so it has its own tighter per-IP limit on top of the daily budget.
app.get("/api/search", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  if (q.length < 2 || q.length > 200) return c.json({ ok: false, error: "คำค้นต้องยาว 2 ถึง 200 ตัวอักษร" }, 400);
  const { success } = await c.env.SEARCH_LIMITER.limit({ key: c.req.header("CF-Connecting-IP") ?? "unknown" });
  if (!success) return c.json({ ok: false, error: "ค้นหาถี่เกินไป รอสักครู่แล้วลองใหม่" }, 429);
  try {
    return c.json({ ok: true, hits: await search(c.env, q) }, 200, { "Cache-Control": "public, max-age=600" });
  } catch (err) {
    if (err instanceof BudgetExceeded) return c.json({ ok: false, error: "วันนี้ใช้โควตา AI ครบแล้ว ลองใหม่พรุ่งนี้" }, 503);
    throw err;
  }
});

// Questions cost about 35 Neurons each: Turnstile, 3 per minute per IP, and the brief reserve.
app.post("/api/ask", async (c) => {
  const ip = c.req.header("CF-Connecting-IP");
  const body = (await c.req.json().catch(() => ({}))) as { q?: unknown; token?: unknown; history?: unknown };
  const q = typeof body.q === "string" ? body.q.trim() : "";
  if (q.length < 5 || q.length > 300) return c.json({ ok: false, error: "คำถามต้องยาว 5 ถึง 300 ตัวอักษร" }, 400);
  const { success } = await c.env.ASK_LIMITER.limit({ key: ip ?? "unknown" });
  if (!success) return c.json({ ok: false, error: "ถามถี่เกินไป รอสักครู่แล้วลองใหม่" }, 429);
  if (!(await verifyTurnstile(c.env, typeof body.token === "string" ? body.token : undefined, ip))) {
    return c.json({ ok: false, error: "ยืนยันว่าไม่ใช่บอทไม่สำเร็จ ลองใหม่อีกครั้ง" }, 403);
  }
  try {
    return c.json({ ok: true, ...(await ask(c.env, q, Date.now(), validHistory(body.history))) });
  } catch (err) {
    if (err instanceof BudgetExceeded) return c.json({ ok: false, error: "วันนี้ใช้โควตา AI ครบแล้ว ลองใหม่พรุ่งนี้" }, 503);
    // A cut-off or malformed reply: tell the reader what to try instead of a bare 500.
    console.error("ask:", err);
    const thai = isThai(q);
    return c.json({ ok: false, error: thai ? "ตอบไม่สำเร็จ ลองถามให้แคบลง เช่น ระบุชื่อผลิตภัณฑ์หรือช่วงเวลา" : "Could not answer. Try a narrower question, such as a product name or time period." }, 502);
  }
});

// Live headline ticker over a hibernatable WebSocket.
app.get("/ws", async (c) => {
  if (c.req.header("Upgrade") !== "websocket") return c.text("Expected WebSocket", 426);
  return c.env.LIVE.get(c.env.LIVE.idFromName("global")).fetch(c.req.raw);
});

app.post("/api/click", async (c) => {
  const click = validClick((await c.req.json().catch(() => ({}))) as ClickBody);
  if (click) recordClick(c.env, click);
  return c.body(null, 204);
});

// "Report a mistake" from a story page. Bots are ignored; 3 per minute per IP.
app.post("/api/report", async (c) => {
  if (isBot(c.req.header("user-agent"))) return c.body(null, 204);
  const { success } = await c.env.REPORT_LIMITER.limit({ key: c.req.header("CF-Connecting-IP") ?? "unknown" });
  if (!success) return c.json({ ok: false, error: "too-many" }, 429);
  const report = validReport((await c.req.json().catch(() => ({}))) as ReportBody);
  if (!report) return c.json({ ok: false, error: "invalid" }, 400);
  await saveReport(c.env, report);
  return c.json({ ok: true });
});

// Every source with its type and caution note, for chips on cards and the /sources page.
app.get("/api/sources", (c) =>
  c.json(
    SOURCES.map(({ id, name, url, category, region, lang, tier, note }) => ({ id, name, site: new URL(url).origin, category, region, lang, tier, note: note ?? null })),
    200,
    { "Cache-Control": "public, max-age=3600" },
  ));

// Page-view beacon for /adms. Bots are skipped; the owner's own visits are flagged, not dropped.
app.post("/api/view", async (c) => {
  const ua = c.req.header("user-agent");
  if (isBot(ua)) return c.body(null, 204);
  const view = validView((await c.req.json().catch(() => ({}))) as ViewBody, new URL(c.req.url).hostname);
  if (view) {
    const owner = await verifySession(readCookie(c.req.header("cookie"), SESSION_COOKIE), c.env.ADMS_PIN, Date.now());
    recordView(c.env, view, c.req.raw.cf as { country?: string; city?: string; region?: string } | undefined, ua, owner);
  }
  return c.body(null, 204);
});

app.get("/api/popular", async (c) => {
  try {
    return c.json(await popular(c.env), 200, { "Cache-Control": "public, max-age=600" });
  } catch (err) {
    console.error("popular:", err);
    return c.json([], 200);
  }
});

app.get("/weekly.pdf", async (c) => {
  const date = await c.env.CACHE.get("pdf:latest");
  const pdf = date ? await c.env.CACHE.get(`pdf:${date}`, "arrayBuffer") : null;
  if (!pdf) return c.json({ ok: false, error: "ยังไม่มี PDF สรุปประจำสัปดาห์" }, 404);
  return c.body(pdf, 200, {
    "Content-Type": "application/pdf",
    "Content-Disposition": `inline; filename="secfin-weekly-${date}.pdf"`,
    "Cache-Control": "public, max-age=3600",
  });
});

// The HTML the PDF is printed from, useful for checking layout without spending browser time.
app.get("/weekly.html", async (c) => c.html(renderWeeklyHtml(await loadWeekBriefs(c.env, Date.now()), Date.now())));

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
  const articles = await c.env.DB.prepare(
    "SELECT category, COUNT(*) AS n, SUM(embedded) AS embedded, COUNT(DISTINCT cluster_id) AS clusters FROM articles GROUP BY category",
  ).all();
  return c.json({ feeds: results, articles: articles.results, neuronsToday: await neuronsUsed(c.env), budget: Number(c.env.DAILY_NEURON_BUDGET) });
});

// Manual runs. ?task=ingest queues every feed; ?task=brief starts the brief Workflow (costs Neurons).
app.post("/api/admin/run", async (c) => {
  if (!keyMatches(c.req.header("x-admin-key"), c.env.ADMIN_KEY)) return c.notFound();
  const task = c.req.query("task");
  if (task === "ingest") return c.json({ queued: await enqueueFeeds(c.env) });
  if (task === "brief") return c.json({ workflow: await startBrief(c.env, Date.now()) });
  if (task === "midday") return c.json({ workflow: await startBrief(c.env, Date.now(), "midday") });
  if (task === "weekly") return c.json(await makeWeeklyPdf(c.env));
  if (task === "images") return c.json({ patched: await backfillBriefImages(c.env, thaiDate(Date.now())) });
  if (task === "widgets") return c.json(await refreshWidgets(c.env));
  return c.json({ ok: false, error: "task must be ingest, brief, midday, weekly, images or widgets" }, 400);
});

app.get("/api/admin/settings", async (c) => {
  if (!keyMatches(c.req.header("x-admin-key"), c.env.ADMIN_KEY)) return c.notFound();
  return c.json({ settings: await loadSettings(c.env) });
});

// Saving re-tags the last 72 hours of articles so the front page and the next brief use the new list.
app.put("/api/admin/settings", async (c) => {
  if (!keyMatches(c.req.header("x-admin-key"), c.env.ADMIN_KEY)) return c.notFound();
  const settings = normalizeSettings(await c.req.json().catch(() => null));
  await saveSettings(c.env, settings);
  return c.json({ settings, retagged: await retagRecent(c.env, settings.watch) });
});

// What needs attention right now: missing brief, unfinished write-ups, feed problems, Neuron spend.
app.get("/api/admin/health", async (c) => {
  if (!keyMatches(c.req.header("x-admin-key"), c.env.ADMIN_KEY)) return c.notFound();
  return c.json({ problems: await healthProblems(c.env, Date.now()) });
});

// Same as /api/ask without Turnstile, for checking answer quality from a script.
app.post("/api/admin/ask", async (c) => {
  if (!keyMatches(c.req.header("x-admin-key"), c.env.ADMIN_KEY)) return c.notFound();
  const { q, history } = (await c.req.json().catch(() => ({}))) as { q?: string; history?: unknown };
  if (!q) return c.json({ ok: false, error: "q required" }, 400);
  return c.json(await ask(c.env, q, Date.now(), validHistory(history)));
});

// Screenshot of one of this site's own pages through Browser Run, for checking layout and themes.
// Same-origin paths only, so it cannot be used to render arbitrary sites.
app.get("/api/admin/screenshot", async (c) => {
  if (!keyMatches(c.req.header("x-admin-key"), c.env.ADMIN_KEY)) return c.notFound();
  const path = c.req.query("path") ?? "/";
  if (!path.startsWith("/") || path.startsWith("//")) return c.json({ ok: false, error: "path must be a same-origin path" }, 400);
  const width = Math.min(Math.max(Number(c.req.query("w")) || 1280, 320), 1600);
  const res = await c.env.BROWSER.quickAction("screenshot", {
    url: new URL(path, c.req.url).toString(),
    viewport: { width, height: 900 },
    gotoOptions: { waitUntil: "networkidle0", timeout: 30_000 },
    // ?wait=ms delays the capture, e.g. to check that the ticker animation moves.
    waitForTimeout: Math.min(Math.max(Number(c.req.query("wait")) || 0, 0), 10_000),
    screenshotOptions: { fullPage: c.req.query("full") === "1" },
  });
  return new Response(res.body, { status: res.status, headers: { "Content-Type": res.headers.get("Content-Type") ?? "image/png" } });
});

app.get("/api/admin/workflow/:id", async (c) => {
  if (!keyMatches(c.req.header("x-admin-key"), c.env.ADMIN_KEY)) return c.notFound();
  const instance = await c.env.BRIEF_WORKFLOW.get(c.req.param("id"));
  return c.json(await instance.status());
});

// /adms: owner dashboard behind a 10-digit PIN (secret ADMS_PIN) and a signed HttpOnly cookie.
async function admsSession(c: Context<{ Bindings: Env }>): Promise<boolean> {
  return verifySession(readCookie(c.req.header("cookie"), SESSION_COOKIE), c.env.ADMS_PIN, Date.now());
}

app.post("/api/adms/login", async (c) => {
  if (!pinConfigured(c.env)) return c.json({ ok: false, error: "pin-not-set" }, 503);
  const { success } = await c.env.LOGIN_LIMITER.limit({ key: c.req.header("CF-Connecting-IP") ?? "unknown" });
  if (!success) return c.json({ ok: false, error: "too-many" }, 429);
  const { pin } = (await c.req.json().catch(() => ({}))) as { pin?: unknown };
  if (typeof pin !== "string" || !/^\d{10}$/.test(pin) || !timingSafeEqualStr(pin, c.env.ADMS_PIN!)) {
    return c.json({ ok: false, error: "wrong-pin" }, 401);
  }
  return c.json({ ok: true }, 200, { "Set-Cookie": sessionCookie(await issueSession(c.env.ADMS_PIN!, Date.now())), "Cache-Control": "no-store" });
});

app.post("/api/adms/logout", (c) => c.json({ ok: true }, 200, { "Set-Cookie": CLEAR_COOKIE }));

app.get("/api/adms/session", async (c) =>
  c.json({ ok: await admsSession(c), configured: pinConfigured(c.env) }, 200, { "Cache-Control": "no-store" }));

const rangeDays = (v: string | undefined) => (v === "1" ? 1 : v === "30" ? 30 : 7);

app.get("/api/adms/traffic", async (c) => {
  if (!(await admsSession(c))) return c.json({ ok: false }, 401);
  const days = rangeDays(c.req.query("days"));
  const owner = c.req.query("owner") === "1";
  const data = await cached(c.env, `traffic:${days}:${owner ? 1 : 0}`, c.req.query("fresh") === "1", () => traffic(c.env, days, owner));
  return c.json(data, 200, { "Cache-Control": "no-store" });
});

app.get("/api/adms/stories", async (c) => {
  if (!(await admsSession(c))) return c.json({ ok: false }, 401);
  const days = rangeDays(c.req.query("days"));
  const owner = c.req.query("owner") === "1";
  const data = await cached(c.env, `stories:${days}:${owner ? 1 : 0}`, c.req.query("fresh") === "1", () => storyReport(c.env, days, owner));
  return c.json(data, 200, { "Cache-Control": "no-store" });
});

app.get("/api/adms/reports", async (c) => {
  if (!(await admsSession(c))) return c.json({ ok: false }, 401);
  return c.json(await openReports(c.env), 200, { "Cache-Control": "no-store" });
});

app.post("/api/adms/reports/:id{\\d+}/resolve", async (c) => {
  if (!(await admsSession(c))) return c.json({ ok: false }, 401);
  return c.json({ ok: await resolveReport(c.env, Number(c.req.param("id"))) });
});

// The same checks as the health report on /settings; D1 only, so not cached.
app.get("/api/adms/health", async (c) => {
  if (!(await admsSession(c))) return c.json({ ok: false }, 401);
  return c.json({ problems: await healthProblems(c.env, Date.now()) }, 200, { "Cache-Control": "no-store" });
});

app.get("/api/adms/quotas", async (c) => {
  if (!(await admsSession(c))) return c.json({ ok: false }, 401);
  return c.json(await cached(c.env, "quotas", c.req.query("fresh") === "1", () => quotas(c.env)), 200, { "Cache-Control": "no-store" });
});

async function startBrief(env: Env, now: number, edition?: "midday"): Promise<string> {
  const instance = await env.BRIEF_WORKFLOW.create({ id: `${edition ?? "brief"}-${thaiDate(now)}-${now}`, params: { now, edition } });
  return instance.id;
}

// The midday update rides on the hourly cron (05:00 UTC = 12:00 Thai) instead of using one of the
// account's 5 Cron Triggers. It sees feeds ingested up to the previous hour.
const MIDDAY_UTC_HOUR = 5;

export default {
  fetch: app.fetch,
  async scheduled(controller, env) {
    if (controller.cron === BRIEF_CRON) {
      console.log("brief workflow", await startBrief(env, controller.scheduledTime));
      return;
    }
    if (controller.cron === WEEKLY_CRON) {
      console.log("weekly pdf", await makeWeeklyPdf(env, controller.scheduledTime));
      return;
    }
    console.log("queued feeds", await enqueueFeeds(env));
    if (new Date(controller.scheduledTime).getUTCHours() === MIDDAY_UTC_HOUR) {
      try {
        console.log("midday workflow", await startBrief(env, controller.scheduledTime, "midday"));
      } catch (err) {
        console.error("midday:", err);
      }
    }
    try {
      await refreshWidgets(env, controller.scheduledTime);
    } catch (err) {
      console.error("widgets:", err);
    }
  },
  queue: handleIngest,
} satisfies ExportedHandler<Env, IngestMessage>;
