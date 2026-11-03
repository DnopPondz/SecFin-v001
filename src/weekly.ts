import type { Brief, BriefItem } from "./brief";
import { CATEGORIES, type Category } from "./sources";
import { thaiDate } from "./time";

const PER_SECTION = 10;
// Stored in KV until R2 is enabled (KV values can be 25 MiB; a digest is a few hundred KB).
const PDF_TTL_SECONDS = 60 * 86_400;

const SECTION_TH: Record<Category, string> = { cyber: "Cyber Security", it: "IT", finance: "การเงิน", disaster: "สภาพอากาศและภัยพิบัติ" };

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Week's top stories per section: one entry per link, widest coverage first, then newest.
export function weeklyTop(briefs: Brief[]): Record<Category, (BriefItem & { day: string })[]> {
  const out = {} as Record<Category, (BriefItem & { day: string })[]>;
  for (const cat of CATEGORIES) {
    const seen = new Set<string>();
    const items: (BriefItem & { day: string })[] = [];
    for (const b of [...briefs].sort((x, y) => y.date.localeCompare(x.date))) {
      for (const it of b.sections[cat] ?? []) {
        if (seen.has(it.url)) continue;
        seen.add(it.url);
        items.push({ ...it, day: b.date });
      }
    }
    out[cat] = items.sort((a, b) => (b.coverage ?? 1) - (a.coverage ?? 1) || b.day.localeCompare(a.day)).slice(0, PER_SECTION);
  }
  return out;
}

export function renderWeeklyHtml(briefs: Brief[], now: number): string {
  const top = weeklyTop(briefs);
  const days = briefs.map((b) => b.date).sort();
  const range = days.length ? `${days[0]} ถึง ${days[days.length - 1]}` : thaiDate(now);
  const sections = CATEGORIES.map((cat) => {
    const rows = top[cat]
      .map((it) => {
        const cves = (it.cves ?? []).map((c) => `${c.id}${c.cvss !== null ? ` (CVSS ${c.cvss})` : ""}${c.kevAdded ? " KEV" : ""}`).join(", ");
        return `<li><a href="${esc(it.url)}">${esc(it.title.th)}</a>
<p>${esc(it.summary.th)}</p>
${it.why ? `<p class="why">ทำไมต้องสนใจ: ${esc(it.why.th)}</p>` : ""}
<p class="meta">${esc(it.sourceName)}${(it.coverage ?? 1) > 1 ? ` และอีก ${it.coverage - 1} แหล่ง` : ""} · ${esc(it.day)}${cves ? ` · ${esc(cves)}` : ""}</p></li>`;
      })
      .join("\n");
    return `<h2>${SECTION_TH[cat]}</h2><ol>${rows || "<li>ไม่มีข่าว</li>"}</ol>`;
  }).join("\n");
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>SecFin Brief สรุปประจำสัปดาห์</title>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;600&display=swap" rel="stylesheet">
<style>
body{font:11pt/1.55 "IBM Plex Sans Thai",sans-serif;color:#16181d;margin:0}
h1{font-size:18pt;margin:0 0 2pt}h2{font-size:13pt;margin:16pt 0 6pt;border-bottom:1px solid #ccc;padding-bottom:3pt}
.range{color:#5b6270;margin:0 0 8pt}ol{padding-left:16pt;margin:0}li{margin:0 0 8pt;break-inside:avoid}
li a{color:#16181d;font-weight:600;text-decoration:none}p{margin:2pt 0}.why{color:#374151}.meta{color:#5b6270;font-size:9pt}
footer{margin-top:16pt;color:#5b6270;font-size:8.5pt}
</style></head><body>
<h1>SecFin Brief สรุปประจำสัปดาห์</h1><p class="range">${esc(range)}</p>
${sections}
<footer>สรุปโดย AI จากหัวข้อและเนื้อหาย่อของแหล่งข่าว ข้อมูล CVE จาก NVD โปรดอ่านต้นฉบับก่อนตัดสินใจ</footer>
</body></html>`;
}

export async function loadWeekBriefs(env: Env, now: number): Promise<Brief[]> {
  const { results } = await env.DB.prepare("SELECT body FROM briefs WHERE date <= ? ORDER BY date DESC LIMIT 7").bind(thaiDate(now)).all<{ body: string }>();
  return results.map((r) => JSON.parse(r.body) as Brief);
}

// Browser Run Quick Action through the binding: no puppeteer, no API token, and the PDF bytes
// come back as a plain response, so it fits the 10 ms CPU budget. Uses about 10 s of the
// 10 free browser-minutes a day.
export async function makeWeeklyPdf(env: Env, now = Date.now()): Promise<{ date: string; bytes: number }> {
  const html = renderWeeklyHtml(await loadWeekBriefs(env, now), now);
  const res = await env.BROWSER.quickAction("pdf", {
    html,
    gotoOptions: { waitUntil: "networkidle0", timeout: 30_000 },
    pdfOptions: { format: "a4", printBackground: true, margin: { top: "14mm", bottom: "14mm", left: "14mm", right: "14mm" } },
  });
  if (!res.ok) throw new Error(`Browser Run ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const pdf = await res.arrayBuffer();
  const date = thaiDate(now);
  await env.CACHE.put(`pdf:${date}`, pdf, { expirationTtl: PDF_TTL_SECONDS });
  await env.CACHE.put("pdf:latest", date);
  return { date, bytes: pdf.byteLength };
}
