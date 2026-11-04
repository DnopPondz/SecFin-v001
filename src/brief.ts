import { z } from "zod";
import { MODEL, runJson, type ChatMessage } from "./ai";
import { extractCves, lookupCves, type CveInfo } from "./cve";
import { collapseClusters, isNorth, pickCandidates, type Article } from "./select";
import { CATEGORIES, sourceById, type Category } from "./sources";
import { thaiDate } from "./time";

const ITEMS_PER_SECTION = 5;
// The model ranks 7 so balancePicks can swap in global or Thai stories without a second AI call.
const PICKS = 7;
const WINDOW_MS = 30 * 60 * 60 * 1000; // a little over a day, so a late-night story is not lost
// 7 bilingual items run to about 3,500 tokens; Thai is token-heavy, so leave headroom (unused tokens cost nothing).
const MAX_TOKENS = 5600;

// "Thai and global" in every section but weather: on 2026-11-04 the IT and finance briefs came out
// all-Thai because Thai finance feeds outnumber the rest about three to one.
const MIN_GLOBAL: Partial<Record<Category, number>> = { cyber: 2, it: 2, finance: 2 };
const MIN_THAI: Partial<Record<Category, number>> = { cyber: 1, it: 1, finance: 1 };

export interface Bilingual {
  th: string;
  en: string;
}

export interface BriefItem {
  id: string; // article id (SHA-256 of the URL); the story page is /story.html?id=<id>
  image: string | null; // publisher's lead image URL from the feed
  url: string;
  source: string;
  sourceName: string;
  region: "th" | "global";
  published: number;
  title: Bilingual;
  summary: Bilingual;
  why: Bilingual | null; // null when the AI step was skipped
  severity: "critical" | "high" | "medium" | "low" | null;
  coverage: number; // distinct sources that carried the story
  alsoReported: string[]; // names of the other sources
  sourceText: string; // original headline + snippet, kept so CVE ids come from the publisher, not the model
  cves: CveInfo[];
  north: boolean; // mentions Northern Thailand (keyword match on the publisher's text)
  watch?: string[]; // watchlist terms the story matched (missing in briefs before 2026-11-04)
}

export interface Section {
  items: BriefItem[];
  neurons: number;
  ai: boolean;
}

export interface Brief {
  date: string; // Thai calendar date
  generatedAt: number;
  model: string | null;
  neurons: number;
  sections: Record<Category, BriefItem[]>;
  notes: string[];
  midday?: Midday; // added by the 12:00 update (from 2026-11-04)
}

// Midday update, added to the same day's brief at 12:00 Thai time at the owner's request
// (2026-11-04): finance stories published since the morning brief that it did not carry.
export const MIDDAY_CATEGORY: Category = "finance";

export interface Midday {
  generatedAt: number;
  category: Category;
  items: BriefItem[];
  neurons: number;
  ai: boolean;
}

// Stories to leave out of an update: anything before `since` and any story (cluster) already in the brief.
export interface Skip {
  since: number;
  ids: string[];
}

const SECTION_LABEL: Record<Category, string> = {
  cyber: "cybersecurity (threats, vulnerabilities, breaches, advisories)",
  it: "IT and technology (enterprise IT, cloud, AI, regulation, major vendors)",
  finance: "finance and economy (markets, central banks, Thai economy, fintech)",
  disaster:
    "weather and natural disasters (storms, floods, landslides, earthquakes, haze and PM2.5, heat, cold). The reader lives in Northern Thailand: rank stories about Northern Thailand first, then the rest of Thailand and neighbouring countries, then major global events. Skip minor events far from Thailand unless they are severe",
};

const SEVERITY_HINT: Partial<Record<Category, string>> = {
  cyber: "critical, high, medium or low by real-world risk",
  disaster: "critical, high, medium or low by threat to people and property",
};

