import type { Category } from "./sources";

export interface Article {
  id: string;
  url: string;
  source: string;
  category: Category;
  region: "th" | "global";
  lang: "th" | "en";
  title: string;
  snippet: string;
  published_at: number;
}

// Security stories show up in general IT feeds (Blognone, The Register) all the time.
// Moving them by keyword is free; asking the model to classify every article would cost Neurons.
const CYBER_WORDS = [
  "ransomware", "malware", "phishing", "vulnerability", "vulnerabilities", "zero-day", "0-day", "exploit",
  "breach", "hacker", "hacked", "botnet", "ddos", "backdoor", "cve-", "patch tuesday", "infostealer", "spyware",
  "ช่องโหว่", "แฮก", "แฮ็ก", "มัลแวร์", "ฟิชชิ่ง", "แรนซัมแวร์", "ข้อมูลรั่ว", "รั่วไหล", "โจมตีไซเบอร์", "ภัยไซเบอร์", "มิจฉาชีพ",
];

export function classify(defaultCategory: Category, title: string, snippet: string): Category {
  if (defaultCategory !== "it") return defaultCategory;
  const text = `${title} ${snippet}`.toLowerCase();
  return CYBER_WORDS.some((w) => text.includes(w)) ? "cyber" : "it";
}

// Character bigrams work for Thai, which has no spaces between words.
function bigrams(s: string): Set<string> {
  const t = s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  const out = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
}

export function similarity(a: string, b: string): number {
  const x = bigrams(a);
  const y = bigrams(b);
  if (x.size === 0 || y.size === 0) return 0;
  let shared = 0;
  for (const g of x) if (y.has(g)) shared++;
  return shared / (x.size + y.size - shared);
}

export interface PickOptions {
  limit: number;
  perSource: number;
  duplicateAt: number;
}

export const DEFAULT_PICK: PickOptions = { limit: 18, perSource: 4, duplicateAt: 0.5 };

// Round-robin across sources (newest first within each) so one busy feed cannot fill the
// shortlist, and drop near-duplicate headlines of the same story.
export function pickCandidates(articles: Article[], opts: PickOptions = DEFAULT_PICK): Article[] {
  const bySource = new Map<string, Article[]>();
  for (const a of [...articles].sort((p, q) => q.published_at - p.published_at)) {
    const list = bySource.get(a.source) ?? [];
    list.push(a);
    bySource.set(a.source, list);
  }
  const queues = [...bySource.values()];
  const picked: Article[] = [];
  const taken = new Map<string, number>();
  while (picked.length < opts.limit && queues.some((q) => q.length > 0)) {
    for (const q of queues) {
      if (picked.length >= opts.limit) break;
      const a = q.shift();
      if (!a) continue;
      if ((taken.get(a.source) ?? 0) >= opts.perSource) continue;
      if (picked.some((p) => similarity(p.title, a.title) >= opts.duplicateAt)) continue;
      picked.push(a);
      taken.set(a.source, (taken.get(a.source) ?? 0) + 1);
    }
  }
  return picked;
}
