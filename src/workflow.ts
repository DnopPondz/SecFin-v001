import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import { BudgetExceeded } from "./ai";
import { aiSection, assembleBrief, attachCves, rawSection, saveBrief, type Section } from "./brief";
import { pruneArticles } from "./ingest";
import { CATEGORIES, type Category } from "./sources";

export interface BriefParams {
  now: number;
}

// The daily brief as durable steps: each section retries on its own, a failed section falls
// back to raw headlines, and a retry never repeats AI calls that already succeeded.
// Each step gets its own 10 ms CPU budget on Workers Free; about 7 steps a day of the 3,000 allowed.
export class BriefWorkflow extends WorkflowEntrypoint<Env, BriefParams> {
  async run(event: WorkflowEvent<BriefParams>, step: WorkflowStep) {
    const now = event.payload.now;
    const sections = {} as Record<Category, Section>;
    const notes: string[] = [];

    for (const category of CATEGORIES) {
      try {
        sections[category] = await step.do(
          `section ${category}`,
          { retries: { limit: 2, delay: "1 minute", backoff: "exponential" }, timeout: "5 minutes" },
          async () => {
            try {
              return await aiSection(this.env, category, now);
            } catch (err) {
              // Retrying cannot help once the daily budget is spent.
              if (err instanceof BudgetExceeded) throw new NonRetryableError(err.message);
              throw err;
            }
          },
        );
      } catch (err) {
        notes.push(`${category}: AI step failed (${String(err instanceof Error ? err.message : err).slice(0, 80)}), showing raw headlines`);
        sections[category] = await step.do(`section ${category} raw`, () => rawSection(this.env, category, now));
      }
    }

    sections.cyber = await step.do("cve lookup", { retries: { limit: 1, delay: "30 seconds" } }, async () => ({
      ...sections.cyber,
      items: await attachCves(this.env, sections.cyber.items, now),
    }));

    const brief = assembleBrief(now, sections, notes);
    await step.do("save", () => saveBrief(this.env, brief));
    await step.do("prune", () => pruneArticles(this.env, now));
    return { date: brief.date, neurons: brief.neurons, notes };
  }
}