// Northern Thailand first, then the rest of Thailand, in the disaster section only.
function disasterPriority(a: Article): number {
  if (isNorth(`${a.title} ${a.snippet}`)) return 2;
  return a.region === "th" ? 1 : 0;
}

// Watchlist stories go ahead of everything else on the shortlist; the model still picks the final 5.
export function priorityOf(category: Category, a: Article): number {
  return (a.watch ? 3 : 0) + (category === "disaster" ? disasterPriority(a) : 0);
}

const ItemSchema = z.object({
  i: z.number().int(),
  title_th: z.string().min(1),
  summary_th: z.string().min(1),
  why_th: z.string().min(1),
  title_en: z.string().min(1),
  summary_en: z.string().min(1),
  why_en: z.string().min(1),
  severity: z.enum(["critical", "high", "medium", "low", "none"]),
});
const OutputSchema = z.object({ items: z.array(ItemSchema) });

const JSON_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          i: { type: "integer" },
          title_th: { type: "string" },
          summary_th: { type: "string" },
          why_th: { type: "string" },
          title_en: { type: "string" },
          summary_en: { type: "string" },
          why_en: { type: "string" },
          severity: { type: "string", enum: ["critical", "high", "medium", "low", "none"] },
        },
        required: ["i", "title_th", "summary_th", "why_th", "title_en", "summary_en", "why_en", "severity"],
      },
    },
  },
  required: ["items"],
};

export function buildMessages(category: Category, candidates: Article[]): ChatMessage[] {
  const list = candidates
    .map((a, i) => {
      const reach = `${(a.coverage ?? 1) > 1 ? `, reported by ${a.coverage} sources` : ""}${isNorth(`${a.title} ${a.snippet}`) ? ", Northern Thailand" : ""}${a.watch ? ", on the reader's watchlist" : ""}`;
      return `[${i}] (${sourceById(a.source)?.name ?? a.source}, ${a.region === "th" ? "Thailand" : "global"}${reach}) ${a.title}\n${a.snippet}`;
    })
    .join("\n\n");
  return [
    {
      role: "system",
      content: [
        "You edit a daily morning briefing for an IT and cybersecurity professional in Thailand.",
        "Use only facts stated in the items you are given. Never add numbers, names, or claims that are not in the item.",
        "Write plainly, without hype. Thai text must be natural Thai, keeping product names, CVE ids and company names in English.",
      ].join(" "),
    },
    {
      role: "user",
      content: [
        `Section: ${SECTION_LABEL[category]}.`,
        `Pick the ${PICKS} most significant distinct stories below, most important first.`,
        MIN_GLOBAL[category]
          ? `The reader wants both Thai and world news: include at least ${MIN_GLOBAL[category]} global stories and at least ${MIN_THAI[category] ?? 1} Thai story when the list has them.`
          : "Include Thai stories when they are relevant to Thailand.",
        "A story reported by several sources is usually more significant, but judge by impact.",
        "Items on the reader's watchlist concern products, vendors or companies the reader works with: include them unless they are trivial.",
        "For each: i (the item number), title_th and title_en (short headline), summary_th and summary_en (2 sentences),",
        "why_th and why_en (1 sentence: the practical impact or what a reader in Thailand should check or do),",
        `severity (${SEVERITY_HINT[category] ?? "always none"}).`,
        "",
        list,
      ].join("\n"),
    },
  ];
}

function toItem(a: Article, ai?: z.infer<typeof ItemSchema>): BriefItem {
  return {
    id: a.id,
    image: a.image ?? null,
    url: a.url,
    source: a.source,
    sourceName: sourceById(a.source)?.name ?? a.source,
    region: a.region,
    published: a.published_at,
    title: ai ? { th: ai.title_th, en: ai.title_en } : { th: a.title, en: a.title },
    summary: ai ? { th: ai.summary_th, en: ai.summary_en } : { th: a.snippet, en: a.snippet },
    why: ai ? { th: ai.why_th, en: ai.why_en } : null,
    severity: ai && ai.severity !== "none" ? ai.severity : null,
    coverage: a.coverage ?? 1,
    alsoReported: (a.alsoIn ?? []).map((s) => sourceById(s)?.name ?? s),
    sourceText: `${a.title} ${a.snippet}`,
    cves: [],
    north: isNorth(`${a.title} ${a.snippet}`),
    watch: a.watch ? a.watch.split(",") : [],
  };
}

