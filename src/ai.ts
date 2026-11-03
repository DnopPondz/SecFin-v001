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

async function addNeurons(env: Env, neurons: number, now: number): Promise<void> {
  await env.DB.prepare("INSERT INTO ai_usage (day, neurons) VALUES (?, ?) ON CONFLICT (day) DO UPDATE SET neurons = neurons + excluded.neurons")
    .bind(utcDay(now), neurons)
    .run();
}

// One JSON-mode chat call, metered against DAILY_NEURON_BUDGET before it is sent.
export async function runJson(env: Env, messages: ChatMessage[], schema: object, maxTokens: number, now = Date.now()): Promise<JsonResult> {
  const budget = Number(env.DAILY_NEURON_BUDGET) || 0;
  if ((await neuronsUsed(env, now)) + worstCaseNeurons(messages, maxTokens) > budget) {
    throw new BudgetExceeded("daily Neuron budget reached");
  }
  const options = env.AI_GATEWAY_ID ? { gateway: { id: env.AI_GATEWAY_ID } } : undefined;
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
    choices?: { message?: { content?: unknown } }[];
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
  const data = typeof content === "string" ? JSON.parse(stripFence(content)) : content;
  return { data, neurons };
}

function stripFence(s: string): string {
  return s.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}
