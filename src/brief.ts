import { z } from "zod";
import { BudgetExceeded, MODEL, runJson, type ChatMessage } from "./ai";
import { pickCandidates, type Article } from "./select";
import { CATEGORIES, sourceById, type Category } from "./sources";
import { thaiDate } from "./time";

const ITEMS_PER_SECTION = 5;
const WINDOW_MS = 30 * 60 * 60 * 1000; // a little over a day, so a late-night story is not lost
const MAX_TOKENS = 2500;

export interface Bilingual {
  th: string;
  en: string;
}

export interface BriefItem {
  url: string;
  source: string;
  sourceName: string;
  region: "th" | "global";
  published: number;
  title: Bilingual;
  summary: Bilingual;
  why: Bilingual | null; // null when the AI step was skipped
  severity: "critical" | "high" | "medium" | "low" | null;
}

export interface Brief {
  date: string; // Thai calendar date
  generatedAt: number;
  model: string | null;
  neurons: number;
  sections: Record<Category, BriefItem[]>;
  notes: string[];
}

const SECTION_LABEL: Record<Category, string> = {
  cyber: "cybersecurity (threats, vulnerabilities, breaches, advisories)",
  it: "IT and technology (enterprise IT, cloud, AI, regulation, major vendors)",
  finance: "finance and economy (markets, central banks, Thai economy, fintech)",
};

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
    .map((a, i) => `[${i}] (${sourceById(a.source)?.name ?? a.source}, ${a.region === "th" ? "Thailand" : "global"}) ${a.title}\n${a.snippet}`)
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
        `Pick the ${ITEMS_PER_SECTION} most significant distinct stories below, most important first. Include Thai stories when they are relevant to Thailand.`,
        "For each: i (the item number), title_th and title_en (short headline), summary_th and summary_en (2 sentences),",
        "why_th and why_en (1 sentence: the practical impact or what a reader in Thailand should check or do),",
        `severity (${category === "cyber" ? "critical, high, medium or low by real-world risk" : "always none"}).`,
        "",
        list,
      ].join("\n"),
    },
  ];
}

function toItem(a: Article, ai?: z.infer<typeof ItemSchema>): BriefItem {
  return {
    url: a.url,
    source: a.source,
    sourceName: sourceById(a.source)?.name ?? a.source,
    region: a.region,
    published: a.published_at,
    title: ai ? { th: ai.title_th, en: ai.title_en } : { th: a.title, en: a.title },
    summary: ai ? { th: ai.summary_th, en: ai.summary_en } : { th: a.snippet, en: a.snippet },
    why: ai ? { th: ai.why_th, en: ai.why_en } : null,
    severity: ai && ai.severity !== "none" ? ai.severity : null,
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
    if (items.length >= ITEMS_PER_SECTION) break;
  }
  return items;
}

export async function buildBrief(env: Env, now = Date.now()): Promise<Brief> {
  const brief: Brief = {
    date: thaiDate(now),
    generatedAt: now,
    model: null,
    neurons: 0,
    sections: { cyber: [], it: [], finance: [] },
    notes: [],
  };
  for (const category of CATEGORIES) {
    const { results } = await env.DB.prepare(
      "SELECT id, url, source, category, region, lang, title, snippet, published_at FROM articles WHERE category = ? AND published_at >= ? ORDER BY published_at DESC LIMIT 120",
    )
      .bind(category, now - WINDOW_MS)
      .all<Article>();
    const candidates = pickCandidates(results);
    if (candidates.length === 0) {
      brief.notes.push(`${category}: no articles in the last 30 hours`);
      continue;
    }
    try {
      const { data, neurons } = await runJson(env, buildMessages(category, candidates), JSON_SCHEMA, MAX_TOKENS, now);
      brief.neurons += neurons;
      brief.model = MODEL;
      brief.sections[category] = mergePicks(candidates, data);
    } catch (err) {
      // Without AI the page still shows the newest headlines, just untranslated and unranked.
      brief.notes.push(`${category}: ${err instanceof BudgetExceeded ? "Neuron budget reached" : "AI step failed"}, showing raw headlines`);
      console.error(`brief ${category}:`, err);
      brief.sections[category] = candidates.slice(0, ITEMS_PER_SECTION).map((a) => toItem(a));
    }
  }
  return brief;
}

export async function saveBrief(env: Env, brief: Brief): Promise<void> {
  const body = JSON.stringify(brief);
  await env.DB.prepare("INSERT OR REPLACE INTO briefs (date, created_at, body) VALUES (?, ?, ?)").bind(brief.date, brief.generatedAt, body).run();
  // KV keeps the hot "today" read off D1; one write per brief stays far under the 1,000/day KV limit.
  await env.CACHE.put("brief:latest", body);
}