// Map the model's picks back to real articles. Unknown or repeated indexes are dropped, so the
// model can never invent a link.
export function mergePicks(candidates: Article[], raw: unknown): BriefItem[] {
  const parsed = OutputSchema.parse(raw);
  const seen = new Set<number>();
  const items: BriefItem[] = [];
  for (const p of parsed.items) {
    const a = candidates[p.i];
    if (!a || seen.has(p.i)) continue;
    seen.add(p.i);
    items.push(toItem(a, p));
    if (items.length >= PICKS) break;
  }
  return items;
}

// Keep the model's order, but make sure the final 5 hold at least minGlobal global and minThai
// Thai stories when the ranked picks contain them: the lowest-ranked picks of the over-represented
// region make room for the best-ranked ones of the other.
export function balancePicks(picks: BriefItem[], limit: number, minGlobal = 0, minThai = 0): BriefItem[] {
  const ranked = picks.map((it, rank) => ({ it, rank }));
  const chosen = ranked.slice(0, limit);
  const spare = ranked.slice(limit);
  const count = (region: BriefItem["region"]) => chosen.filter((c) => c.it.region === region).length;
  const ensure = (region: BriefItem["region"], min: number, other: BriefItem["region"], otherMin: number) => {
    while (count(region) < min) {
      const incoming = spare.findIndex((c) => c.it.region === region);
      if (incoming < 0 || count(other) <= otherMin) return;
      const outIdx = chosen.map((c) => c.it.region).lastIndexOf(other);
      chosen.splice(outIdx, 1);
      chosen.push(spare.splice(incoming, 1)[0]);
    }
  };
  ensure("global", minGlobal, "th", minThai);
  ensure("th", minThai, "global", minGlobal);
  return chosen.sort((a, b) => a.rank - b.rank).map((c) => c.it);
}

// All recent articles across every section, so a story's coverage counts sources in any section.
async function candidatesFor(env: Env, category: Category, now: number, skip?: Skip): Promise<Article[]> {
  const { results } = await env.DB.prepare(
    "SELECT id, url, source, category, region, lang, title, snippet, published_at, cluster_id, image, watch FROM articles WHERE published_at >= ? ORDER BY published_at DESC LIMIT 1000",
  )
    .bind(now - WINDOW_MS)
    .all<Article>();
  const stories = skipCovered(results, collapseClusters(results).filter((a) => a.category === category), skip);
  return pickCandidates(stories.map((a) => ({ ...a, priority: priorityOf(category, a) })));
}

// Drops stories with nothing published since skip.since and stories whose cluster holds an article
// already in the brief (a cluster's representative can change when a more credible source picks
// the story up, and it is not always the newest article).
export function skipCovered(rows: Article[], stories: Article[], skip?: Skip): Article[] {
  if (!skip) return stories;
  const ids = new Set(skip.ids);
  const covered = new Set<string>();
  const newest = new Map<string, number>();
  for (const r of rows) {
    if (!r.cluster_id) continue;
    if (ids.has(r.id)) covered.add(r.cluster_id);
    newest.set(r.cluster_id, Math.max(newest.get(r.cluster_id) ?? 0, r.published_at));
  }
  return stories.filter((a) => {
    if (ids.has(a.id) || (a.cluster_id && covered.has(a.cluster_id))) return false;
    return (a.cluster_id ? (newest.get(a.cluster_id) ?? a.published_at) : a.published_at) >= skip.since;
  });
}

