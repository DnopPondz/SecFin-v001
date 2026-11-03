import { addNeurons, assertBudget, gatewayOptions } from "./ai";

// bge-m3 is multilingual, so a Thai and an English headline about the same story land close together.
// 1,075 Neurons per million input tokens: a full day of articles costs well under 100 Neurons.
export const EMBED_MODEL = "@cf/baai/bge-m3";
export const EMBED_DIMENSIONS = 1024;
const NEURONS_PER_M_INPUT = 1075;
const MAX_CHARS = 400;

function estimateNeurons(texts: string[]): number {
  const chars = texts.reduce((n, t) => n + Math.min(t.length, MAX_CHARS), 0);
  return ((chars / 1.5) * NEURONS_PER_M_INPUT) / 1_000_000;
}

export async function embed(env: Env, texts: string[], now = Date.now(), reserve = 0): Promise<number[][]> {
  if (texts.length === 0) return [];
  const estimate = estimateNeurons(texts);
  await assertBudget(env, estimate, now, reserve);
  const out = (await env.AI.run(EMBED_MODEL, { text: texts.map((t) => t.slice(0, MAX_CHARS)) }, gatewayOptions(env))) as { data?: number[][] };
  // bge-m3 does not report token usage, so the estimate is what gets metered.
  await addNeurons(env, estimate, now);
  if (!out.data || out.data.length !== texts.length) throw new Error("embedding response did not match the input");
  return out.data;
}
