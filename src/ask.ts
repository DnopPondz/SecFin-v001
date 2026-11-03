import { z } from "zod";
import { BRIEF_RESERVE, runJson, type ChatMessage } from "./ai";
import { search, type SearchHit } from "./search";

// Retrieval-augmented answers over the 14-day archive. One question costs about 35 Neurons
// (8 snippets in, a short answer out), and it can never eat into the brief's reserve.
const TOP_K = 8;
const MAX_TOKENS = 700;

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

const OutputSchema = z.object({ answer: z.string().min(1), cited: z.array(z.number().int()) });

const JSON_SCHEMA = {
  type: "object",
  properties: { answer: { type: "string" }, cited: { type: "array", items: { type: "integer" } } },
  required: ["answer", "cited"],
};

export function isThai(s: string): boolean {
  return /[฀-๿]/.test(s);
}

export function buildAskMessages(question: string, hits: SearchHit[]): ChatMessage[] {
  const items = hits
    .map((h, i) => `[${i + 1}] ${h.sourceName}, ${new Date(h.published).toISOString().slice(0, 10)}: ${h.title}\n${h.snippet}`)
    .join("\n\n");
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
      content: `Answer in ${isThai(question) ? "Thai" : "English"}. Put the numbers of the items you cited in "cited".\n\nQuestion: ${question}\n\nNews items:\n${items}`,
    },
  ];
}

// Only items the model says it cited are returned, and only if they exist, so sources are always real.
export function mergeAnswer(hits: SearchHit[], raw: unknown): AskResult {
  const parsed = OutputSchema.parse(raw);
  const cited = [...new Set(parsed.cited)].filter((n) => n >= 1 && n <= hits.length).sort((a, b) => a - b);
  return {
    // The model sometimes repeats its citation list at the end ("(cited: [1], [2])"); the page lists sources already.
    answer: parsed.answer.replace(/\s*\(?\s*cited\s*:[^)]*\)?\s*$/i, "").trim(),
    sources: cited.map((n) => ({ n, title: hits[n - 1].title, url: hits[n - 1].url, sourceName: hits[n - 1].sourceName, published: hits[n - 1].published })),
  };
}

export async function ask(env: Env, question: string, now = Date.now()): Promise<AskResult> {
  const hits = await search(env, question, TOP_K);
  if (hits.length === 0) {
    // No AI call when retrieval finds nothing: there is nothing to ground an answer in.
    return { answer: isThai(question) ? "ไม่พบข่าวที่เกี่ยวข้องในคลังข่าว 14 วันล่าสุด" : "No related stories in the last 14 days.", sources: [] };
  }
  const { data } = await runJson(env, buildAskMessages(question, hits), JSON_SCHEMA, MAX_TOKENS, now, BRIEF_RESERVE);
  return mergeAnswer(hits, data);
}
