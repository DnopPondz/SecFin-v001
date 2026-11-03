import { BRIEF_RESERVE } from "./ai";
import { embed } from "./embed";
import { sourceById } from "./sources";

export interface SearchHit {
  url: string;
  title: string;
  snippet: string;
  sourceName: string;
  category: string;
  region: string;
  published: number;
  score: number;
}

const TOP_K = 10;
// Below this the match is usually a different topic that shares a few words.
const MIN_SCORE = 0.45;

// Semantic search over the last 14 days. A query costs a fraction of a Neuron to embed and
// about 1,024 queried Vectorize dimensions of the 30M free per month.
export async function search(env: Env, query: string, topK = TOP_K): Promise<SearchHit[]> {
  const [vector] = await embed(env, [query], Date.now(), BRIEF_RESERVE);
  const res = await env.VECTORS.query(vector, { topK, returnMetadata: "none" });
  const matches = res.matches.filter((m) => m.score >= MIN_SCORE);
  if (matches.length === 0) return [];
  const { results } = await env.DB.prepare(
    `SELECT id, url, title, snippet, source, category, region, published_at FROM articles WHERE id IN (${matches.map(() => "?").join(",")})`,
  )
    .bind(...matches.map((m) => m.id))
    .all<{ id: string; url: string; title: string; snippet: string; source: string; category: string; region: string; published_at: number }>();
  const byId = new Map(results.map((r) => [r.id, r]));
  return matches.flatMap((m) => {
    const r = byId.get(m.id);
    if (!r) return [];
    return [{ url: r.url, title: r.title, snippet: r.snippet, sourceName: sourceById(r.source)?.name ?? r.source, category: r.category, region: r.region, published: r.published_at, score: Math.round(m.score * 1000) / 1000 }];
  });
}
