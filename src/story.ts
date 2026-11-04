import { z } from "zod";
import { runJson, type ChatMessage } from "./ai";
import type { Bilingual, Brief, BriefItem } from "./brief";
import { decodeEntities, safeImageUrl } from "./feed";
import type { Category } from "./sources";
import { thaiDate } from "./time";

// Detailed write-up for one brief story. The publisher's page is fetched once, converted to plain
// text by Workers AI Markdown Conversion (outside this Worker's CPU budget), and summarised; only
// the summary is stored. About 60 Neurons a story, 20 stories a day.

const ARTICLE_CHARS = 6000;
const MIN_ARTICLE_CHARS = 500; // below this the page is probably a paywall, cookie wall or JS shell
const HEAD_BYTES = 150_000;
const MAX_TOKENS = 3000;

export interface StoryDetail {
  id: string;
  category: Category;
  url: string;
  source: string;
  sourceName: string;
  region: "th" | "global";
  published: number;
  image: string | null;
  title: Bilingual;
  lede: Bilingual;
  points: { th: string[]; en: string[] };
  body: { th: string[]; en: string[] };
  why: Bilingual;
  severity: BriefItem["severity"];
  coverage: number;
  alsoReported: string[];
  cves: BriefItem["cves"];
  north: boolean;
  watch?: string[];
  basis: "article" | "snippet"; // whether the publisher's page could be read
  generatedAt: number;
}

const OutputSchema = z.object({
  title_th: z.string().min(1),
  title_en: z.string().min(1),
  lede_th: z.string().min(1),
  lede_en: z.string().min(1),
  points_th: z.array(z.string().min(1)).min(1).max(6),
  points_en: z.array(z.string().min(1)).min(1).max(6),
  body_th: z.array(z.string().min(1)).min(1).max(5),
  body_en: z.array(z.string().min(1)).min(1).max(5),
  why_th: z.string().min(1),
  why_en: z.string().min(1),
});

const strings = { type: "array", items: { type: "string" } };
const JSON_SCHEMA = {
  type: "object",
  properties: {
    title_th: { type: "string" },
    title_en: { type: "string" },
    lede_th: { type: "string" },
    lede_en: { type: "string" },
    points_th: strings,
    points_en: strings,
    body_th: strings,
    body_en: strings,
    why_th: { type: "string" },
    why_en: { type: "string" },
  },
  required: ["title_th", "title_en", "lede_th", "lede_en", "points_th", "points_en", "body_th", "body_en", "why_th", "why_en"],
};

export function ogImage(html: string): string | null {
  const meta = html.match(/<meta\b[^>]*(?:property|name)=["'](?:og:image|twitter:image)(?::src)?["'][^>]*>/i)?.[0];
  const content = meta?.match(/\bcontent=["']([^"']+)["']/i)?.[1];
  return safeImageUrl(content ? decodeEntities(content) : null);
}

interface ArticleText {
  text: string | null;
  image: string | null;
}

// Fetch the publisher's page; failures (403, paywall, timeout) just mean a snippet-based write-up.
export async function fetchArticle(env: Env, url: string): Promise<ArticleText> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "SecFinBrief/0.1 (personal news digest)", accept: "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return { text: null, image: null };
    const html = await res.text();
    const image = ogImage(html.slice(0, HEAD_BYTES));
    const toText = async (cssSelector?: string) => {
      const out = (await env.AI.toMarkdown(
        { name: "article.html", blob: new Blob([html], { type: "text/html" }) },
        { conversionOptions: { output: { format: "text" }, ...(cssSelector ? { html: { cssSelector } } : {}) } } as never,
      )) as unknown as { data?: string } | { data?: string }[];
      const one = Array.isArray(out) ? out[0] : out;
      return (one?.data ?? "").replace(/\s+/g, " ").trim();
    };
    // Prefer the <article> element; whole-page text includes menus and footers.
    let text = await toText("article");
    if (text.length < MIN_ARTICLE_CHARS) text = await toText();
    return { text: text.length >= MIN_ARTICLE_CHARS ? text.slice(0, ARTICLE_CHARS) : null, image };
  } catch (err) {
    console.error(`article ${url}:`, err);
    return { text: null, image: null };
  }
}

export function buildStoryMessages(item: BriefItem, article: string | null): ChatMessage[] {
  const source = article ? `Article text (may include site menus; ignore them):\n${article}` : `Only the headline and snippet are available:\n${item.sourceText}`;
  return [
    {
      role: "system",
      content: [
        "You write a detailed news summary for a reader in Thailand who follows IT, cybersecurity, finance and weather news.",
        "Use only facts stated in the text you are given. Never add numbers, names, dates or claims that are not in it.",
        "If the text is short, keep the summary short rather than padding it. Write plainly, without hype.",
        "Thai text must be natural Thai, keeping product names, CVE ids and company names in English.",
      ].join(" "),
    },
    {
      role: "user",
      content: [
        `Headline: ${item.title.en}`,
        `Publisher: ${item.sourceName}`,
        "",
        "Return, in both Thai (_th) and English (_en):",
        "title: a clear headline; lede: 1 to 2 sentences with the core news;",
        "points: 3 to 5 short key facts; body: 2 to 4 short paragraphs (at most 220 words in total) explaining what happened, who is affected and what comes next;",
        "why: 1 to 2 sentences on the practical impact or what a reader in Thailand should check or do.",
        "",
        source,
      ].join("\n"),
    },
  ];
}

