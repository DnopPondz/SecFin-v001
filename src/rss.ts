import type { Brief } from "./brief";
import { CATEGORIES, type Category } from "./sources";

const SECTION_TH: Record<Category, string> = { cyber: "Cyber", it: "IT", finance: "การเงิน" };

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// One RSS item per story in the latest brief, in Thai, linking to the original publisher.
export function renderRss(brief: Brief | null, origin: string): string {
  const items = brief
    ? CATEGORIES.flatMap((cat) =>
        brief.sections[cat].map((it) => {
          const desc = it.why ? `${it.summary.th}\n\nทำไมต้องสนใจ: ${it.why.th}` : it.summary.th;
          return [
            "<item>",
            `<title>${esc(`[${SECTION_TH[cat]}] ${it.title.th}`)}</title>`,
            `<link>${esc(it.url)}</link>`,
            `<guid isPermaLink="true">${esc(it.url)}</guid>`,
            `<category>${cat}</category>`,
            `<pubDate>${new Date(brief.generatedAt).toUTCString()}</pubDate>`,
            `<description>${esc(`${desc}\n\nที่มา: ${it.sourceName}`)}</description>`,
            "</item>",
          ].join("");
        }),
      )
    : [];
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0"><channel>',
    "<title>SecFin Brief</title>",
    `<link>${esc(origin)}/</link>`,
    "<description>สรุปข่าว IT, Cyber Security และการเงิน รายวัน</description>",
    "<language>th</language>",
    ...items,
    "</channel></rss>",
  ].join("\n");
}
