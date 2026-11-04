import { z } from "zod";
import { BRIEF_RESERVE, runJson, type ChatMessage } from "./ai";
import { search, type SearchHit } from "./search";

// Retrieval-augmented answers over the 14-day archive. One question costs about 35 Neurons
// (8 snippets in, a short answer out), and it can never eat into the brief's reserve.
const TOP_K = 8;
// A long Thai answer is about 400 tokens. Raising this does not help the JSON-mode whitespace loop
// (see salvageJson in ai.ts); it only makes a looping reply cost more.
const MAX_TOKENS = 1000;

export interface AskSource {
  n: number;
  title: string;
  url: string;
  sourceName: string;
  published: number;
}

export interface AskResult {
  answer: string;
  sources: AskSource[];
}

// "cited" can be missing when a looping reply was closed early (salvageJson); the inline [n]
// markers in the answer say the same thing.
const OutputSchema = z.object({ answer: z.string().min(1), cited: z.array(z.number().int()).optional() });

export function inlineCitations(answer: string): number[] {
  return [...answer.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g)].flatMap((m) => m[1].split(",").map((n) => Number(n.trim())));
}

const JSON_SCHEMA = {
  type: "object",
  properties: { answer: { type: "string" }, cited: { type: "array", items: { type: "integer" } } },
  required: ["answer", "cited"],
};

export function isThai(s: string): boolean {
  return /[฀-๿]/.test(s);
}

// Earlier turns of the chat, so "and what about that one?" can be resolved. The page sends at
// most the last two; each is trimmed so a turn adds only a few Neurons.
export interface Turn {
  q: string;
  a: string;
}

const MAX_TURNS = 2;

export function validHistory(raw: unknown): Turn[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t): t is { q: string; a: string } => typeof t?.q === "string" && typeof t?.a === "string")
    .slice(-MAX_TURNS)
    .map((t) => ({ q: t.q.trim().slice(0, 300), a: t.a.trim().slice(0, 600) }))
    .filter((t) => t.q && t.a);
}

// Retrieval uses the previous question too, so a follow-up finds the same stories.
export function retrievalQuery(question: string, history: Turn[]): string {
  const prev = history.at(-1)?.q;
  return prev ? `${prev} ${question}`.slice(0, 300) : question;
}

export function buildAskMessages(question: string, hits: SearchHit[], history: Turn[] = []): ChatMessage[] {
  const items = hits
    .map((h, i) => `[${i + 1}] ${h.sourceName}, ${new Date(h.published).toISOString().slice(0, 10)}: ${h.title}\n${h.snippet}`)
    .join("\n\n");
  const earlier = history.length
    ? `Earlier in this conversation (use it only to understand what the new question refers to; answer from the news items):\n${history.map((t) => `Q: ${t.q}\nA: ${t.a}`).join("\n")}\n\n`
    : "";
  return [
    {
      role: "system",
      content: [
        "You answer questions about recent IT, cybersecurity and finance news using only the numbered news items given.",
        "Cite the items you use inline as [n]. If the items do not answer the question, say so plainly instead of guessing.",
        "Never add facts, numbers or names that are not in the items. Keep the answer under 120 words, and do not repeat the citation list at the end.",
      ].join(" "),
    },
    {
      role: "user",
      content: `Answer in ${isThai(question) ? "Thai" : "English"}. Put the numbers of the items you cited in "cited".\n\n${earlier}Question: ${question}\n\nNews items:\n${items}`,
    },
  ];
}

// Only items the model says it cited are returned, and only if they exist, so sources are always real.
export function mergeAnswer(hits: SearchHit[], raw: unknown): AskResult {
  const parsed = OutputSchema.parse(raw);
  const claimed = parsed.cited?.length ? parsed.cited : inlineCitations(parsed.answer);
  const cited = [...new Set(claimed)].filter((n) => n >= 1 && n <= hits.length).sort((a, b) => a - b);
  return {
    // The model sometimes repeats its citation list at the end ("(cited: [1], [2])"); the page lists sources already.
    answer: parsed.answer.replace(/\s*\(?\s*cited\s*:[^)]*\)?\s*$/i, "").trim(),
    sources: cited.map((n) => ({ n, title: hits[n - 1].title, url: hits[n - 1].url, sourceName: hits[n - 1].sourceName, published: hits[n - 1].published })),
  };
}

export async function ask(env: Env, question: string, now = Date.now(), history: Turn[] = []): Promise<AskResult> {
  const hits = await search(env, retrievalQuery(question, history), TOP_K);
  if (hits.length === 0) {
    // No AI call when retrieval finds nothing: there is nothing to ground an answer in.
    return { answer: isThai(question) ? "ไม่พบข่าวที่เกี่ยวข้องในคลังข่าว 14 วันล่าสุด" : "No related stories in the last 14 days.", sources: [] };
  }
  const { data } = await runJson(env, buildAskMessages(question, hits, history), JSON_SCHEMA, MAX_TOKENS, now, BRIEF_RESERVE);
  return mergeAnswer(hits, data);
}
