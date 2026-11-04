import type { Brief } from "./brief";
import { neuronsUsed } from "./ai";
import { SOURCES } from "./sources";
import { thaiDate } from "./time";

// Health report shown on /settings: what needs attention right now. Nothing is sent anywhere
// (the owner declined Telegram on 2026-11-04).

const STALE_RUN_MS = 3 * 60 * 60 * 1000;
const QUIET_MS = 48 * 60 * 60 * 1000;
const NEURON_WARN = 0.8;

// Keyword-filtered and magnitude-filtered feeds can be quiet for days, so only unfiltered feeds
// are checked for "no new articles".
export async function healthProblems(env: Env, now: number): Promise<string[]> {
  const problems: string[] = [];
  const date = thaiDate(now);
  const brief = await env.DB.prepare("SELECT body FROM briefs WHERE date = ?").bind(date).first<{ body: string }>();
  if (!brief) problems.push(`ยังไม่มีบรีฟของวันที่ ${date}`);
  else {
    const b = JSON.parse(brief.body) as Brief;
    const ids = Object.values(b.sections).flat().map((it) => it.id);
    if (ids.length > 0) {
      const done = await env.DB.prepare(`SELECT COUNT(*) AS n FROM stories WHERE id IN (${ids.map(() => "?").join(",")})`)
        .bind(...ids)
        .first<{ n: number }>();
      if ((done?.n ?? 0) < ids.length) problems.push(`บทสรุปละเอียดเสร็จ ${done?.n ?? 0} จาก ${ids.length} ข่าว`);
    }
    if (b.notes.length > 0) problems.push(...b.notes);
  }

  const { results: feeds } = await env.DB.prepare("SELECT source, last_run, last_status FROM feed_state").all<{ source: string; last_run: number; last_status: string }>();
  const state = new Map(feeds.map((f) => [f.source, f]));
  const { results: latest } = await env.DB.prepare("SELECT source, MAX(fetched_at) AS last FROM articles GROUP BY source").all<{ source: string; last: number }>();
  const lastNew = new Map(latest.map((r) => [r.source, r.last]));
  for (const s of SOURCES) {
    const f = state.get(s.id);
    if (!f || now - f.last_run > STALE_RUN_MS) problems.push(`${s.name}: ไม่ได้ดึงข่าวมากกว่า 3 ชั่วโมง`);
    else if (f.last_status !== "ok") problems.push(`${s.name}: ${f.last_status}`);
    else if (!s.filter && s.minMagnitude === undefined && now - (lastNew.get(s.id) ?? 0) > QUIET_MS) problems.push(`${s.name}: ไม่มีข่าวใหม่ใน 48 ชั่วโมง`);
  }

  const used = await neuronsUsed(env, now);
  const budget = Number(env.DAILY_NEURON_BUDGET) || 0;
  if (budget > 0 && used > budget * NEURON_WARN) problems.push(`ใช้ Neuron วันนี้ ${Math.round(used)} จาก ${budget}`);
  return problems;
}
