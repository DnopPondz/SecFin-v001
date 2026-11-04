import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import { BudgetExceeded } from "./ai";
import { aiSection, assembleBrief, attachCves, MIDDAY_CATEGORY, middaySkip, rawSection, saveBrief, saveMidday, type Section } from "./brief";
import { pruneArticles } from "./ingest";
import { CATEGORIES, type Category } from "./sources";
import { thaiDate } from "./time";

export interface BriefParams {
  now: number;
  edition?: "midday";
}

// The daily brief as durable steps: each section retries on its own, a failed section falls
// back to raw headlines, and a retry never repeats AI calls that already succeeded.
// Each step gets its own 10 ms CPU budget on Workers Free; about 8 steps a day of the 3,000 allowed,
// plus 4 for the midday update.
export class BriefWorkflow extends WorkflowEntrypoint<Env, BriefParams> {
  async run(event: WorkflowEvent<BriefParams>, step: WorkflowStep) {
    if (event.payload.edition === "midday") return this.midday(event.payload.now, step);
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

    // Detailed write-ups go to the queue once the brief is live: each story fetches the publisher's
    // page, and a Workflow instance only gets 50 external subrequests in total on Workers Free.
    // A story that fails leaves its page showing the brief summary.
    const stories = await step.do("queue stories", async () => {
      const jobs = CATEGORIES.flatMap((category) => brief.sections[category].map((item) => ({ body: { story: { item, category, now } } })));
      if (jobs.length > 0) await this.env.INGEST_QUEUE.sendBatch(jobs);
      return jobs.length;
    });

    await step.do("prune", () => pruneArticles(this.env, now));
    return { date: brief.date, neurons: brief.neurons, notes, stories };
  }

  // 12:00 update: new finance stories since the morning brief, added to that brief with write-ups.
  // About 50 Neurons for ranking and 60 per write-up.
  private async midday(now: number, step: WorkflowStep) {
    const date = thaiDate(now);
    const skip = await step.do("load morning brief", () => middaySkip(this.env, date));
    if (!skip) return { date, skipped: "no brief for this date" };
    let section: Section;
    try {
      section = await step.do(
        `midday ${MIDDAY_CATEGORY}`,
        { retries: { limit: 2, delay: "1 minute", backoff: "exponential" }, timeout: "5 minutes" },
        async () => {
          try {
            return await aiSection(this.env, MIDDAY_CATEGORY, now, skip);
          } catch (err) {
            if (err instanceof BudgetExceeded) throw new NonRetryableError(err.message);
            throw err;
          }
        },
      );
    } catch {
      section = await step.do(`midday ${MIDDAY_CATEGORY} raw`, () => rawSection(this.env, MIDDAY_CATEGORY, now, skip));
    }
    const midday = { generatedAt: now, category: MIDDAY_CATEGORY, ...section };
    const saved = await step.do("save midday", () => saveMidday(this.env, date, midday));
    if (!saved) return { date, skipped: "brief disappeared" };
    const stories = await step.do("queue midday stories", async () => {
      const jobs = midday.items.map((item) => ({ body: { story: { item, category: MIDDAY_CATEGORY, now } } }));
      if (jobs.length > 0) await this.env.INGEST_QUEUE.sendBatch(jobs);
      return jobs.length;
    });
    return { date, neurons: midday.neurons, items: midday.items.length, stories };
  }
}
