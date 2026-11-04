import { utcDay } from "./time";

// Gemma 4 26B A4B is on the Workers Free plan (unlike Kimi K2.x and GLM-5.x, which return 5035).
// Prices from https://developers.cloudflare.com/workers-ai/platform/pricing/ (checked 2026-11-03).
export const MODEL = "@cf/google/gemma-4-26b-a4b-it";
const NEURONS_PER_M_INPUT = 9091;
const NEURONS_PER_M_OUTPUT = 27273;

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export interface JsonResult {
  data: unknown;
  neurons: number;
}

export class BudgetExceeded extends Error {}

// Thai runs close to one token per 1.5 characters; dividing by 1.5 overestimates English, which is the safe side.
function worstCaseNeurons(messages: ChatMessage[], maxTokens: number): number {
  const chars = messages.reduce((n, m) => n + m.content.length, 0);
  return ((chars / 1.5) * NEURONS_PER_M_INPUT + maxTokens * NEURONS_PER_M_OUTPUT) / 1_000_000;
}

export async function neuronsUsed(env: Env, now = Date.now()): Promise<number> {
  const row = await env.DB.prepare("SELECT neurons FROM ai_usage WHERE day = ?").bind(utcDay(now)).first<{ neurons: number }>();
  return row?.neurons ?? 0;
}

export async function addNeurons(env: Env, neurons: number, now: number): Promise<void> {
  await env.DB.prepare("INSERT INTO ai_usage (day, neurons) VALUES (?, ?) ON CONFLICT (day) DO UPDATE SET neurons = neurons + excluded.neurons")
    .bind(utcDay(now), neurons)
    .run();
}

// Visitor-triggered calls (search, ask) must leave this much for the brief Workflow, which runs at
// 22:30 UTC, near the end of the UTC day the budget is counted in. The 4 sections cost about 200
// and the 20 detailed stories about 60 each (worst case about 100).
export const BRIEF_RESERVE = 2500;

// Refuse a call up front when its worst case would cross DAILY_NEURON_BUDGET minus `reserve`.
export async function assertBudget(env: Env, estimate: number, now: number, reserve = 0): Promise<void> {
  const budget = Number(env.DAILY_NEURON_BUDGET) || 0;
  if ((await neuronsUsed(env, now)) + estimate > budget - reserve) throw new BudgetExceeded("daily Neuron budget reached");
}

// skipCache: a cached reply would make a Workflow retry return the same broken output again
// (seen on 2026-11-03: three retries failed at the same JSON position within a second).
export function gatewayOptions(env: Env): AiOptions | undefined {
  return env.AI_GATEWAY_ID ? { gateway: { id: env.AI_GATEWAY_ID, skipCache: true } } : undefined;
}

export class TruncatedOutput extends Error {}

// One JSON-mode chat call, metered against DAILY_NEURON_BUDGET before it is sent.
export async function runJson(env: Env, messages: ChatMessage[], schema: object, maxTokens: number, now = Date.now(), reserve = 0): Promise<JsonResult> {
  await assertBudget(env, worstCaseNeurons(messages, maxTokens), now, reserve);
  const options = gatewayOptions(env);
  const out = (await env.AI.run(
    MODEL as keyof AiModels,
    {
      messages,
      max_tokens: maxTokens,
      temperature: 0.2,
      response_format: { type: "json_schema", json_schema: { name: "brief", schema } },
      // Reasoning tokens bill as output Neurons and add nothing to a summary.
      chat_template_kwargs: { enable_thinking: false },
    } as never,
    options,
  )) as {
    choices?: { message?: { content?: unknown }; finish_reason?: string }[];
    response?: unknown;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const usage = out.usage ?? {};
  const neurons =
    usage.prompt_tokens !== undefined || usage.completion_tokens !== undefined
      ? ((usage.prompt_tokens ?? 0) * NEURONS_PER_M_INPUT + (usage.completion_tokens ?? 0) * NEURONS_PER_M_OUTPUT) / 1_000_000
      : worstCaseNeurons(messages, maxTokens);
  await addNeurons(env, neurons, now);

  const content = out.choices?.[0]?.message?.content ?? out.response;
  // Gemma in JSON mode sometimes finishes the last value and then emits blank lines until
  // max_tokens (seen 2026-11-04 on a chat answer). If the cut fell in that whitespace the reply is
  // complete and only needs closing; a reply cut inside a value is still an error.
  if (out.choices?.[0]?.finish_reason === "length") {
    const salvaged = salvageJson(content);
    if (salvaged === undefined) throw new TruncatedOutput(`reply hit max_tokens (${maxTokens})`);
    console.warn(`runJson: closed a reply that ran into whitespace at max_tokens (${maxTokens})`);
    return { data: salvaged, neurons };
  }
  let data: unknown;
  try {
    data = typeof content === "string" ? JSON.parse(stripFence(content)) : content;
  } catch (err) {
    // Enough context in the log to tell a cut-off reply from a malformed one.
    throw new Error(`${err instanceof Error ? err.message : err}; finish_reason=${out.choices?.[0]?.finish_reason}, completion_tokens=${usage.completion_tokens}, starts: ${String(content).slice(0, 160)}`);
  }
  return { data, neurons };
}

// Close a JSON reply that ended in whitespace after a complete value. Only a cut right after a
// closing quote, bracket or brace qualifies, so a value cut mid-text is never passed off as whole.
export function salvageJson(content: unknown): unknown | undefined {
  if (typeof content !== "string") return undefined;
  const trimmed = stripFence(content).trimEnd();
  if (!/(?:[^\\]"|[\]}])$/.test(trimmed)) return undefined;
  for (const tail of ["", "}", "]}", "}]}"]) {
    try {
      return JSON.parse(trimmed + tail);
    } catch {
      // try the next closing
    }
  }
  return undefined;
}

function stripFence(s: string): string {
  return s.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}
