import type { Brief } from "./brief";
import { neuronsUsed } from "./ai";
import { sha256 } from "./hash";
import { thaiDate } from "./time";

// /adms: the owner's analytics dashboard. Login with a 10-digit PIN (secret ADMS_PIN) gives a
// signed HttpOnly cookie. Visits come from our own page-view beacon in Analytics Engine
// (secfin_views), quotas from Cloudflare's Analytics SQL datasets, both read through the
// token-free ANALYTICS_SQL binding. No IP address is stored: only Cloudflare's country, region
// and city for the request, and a random visitor id that changes every day.

export const SESSION_COOKIE = "adms";
const SESSION_SECONDS = 12 * 60 * 60;

export function pinConfigured(env: Env): boolean {
  return typeof env.ADMS_PIN === "string" && /^\d{10}$/.test(env.ADMS_PIN);
}

// Constant-time comparison. Plain XOR instead of crypto.subtle.timingSafeEqual (a Workers-only
// extension) so the tests run on Node too.
export function timingSafeEqualStr(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  if (x.byteLength !== y.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < x.byteLength; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

// The PIN is the signing key, so changing it signs everyone out.
async function sign(pin: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(`adms-session-v1:${pin}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
  return btoa(String.fromCharCode(...mac)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function issueSession(pin: string, now: number): Promise<string> {
  const exp = Math.floor(now / 1000) + SESSION_SECONDS;
  return `${exp}.${await sign(pin, `adms:${exp}`)}`;
}

export async function verifySession(token: string | undefined, pin: string | undefined, now: number): Promise<boolean> {
  if (!token || !pin) return false;
  const [expText, mac] = token.split(".");
  const exp = Number(expText);
  if (!Number.isInteger(exp) || !mac || exp * 1000 <= now) return false;
  return timingSafeEqualStr(mac, await sign(pin, `adms:${exp}`));
}

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`;
}

export const CLEAR_COOKIE = `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

export function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return undefined;
}

// Page views ----------------------------------------------------------------------------------

export interface ViewBody {
  page?: unknown;
  id?: unknown;
  edition?: unknown;
  ref?: unknown;
  lang?: unknown;
  vid?: unknown;
}

export interface View {
  page: "home" | "story";
  id: string;
  edition: string;
  ref: string;
  lang: "th" | "en";
  vid: string;
}

const BOT_UA = /bot|crawl|spider|slurp|headless|lighthouse|preview|monitor|curl|wget|python|node-fetch|axios/i;

export function isBot(ua: string | undefined): boolean {
  return !ua || BOT_UA.test(ua);
}

export function deviceOf(ua: string | undefined): "mobile" | "tablet" | "desktop" {
  if (/ipad|tablet/i.test(ua ?? "")) return "tablet";
  return /mobi|android|iphone/i.test(ua ?? "") ? "mobile" : "desktop";
}

// Referrer host only; our own pages count as internal navigation.
export function refHost(ref: unknown, ownHost: string): string {
  if (typeof ref !== "string" || !ref) return "direct";
  try {
    const host = new URL(ref).hostname.replace(/^www\./, "");
    return host === ownHost ? "internal" : host.slice(0, 80);
  } catch {
    return "direct";
  }
}

export function validView(body: ViewBody, ownHost: string): View | null {
  const page = body.page === "home" || body.page === "story" ? body.page : null;
  if (!page) return null;
  const id = typeof body.id === "string" && /^[0-9a-f]{64}$/.test(body.id) ? body.id : "";
  if (page === "story" && !id) return null;
  const edition = typeof body.edition === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.edition) ? body.edition : "";
  const vid = typeof body.vid === "string" && /^[a-z0-9]{8,32}$/.test(body.vid) ? body.vid : "";
  return { page, id, edition, ref: refHost(body.ref, ownHost), lang: body.lang === "en" ? "en" : "th", vid };
}

interface CfGeo {
  country?: string;
  city?: string;
  region?: string;
}

// blob1 page, blob2 story id, blob3 edition date, blob4 country, blob5 region, blob6 city,
// blob7 referrer host, blob8 device, blob9 language, blob10 daily visitor id, blob11 "1" for the owner.
export function recordView(env: Env, view: View, cf: CfGeo | undefined, ua: string | undefined, owner: boolean): void {
  env.VIEWS?.writeDataPoint({
    indexes: [view.page],
    blobs: [
      view.page, view.id, view.edition,
      (cf?.country ?? "XX").slice(0, 2), (cf?.region ?? "").slice(0, 60), (cf?.city ?? "").slice(0, 60),
      view.ref, deviceOf(ua), view.lang, view.vid, owner ? "1" : "",
    ],
    doubles: [1],
  });
}

// Queries -------------------------------------------------------------------------------------

type Row = Record<string, unknown>;

// The Analytics SQL API limits requests per account without publishing the numbers (2026-11-04:
// 21 parallel queries all failed with "Rate limit exceeded"). Queries therefore run one at a time,
// and a rate-limited one waits a moment and tries once more.
async function sql<T extends Row>(env: Env, query: string, params: Record<string, string | number>): Promise<T[]> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await env.ANALYTICS_SQL.query<T>({ query, params });
      return res.data ?? [];
    } catch (err) {
      if (attempt >= 1 || !/rate limit|too many/i.test(String(err))) throw err;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}

// Dashboard results are kept 5 minutes in KV (1 minute when something failed, so a retry comes
// soon), which keeps repeated visits and range switches off the SQL API. "fresh" skips the cache.
export async function cached<T extends { errors: string[] }>(env: Env, key: string, fresh: boolean, fn: () => Promise<T>): Promise<T & { cachedAt: number }> {
  if (!fresh) {
    const hit = await env.CACHE.get<T & { cachedAt: number }>(`adms:${key}`, "json");
    if (hit) return hit;
  }
  const value = { ...(await fn()), cachedAt: Date.now() };
  await env.CACHE.put(`adms:${key}`, JSON.stringify(value), { expirationTtl: value.errors.length ? 60 : 300 });
  return value;
}

// One failing dataset (beta API, missing permission) must not blank the whole dashboard.
async function safe<T>(label: string, fn: () => Promise<T>, errors: string[]): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    errors.push(`${label}: ${String(err instanceof Error ? err.message : err).slice(0, 120)}`);
    return null;
  }
}

const VIEWS = "events.analyticsEngine.secfin_views";
const CLICKS = "events.analyticsEngine.secfin_clicks";
const num = (v: unknown) => Number(v) || 0;

export interface Traffic {
  since: string;
  views: number;
  visitors: number;
  storyViews: number;
  hourly: { hour: string; views: number }[]; // UTC hour buckets; the page shows them in Thai time
  countries: { country: string; views: number }[];
  cities: { country: string; region: string; city: string; views: number }[];
  referrers: { ref: string; views: number }[];
  devices: { device: string; views: number }[];
  langs: { lang: string; views: number }[];
  truncated: boolean; // the grouped rows hit TRAFFIC_ROWS, so totals are a lower bound
  errors: string[];
}

export interface TrafficRow {
  hour: string;
  page: string;
  country: string;
  region: string;
  city: string;
  ref: string;
  device: string;
  lang: string;
  vid: string;
  n: number;
}

const TRAFFIC_ROWS = 5000;

function top<K extends string>(counts: Map<string, number>, key: K, limit: number): ({ [P in K]: string } & { views: number })[] {
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([k, views]) => ({ [key]: k, views }) as { [P in K]: string } & { views: number });
}

// One grouped query, summarised here: the SQL API rate-limits per account, so one query with
// several dimensions beats seven small ones. Visitors are distinct daily ids, so a person who
// comes back on another day counts again.
export function summariseTraffic(rows: TrafficRow[], since: string): Omit<Traffic, "errors"> {
  const add = (m: Map<string, number>, k: string, n: number) => m.set(k, (m.get(k) ?? 0) + n);
  const hourly = new Map<string, number>();
  const countries = new Map<string, number>();
  const cities = new Map<string, number>();
  const refs = new Map<string, number>();
  const devices = new Map<string, number>();
  const langs = new Map<string, number>();
  const visitors = new Set<string>();
  let views = 0;
  let storyViews = 0;
  for (const r of rows) {
    views += r.n;
    if (r.page === "story") storyViews += r.n;
    if (r.vid) visitors.add(r.vid);
    add(hourly, r.hour, r.n);
    add(countries, r.country, r.n);
    add(cities, JSON.stringify([r.country, r.region, r.city]), r.n);
    add(refs, r.ref, r.n);
    add(devices, r.device, r.n);
    add(langs, r.lang, r.n);
  }
  return {
    since,
    views,
    visitors: visitors.size,
    storyViews,
    hourly: [...hourly].sort((a, b) => a[0].localeCompare(b[0])).map(([hour, v]) => ({ hour, views: v })),
    countries: top(countries, "country", 20),
    cities: top(cities, "key", 20).map(({ key, views: v }) => {
      const [country, region, city] = JSON.parse(key) as string[];
      return { country, region, city, views: v };
    }),
    referrers: top(refs, "ref", 15),
    devices: top(devices, "device", 5),
    langs: top(langs, "lang", 5),
    truncated: rows.length >= TRAFFIC_ROWS,
  };
}

export async function traffic(env: Env, days: number, includeOwner: boolean, now = Date.now()): Promise<Traffic> {
  const since = new Date(now - days * 86_400_000).toISOString();
  const owner = includeOwner ? "" : " AND blob11 != '1'";
  const errors: string[] = [];
  const rows = await safe("visits", () => sql<Row>(env,
    `SELECT toStartOfHour(timestamp) AS hour, blob1 AS page, blob4 AS country, blob5 AS region, blob6 AS city, blob7 AS ref, blob8 AS device, blob9 AS lang, blob10 AS vid, COUNT(*) AS n
     FROM ${VIEWS} WHERE timestamp >= $since${owner}
     GROUP BY hour, page, country, region, city, ref, device, lang, vid ORDER BY hour LIMIT ${TRAFFIC_ROWS}`, { since }), errors);
  const typed: TrafficRow[] = (rows ?? []).map((r) => ({
    hour: String(r.hour), page: String(r.page), country: String(r.country), region: String(r.region), city: String(r.city),
    ref: String(r.ref), device: String(r.device), lang: String(r.lang), vid: String(r.vid), n: num(r.n),
  }));
  return { ...summariseTraffic(typed, since), errors };
}

// Story engagement ----------------------------------------------------------------------------

export interface StoryStat {
  id: string;
  date: string;
  category: string;
  position: number; // 0 is the section's lead story
  title: string;
  sourceName: string;
  impressions: number; // front-page views of that edition
  reads: number; // story page views
  clicks: number; // clicks through to the publisher
  rate: number; // (reads + clicks) / impressions, 0 when there were no impressions
}

export interface BriefRow {
  date: string;
  body: string;
}

// Pure ranking step, kept separate so it can be tested without Analytics Engine.
export function rankStories(
  briefs: Brief[],
  reads: Map<string, number>,
  clicksById: Map<string, number>,
  impressions: Map<string, number>,
): StoryStat[] {
  const out: StoryStat[] = [];
  for (const b of briefs) {
    for (const [category, items] of Object.entries(b.sections ?? {})) {
      items.forEach((it, position) => {
        const imp = impressions.get(b.date) ?? 0;
        const r = reads.get(it.id) ?? 0;
        const c = clicksById.get(it.id) ?? 0;
        out.push({
          id: it.id, date: b.date, category, position, title: it.title.th, sourceName: it.sourceName,
          impressions: imp, reads: r, clicks: c, rate: imp > 0 ? Math.round(((r + c) / imp) * 1000) / 1000 : 0,
        });
      });
    }
  }
  return out;
}

export interface GroupStat {
  key: string;
  stories: number;
  reads: number;
  clicks: number;
  impressions: number;
  rate: number;
}

export function groupStats(stats: StoryStat[], keyOf: (s: StoryStat) => string): GroupStat[] {
  const groups = new Map<string, GroupStat>();
  for (const s of stats) {
    const g = groups.get(keyOf(s)) ?? { key: keyOf(s), stories: 0, reads: 0, clicks: 0, impressions: 0, rate: 0 };
    g.stories++;
    g.reads += s.reads;
    g.clicks += s.clicks;
    g.impressions += s.impressions;
    groups.set(g.key, g);
  }
  return [...groups.values()].map((g) => ({ ...g, rate: g.impressions > 0 ? Math.round(((g.reads + g.clicks) / g.impressions) * 1000) / 1000 : 0 }));
}

export interface StoryReport {
  days: number;
  stories: number;
  top: StoryStat[];
  bottom: StoryStat[];
  byCategory: GroupStat[];
  byPosition: GroupStat[];
  errors: string[];
}

const MAX_STORY_DAYS = 14;

export async function storyReport(env: Env, days: number, includeOwner: boolean, now = Date.now()): Promise<StoryReport> {
  const span = Math.min(Math.max(days, 1), MAX_STORY_DAYS);
  const since = new Date(now - span * 86_400_000).toISOString();
  const owner = includeOwner ? "" : " AND blob11 != '1'";
  const errors: string[] = [];
  const { results } = await env.DB.prepare("SELECT date, body FROM briefs WHERE date >= ? ORDER BY date DESC").bind(thaiDate(now - span * 86_400_000)).all<BriefRow>();
  const briefs = results.map((r) => JSON.parse(r.body) as Brief);
  // Story reads and front-page impressions come from one grouped query; clicks from a second.
  const viewRows = await safe("story views", () => sql<Row>(env, `SELECT blob1 AS page, blob2 AS id, blob3 AS edition, COUNT(*) AS n FROM ${VIEWS} WHERE timestamp >= $since${owner} GROUP BY page, id, edition ORDER BY n DESC LIMIT 2000`, { since }), errors);
  const clickRows = await safe("clicks", () => sql<Row>(env, `SELECT blob3 AS url, COUNT(*) AS n FROM ${CLICKS} WHERE timestamp >= $since GROUP BY url ORDER BY n DESC LIMIT 500`, { since }), errors);
  const reads = new Map<string, number>();
  const impressions = new Map<string, number>();
  for (const r of viewRows ?? []) {
    const target = r.page === "story" ? reads : impressions;
    const key = String(r.page === "story" ? r.id : r.edition);
    target.set(key, (target.get(key) ?? 0) + num(r.n));
  }
  // Click rows carry the publisher URL; story ids are SHA-256 of it.
  const clicksById = new Map<string, number>();
  for (const r of clickRows ?? []) clicksById.set(await sha256(String(r.url)), num(r.n));
  const stats = rankStories(briefs, reads, clicksById, impressions);
  const engagement = (s: StoryStat) => s.reads + s.clicks;
  const ranked = [...stats].sort((a, b) => engagement(b) - engagement(a) || b.rate - a.rate);
  // "Least read" only counts stories people actually saw on the front page.
  const seen = stats.filter((s) => s.impressions > 0).sort((a, b) => a.rate - b.rate || engagement(a) - engagement(b));
  return {
    days: span,
    stories: stats.length,
    top: ranked.slice(0, 10),
    bottom: seen.slice(0, 10),
    byCategory: groupStats(stats, (s) => s.category),
    byPosition: groupStats(stats, (s) => String(s.position)),
    errors,
  };
}

// Free-plan quotas ----------------------------------------------------------------------------

export interface Quota {
  id: string;
  used: number | null; // null when the dataset could not be read
  limit: number;
  unit: string;
  period: "day" | "month" | "total";
  source: "cloudflare" | "meter";
}

const MB = 1024 * 1024;
const BGE_M3_DIMENSIONS = 1024;

export async function quotas(env: Env, now = Date.now()): Promise<{ quotas: Quota[]; errors: string[]; budget: number; reserve: number }> {
  const errors: string[] = [];
  const today = new Date(now).toISOString().slice(0, 10) + "T00:00:00Z";
  const month = new Date(now).toISOString().slice(0, 7) + "-01T00:00:00Z";
  const day1 = new Date(now - 86_400_000).toISOString();
  // One dataset per statement is an SQL API rule, so these are separate queries, run in sequence.
  const one = async <T extends Row>(label: string, query: string, params: Record<string, string>) =>
    (await safe(label, () => sql<T>(env, query, params), errors))?.[0] ?? null;
  const requests = await one("workers requests", "SELECT COUNT(*) AS n FROM logs.workersLogs WHERE timestamp >= $today AND logType = 'invocation'", { today });
  const logs = await one("workers logs", "SELECT COUNT(*) AS n FROM logs.workersLogs WHERE timestamp >= $today", { today });
  const ai = await one("workers ai", "SELECT SUM(neurons) AS n FROM events.aiInference WHERE timestamp >= $today", { today });
  const d1 = await one("d1 rows", "SELECT SUM(rowsRead) AS r, SUM(rowsWritten) AS w FROM events.d1Queries WHERE timestamp >= $today", { today });
  const kv = await one("kv ops", "SELECT countIf(actionType = 'read') AS r, countIf(actionType = 'write') AS w, countIf(actionType = 'delete') AS d, countIf(actionType = 'list') AS l FROM events.kvRequests WHERE timestamp >= $today", { today });
  const queues = await one("queues", "SELECT SUM(numBillableOperations) AS n FROM events.queuesMessages WHERE timestamp >= $today", { today });
  const workflows = await one("workflows", "SELECT SUM(stepCountDiff) AS n FROM events.workflows WHERE timestamp >= $today", { today });
  const vecQueries = await one("vectorize queries", "SELECT countIf(operation = 'vectorQuery') AS n FROM events.vectorizeOperations WHERE timestamp >= $month", { month });
  const d1Size = await one("d1 storage", "SELECT MAX(databaseSizeBytes) AS n FROM states.d1Storage WHERE timestamp >= $day1", { day1 });
  // KV storage is left out: states.kvStorage answered 503 to every query shape on 2026-11-04.
  const vecSize = await one("vectorize storage", "SELECT MAX(vectorCount) AS n FROM states.vectorizeStorage WHERE timestamp >= $day1", { day1 });
  const meter = await safe("neuron meter", () => neuronsUsed(env, now), errors);
  const v = (row: Row | null, key = "n") => (row ? num(row[key]) : null);
  const vec = v(vecSize);
  const vq = v(vecQueries);
  return {
    budget: Number(env.DAILY_NEURON_BUDGET) || 0,
    reserve: 2500,
    errors,
    quotas: [
      { id: "workersRequests", used: v(requests), limit: 100_000, unit: "requests", period: "day", source: "cloudflare" },
      { id: "workersLogs", used: v(logs), limit: 200_000, unit: "events", period: "day", source: "cloudflare" },
      { id: "neurons", used: v(ai), limit: 10_000, unit: "Neurons", period: "day", source: "cloudflare" },
      { id: "neuronsMeter", used: meter, limit: Number(env.DAILY_NEURON_BUDGET) || 5000, unit: "Neurons", period: "day", source: "meter" },
      { id: "d1Read", used: v(d1, "r"), limit: 5_000_000, unit: "rows", period: "day", source: "cloudflare" },
      { id: "d1Write", used: v(d1, "w"), limit: 100_000, unit: "rows", period: "day", source: "cloudflare" },
      { id: "d1Storage", used: v(d1Size) === null ? null : Math.round((v(d1Size)! / MB) * 10) / 10, limit: 5 * 1024, unit: "MB", period: "total", source: "cloudflare" },
      { id: "kvRead", used: v(kv, "r"), limit: 100_000, unit: "reads", period: "day", source: "cloudflare" },
      { id: "kvWrite", used: v(kv, "w"), limit: 1_000, unit: "writes", period: "day", source: "cloudflare" },
      { id: "kvDelete", used: v(kv, "d"), limit: 1_000, unit: "deletes", period: "day", source: "cloudflare" },
      { id: "kvList", used: v(kv, "l"), limit: 1_000, unit: "lists", period: "day", source: "cloudflare" },
      { id: "queues", used: v(queues), limit: 10_000, unit: "operations", period: "day", source: "cloudflare" },
      { id: "workflows", used: v(workflows), limit: 3_000, unit: "steps", period: "day", source: "cloudflare" },
      { id: "vectorizeQueried", used: vq === null ? null : vq * BGE_M3_DIMENSIONS, limit: 30_000_000, unit: "dimensions", period: "month", source: "cloudflare" },
      { id: "vectorizeStored", used: vec === null ? null : vec * BGE_M3_DIMENSIONS, limit: 5_000_000, unit: "dimensions", period: "total", source: "cloudflare" },
    ],
  };
}
