import { embed } from "./embed";
import type { Category } from "./sources";

// Same story across sources and languages scored 0.75 to 0.89 with bge-m3 in testing on
// 2026-11-03; different stories on a similar topic stayed at or below 0.60.
export const SAME_STORY = 0.75;
const CLUSTER_WINDOW_MS = 72 * 60 * 60 * 1000;
const BATCH = 20;

export interface VectorMatch {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
}

// Join the closest earlier story within the window, or return null to start a new cluster.
export function chooseCluster(matches: VectorMatch[], selfId: string, published: number, threshold = SAME_STORY): string | null {
  for (const m of [...matches].sort((a, b) => b.score - a.score)) {
    if (m.id === selfId) continue;
    if (m.score < threshold) break;
    const p = Number(m.metadata?.published);
    if (!Number.isFinite(p) || Math.abs(published - p) > CLUSTER_WINDOW_MS) continue;
    const cluster = m.metadata?.cluster;
    return typeof cluster === "string" ? cluster : m.id;
  }
  return null;
}

interface Pending {
  id: string;
  source: string;
  category: Category;
  title: string;
  snippet: string;
  published_at: number;
}

// Embed this source's articles that have no vector yet (new ones, plus any earlier failures),
// assign clusters, and store the vectors for search. Returns how many were embedded.
export async function embedPending(env: Env, source: string, now = Date.now()): Promise<number> {
  const { results } = await env.DB.prepare(
    "SELECT id, source, category, title, snippet, published_at FROM articles WHERE source = ? AND embedded = 0 ORDER BY published_at DESC LIMIT ?",
  )
    .bind(source, BATCH)
    .all<Pending>();
  if (results.length === 0) return 0;

  const vectors = await embed(env, results.map((a) => `${a.title}. ${a.snippet}`), now);
  const clusters = await Promise.all(
    results.map(async (a, i) => {
      const res = await env.VECTORS.query(vectors[i], { topK: 5, returnMetadata: "all" });
      return chooseCluster(res.matches as VectorMatch[], a.id, a.published_at) ?? a.id;
    }),
  );

  await env.VECTORS.upsert(
    results.map((a, i) => ({
      id: a.id,
      values: vectors[i],
      metadata: { category: a.category, source: a.source, published: a.published_at, cluster: clusters[i] },
    })),
  );
  await env.DB.batch(
    results.map((a, i) => env.DB.prepare("UPDATE articles SET cluster_id = ?, embedded = 1 WHERE id = ?").bind(clusters[i], a.id)),
  );
  return results.length;
}