// Throws when the AI call fails so the Workflow step can retry it; rawSection is the fallback.
export async function aiSection(env: Env, category: Category, now: number, skip?: Skip): Promise<Section> {
  const candidates = await candidatesFor(env, category, now, skip);
  if (candidates.length === 0) return { items: [], neurons: 0, ai: false };
  const { data, neurons } = await runJson(env, buildMessages(category, candidates), JSON_SCHEMA, MAX_TOKENS, now);
  const items = balancePicks(mergePicks(candidates, data), ITEMS_PER_SECTION, MIN_GLOBAL[category], MIN_THAI[category]);
  return { items, neurons, ai: true };
}

// Without AI the page still shows the top stories, just untranslated and ranked by coverage and recency.
export async function rawSection(env: Env, category: Category, now: number, skip?: Skip): Promise<Section> {
  const candidates = await candidatesFor(env, category, now, skip);
  const items = balancePicks(candidates.map((a) => toItem(a)), ITEMS_PER_SECTION, MIN_GLOBAL[category], MIN_THAI[category]);
  return { items, neurons: 0, ai: false };
}

// CVE ids are read from the publisher's own headline and snippet, then checked against NVD.
export async function attachCves(env: Env, items: BriefItem[], now: number): Promise<BriefItem[]> {
  const ids = [...new Set(items.flatMap((it) => extractCves(it.sourceText)))];
  if (ids.length === 0) return items;
  const found = new Map((await lookupCves(env, ids, now)).map((c) => [c.id, c]));
  return items.map((it) => ({ ...it, cves: extractCves(it.sourceText).flatMap((id) => found.get(id) ?? []) }));
}

export function assembleBrief(now: number, sections: Record<Category, Section>, notes: string[]): Brief {
  const all = Object.values(sections);
  return {
    date: thaiDate(now),
    generatedAt: now,
    model: all.some((s) => s.ai) ? MODEL : null,
    neurons: all.reduce((n, s) => n + s.neurons, 0),
    sections: Object.fromEntries(CATEGORIES.map((c) => [c, sections[c]?.items ?? []])) as Record<Category, BriefItem[]>,
    notes,
  };
}

export async function saveBrief(env: Env, brief: Brief): Promise<void> {
  const body = JSON.stringify(brief);
  await env.DB.prepare("INSERT OR REPLACE INTO briefs (date, created_at, body) VALUES (?, ?, ?)").bind(brief.date, brief.generatedAt, body).run();
  // KV keeps the hot "today" read off D1; one write per brief stays far under the 1,000/day KV limit.
  await env.CACHE.put("brief:latest", body);
}

// What the midday update must not repeat: the morning brief's stories, and anything it already saw.
// Null when there is no brief for that Thai date yet.
export async function middaySkip(env: Env, date: string): Promise<Skip | null> {
  const row = await env.DB.prepare("SELECT body FROM briefs WHERE date = ?").bind(date).first<{ body: string }>();
  if (!row) return null;
  const brief = JSON.parse(row.body) as Brief;
  return { since: brief.generatedAt, ids: Object.values(brief.sections).flat().map((it) => it.id) };
}

// Adds the midday update to the day's saved brief (one D1 write, one KV write when it is the latest).
export async function saveMidday(env: Env, date: string, midday: Midday): Promise<boolean> {
  const row = await env.DB.prepare("SELECT body FROM briefs WHERE date = ?").bind(date).first<{ body: string }>();
  if (!row) return false;
  const brief = JSON.parse(row.body) as Brief;
  brief.midday = midday;
  brief.neurons += midday.neurons;
  const body = JSON.stringify(brief);
  await env.DB.prepare("UPDATE briefs SET body = ? WHERE date = ?").bind(body, date).run();
  const latest = await env.DB.prepare("SELECT date FROM briefs ORDER BY date DESC LIMIT 1").first<{ date: string }>();
  if (latest?.date === date) await env.CACHE.put("brief:latest", body);
  return true;
}
