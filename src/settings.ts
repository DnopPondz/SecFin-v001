import { z } from "zod";

// Owner settings, edited on /settings (admin key required) and kept in KV.

export interface Province {
  id: string;
  th: string;
  en: string;
  lat: number;
  lon: number;
}

// PM2.5 panel locations: the same northern provinces isNorth() ranks first, at the provincial seat.
export const PROVINCES: Province[] = [
  { id: "chiangmai", th: "เชียงใหม่", en: "Chiang Mai", lat: 18.79, lon: 98.98 },
  { id: "chiangrai", th: "เชียงราย", en: "Chiang Rai", lat: 19.91, lon: 99.83 },
  { id: "lampang", th: "ลำปาง", en: "Lampang", lat: 18.29, lon: 99.49 },
  { id: "lamphun", th: "ลำพูน", en: "Lamphun", lat: 18.58, lon: 99.01 },
  { id: "maehongson", th: "แม่ฮ่องสอน", en: "Mae Hong Son", lat: 19.3, lon: 97.97 },
  { id: "phayao", th: "พะเยา", en: "Phayao", lat: 19.17, lon: 99.9 },
  { id: "phrae", th: "แพร่", en: "Phrae", lat: 18.14, lon: 100.14 },
  { id: "nan", th: "น่าน", en: "Nan", lat: 18.78, lon: 100.78 },
  { id: "uttaradit", th: "อุตรดิตถ์", en: "Uttaradit", lat: 17.62, lon: 100.1 },
  { id: "tak", th: "ตาก", en: "Tak", lat: 16.88, lon: 99.13 },
  { id: "sukhothai", th: "สุโขทัย", en: "Sukhothai", lat: 17.01, lon: 99.82 },
  { id: "phitsanulok", th: "พิษณุโลก", en: "Phitsanulok", lat: 16.82, lon: 100.26 },
  { id: "phetchabun", th: "เพชรบูรณ์", en: "Phetchabun", lat: 16.42, lon: 101.16 },
];

export interface Settings {
  watch: string[];
}

const KEY = "settings";
const MAX_TERMS = 50;

const Raw = z.object({ watch: z.array(z.string()).optional() });

// Terms are trimmed, 2 to 40 characters, without commas (articles store matches comma-separated),
// and de-duplicated ignoring case.
export function normalizeSettings(raw: unknown): Settings {
  const parsed = Raw.safeParse(raw);
  if (!parsed.success) return { watch: [] };
  const seen = new Set<string>();
  const watch: string[] = [];
  for (const t of (parsed.data.watch ?? []).flatMap((s) => s.split(","))) {
    const term = t.trim().replace(/\s+/g, " ");
    if (term.length < 2 || term.length > 40 || seen.has(term.toLowerCase())) continue;
    seen.add(term.toLowerCase());
    watch.push(term);
    if (watch.length >= MAX_TERMS) break;
  }
  return { watch };
}

export async function loadSettings(env: Env): Promise<Settings> {
  return normalizeSettings(await env.CACHE.get(KEY, "json"));
}

export async function saveSettings(env: Env, settings: Settings): Promise<void> {
  await env.CACHE.put(KEY, JSON.stringify(settings));
}

export type Matcher = (text: string) => string[];

// One case-insensitive regex for the whole list, so tagging an article is a single scan.
// Latin terms match whole words only ("SAP" not in "sapphire"); Thai has no word breaks, so Thai
// terms match anywhere.
export function watchMatcher(terms: string[]): Matcher {
  if (terms.length === 0) return () => [];
  const parts = terms.map((t) => {
    const e = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return /^[\x20-\x7e]+$/.test(t) ? `(?<![\\p{L}\\p{N}])${e}(?![\\p{L}\\p{N}])` : e;
  });
  const re = new RegExp(parts.join("|"), "giu");
  const byLower = new Map(terms.map((t) => [t.toLowerCase(), t]));
  return (text) => {
    const found = new Set<string>();
    for (const m of text.matchAll(re)) {
      const term = byLower.get(m[0].toLowerCase());
      if (term) found.add(term);
    }
    return [...found];
  };
}

const RETAG_WINDOW_MS = 72 * 60 * 60 * 1000;

// After the watchlist changes, re-tag recent articles so the brief and the watch box use the new list.
export async function retagRecent(env: Env, terms: string[], now = Date.now()): Promise<number> {
  const match = watchMatcher(terms);
  const { results } = await env.DB.prepare("SELECT id, title, snippet, watch FROM articles WHERE published_at >= ? LIMIT 2000")
    .bind(now - RETAG_WINDOW_MS)
    .all<{ id: string; title: string; snippet: string; watch: string | null }>();
  const changed = results.flatMap((a) => {
    const next = match(`${a.title} ${a.snippet}`).join(",") || null;
    return next === a.watch ? [] : [env.DB.prepare("UPDATE articles SET watch = ? WHERE id = ?").bind(next, a.id)];
  });
  for (let i = 0; i < changed.length; i += 100) await env.DB.batch(changed.slice(i, i + 100));
  return changed.length;
}
