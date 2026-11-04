// "Report a mistake" on story pages: readers flag a wrong fact, a bad translation or a broken
// link, and the owner sees the list on /adms. Nothing identifying is stored.

export const REASONS = ["fact", "translation", "link", "other"] as const;
export type Reason = (typeof REASONS)[number];

export interface ReportBody {
  id?: unknown;
  reason?: unknown;
  note?: unknown;
  lang?: unknown;
}

export interface Report {
  id: string;
  reason: Reason;
  note: string;
  lang: "th" | "en";
}

const MAX_NOTE = 500;

export function validReport(body: ReportBody): Report | null {
  if (typeof body.id !== "string" || !/^[0-9a-f]{64}$/.test(body.id)) return null;
  const reason = REASONS.includes(body.reason as Reason) ? (body.reason as Reason) : null;
  if (!reason) return null;
  const note = typeof body.note === "string" ? body.note.replace(/\s+/g, " ").trim().slice(0, MAX_NOTE) : "";
  if (reason === "other" && note.length < 3) return null; // "other" needs a word of explanation
  return { id: body.id, reason, note, lang: body.lang === "en" ? "en" : "th" };
}

export async function saveReport(env: Env, r: Report, now = Date.now()): Promise<void> {
  await env.DB.prepare("INSERT INTO reports (story_id, reason, note, lang, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(r.id, r.reason, r.note, r.lang, now)
    .run();
}

export interface OpenReport {
  id: number;
  storyId: string;
  reason: Reason;
  note: string;
  createdAt: number;
  title: string | null;
  url: string | null;
}

// Titles come from the stored write-up, or the article row while the write-up does not exist yet.
export async function openReports(env: Env): Promise<OpenReport[]> {
  const { results } = await env.DB.prepare(
    `SELECT r.id, r.story_id AS storyId, r.reason, r.note, r.created_at AS createdAt,
            COALESCE(json_extract(s.body, '$.title.th'), a.title) AS title, COALESCE(json_extract(s.body, '$.url'), a.url) AS url
     FROM reports r LEFT JOIN stories s ON s.id = r.story_id LEFT JOIN articles a ON a.id = r.story_id
     WHERE r.resolved = 0 ORDER BY r.created_at DESC LIMIT 50`,
  ).all<OpenReport>();
  return results;
}

export async function resolveReport(env: Env, id: number): Promise<boolean> {
  const out = await env.DB.prepare("UPDATE reports SET resolved = 1 WHERE id = ?").bind(id).run();
  return (out.meta.changes ?? 0) > 0;
}