export function mergeStory(item: BriefItem, category: Category, image: string | null, basis: StoryDetail["basis"], raw: unknown, now: number): StoryDetail {
  const o = OutputSchema.parse(raw);
  return {
    id: item.id,
    category,
    url: item.url,
    source: item.source,
    sourceName: item.sourceName,
    region: item.region,
    published: item.published,
    // The feed's image first (chosen by the publisher for the feed), the page's og:image second.
    image: item.image ?? image,
    title: { th: o.title_th, en: o.title_en },
    lede: { th: o.lede_th, en: o.lede_en },
    points: { th: o.points_th, en: o.points_en },
    body: { th: o.body_th, en: o.body_en },
    why: { th: o.why_th, en: o.why_en },
    severity: item.severity,
    coverage: item.coverage,
    alsoReported: item.alsoReported,
    cves: item.cves,
    north: item.north,
    watch: item.watch ?? [],
    basis,
    generatedAt: now,
  };
}

export async function buildStory(env: Env, item: BriefItem, category: Category, now: number): Promise<StoryDetail> {
  const article = await fetchArticle(env, item.url);
  const { data } = await runJson(env, buildStoryMessages(item, article.text), JSON_SCHEMA, MAX_TOKENS, now);
  return mergeStory(item, category, article.image, article.text ? "article" : "snippet", data, now);
}

// One queue message per story. Stories run in the queue consumer, not in the brief Workflow,
// because Workers Free allows 50 external subrequests per Workflow instance across all its steps
// (hit on 2026-11-03 after 14 stories); each consumer invocation gets its own 50.
export interface StoryJob {
  item: BriefItem;
  category: Category;
  now: number;
}

export async function runStoryJob(env: Env, job: StoryJob): Promise<"done" | "skipped"> {
  // A story picked again (it was in yesterday's brief too, or the brief was re-run) is not
  // rewritten, but its image still has to reach the new brief, or that card shows a placeholder.
  const existing = await storyImage(env, job.item.id);
  if (existing !== undefined) {
    if (existing && !job.item.image) await patchBriefImages(env, thaiDate(job.now), new Map([[job.item.id, existing]]));
    return "skipped";
  }
  const story = await buildStory(env, job.item, job.category, job.now);
  await saveStory(env, story);
  // Many feeds carry no image, so the page's og:image found here also goes onto the front page.
  if (story.image && !job.item.image) await patchBriefImages(env, thaiDate(job.now), new Map([[story.id, story.image]]));
  return "done";
}

// Set images on a saved brief for the given story ids. The queue consumer runs one message at a
// time, so these read-modify-write updates do not race. At most one KV write per story.
export async function patchBriefImages(env: Env, date: string, images: Map<string, string>): Promise<number> {
  const row = await env.DB.prepare("SELECT body FROM briefs WHERE date = ?").bind(date).first<{ body: string }>();
  if (!row) return 0;
  const brief = JSON.parse(row.body) as Brief;
  let changed = 0;
  for (const items of Object.values(brief.sections)) {
    for (const it of items) {
      const image = images.get(it.id);
      if (image && !it.image) {
        it.image = image;
        changed++;
      }
    }
  }
  if (changed > 0) {
    const body = JSON.stringify(brief);
    await env.DB.prepare("UPDATE briefs SET body = ? WHERE date = ?").bind(body, date).run();
    const latest = await env.DB.prepare("SELECT date FROM briefs ORDER BY date DESC LIMIT 1").first<{ date: string }>();
    if (latest?.date === date) await env.CACHE.put("brief:latest", body);
  }
  return changed;
}

// One-off backfill for a brief whose stories were written before images were copied back.
export async function backfillBriefImages(env: Env, date: string): Promise<number> {
  const { results } = await env.DB.prepare("SELECT id, json_extract(body, '$.image') AS image FROM stories WHERE json_extract(body, '$.image') IS NOT NULL").all<{ id: string; image: string }>();
  return patchBriefImages(env, date, new Map(results.map((r) => [r.id, r.image])));
}

// A story already written (by an earlier brief) is not redone. Returns undefined when there is
// no write-up yet, otherwise its image URL or null.
export async function storyImage(env: Env, id: string): Promise<string | null | undefined> {
  const row = await env.DB.prepare("SELECT json_extract(body, '$.image') AS image FROM stories WHERE id = ?").bind(id).first<{ image: string | null }>();
  return row ? (row.image ?? null) : undefined;
}

export async function saveStory(env: Env, story: StoryDetail): Promise<void> {
  await env.DB.prepare("INSERT OR REPLACE INTO stories (id, created_at, body) VALUES (?, ?, ?)").bind(story.id, story.generatedAt, JSON.stringify(story)).run();
}
