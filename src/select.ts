import type { Category, Source } from "./sources";

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
  cluster_id?: string | null;
  // Filled by collapseClusters: how many distinct sources carried the story, and which others.
  coverage?: number;
  alsoIn?: string[];
  // Section-specific boost applied before coverage (Northern Thailand in the disaster section).
  priority?: number;
}

// One row per story: the newest article represents its cluster, and the story goes to the
// section most of its articles were filed under (ties keep the representative's section).
export function collapseClusters(rows: Article[]): Article[] {
  const groups = new Map<string, Article[]>();
  for (const a of rows) {
    const key = a.cluster_id ?? a.id;
    const list = groups.get(key) ?? [];
    list.push(a);
    groups.set(key, list);
  }
  return [...groups.values()].map((members) => {
    members.sort((p, q) => q.published_at - p.published_at);
    const rep = members[0];
    const counts = new Map<Category, number>();
    for (const m of members) counts.set(m.category, (counts.get(m.category) ?? 0) + 1);
    const top = Math.max(...counts.values());
    const category = counts.get(rep.category) === top ? rep.category : [...counts].find(([, c]) => c === top)![0];
    const sources = [...new Set(members.map((m) => m.source))];
    return { ...rep, category, coverage: sources.length, alsoIn: sources.filter((s) => s !== rep.source) };
  });
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

const DISASTER_WORDS = [
  "น้ำท่วม", "อุทกภัย", "ดินถล่ม", "ดินโคลนถล่ม", "แผ่นดินไหว", "พายุ", "ไต้ฝุ่น", "ฝนตกหนัก", "ฝนถล่ม", "น้ำป่า", "ภัยแล้ง",
  "ไฟป่า", "หมอกควัน", "ฝุ่นละออง", "ฝุ่นพิษ", "pm2.5", "pm 2.5", "คลื่นความร้อน", "อากาศหนาว", "ลมหนาว", "ความกดอากาศสูง",
  "กรมอุตุ", "อุตุนิยมวิทยา", "พยากรณ์อากาศ", "ภัยพิบัติ", "สาธารณภัย", "ปภ.", "สึนามิ", "ภูเขาไฟ", "ลูกเห็บ", "วาตภัย",
  "flood", "landslide", "earthquake", "typhoon", "cyclone", "tropical storm", "heavy rain", "drought", "wildfire", "forest fire",
  "haze", "heatwave", "heat wave", "tsunami", "volcan", "weather", "monsoon",
];

export function isDisaster(text: string): boolean {
  const t = text.toLowerCase();
  return DISASTER_WORDS.some((w) => t.includes(w));
}

// The owner lives in the North, so these stories are ranked first in the disaster section.
const NORTH_TH = ["ภาคเหนือ", "เชียงใหม่", "เชียงราย", "ลำปาง", "ลำพูน", "แม่ฮ่องสอน", "พะเยา", "อุตรดิตถ์", "สุโขทัย", "พิษณุโลก", "เพชรบูรณ์", "แม่สอด"];
// Short names that are also parts of common words. Headlines write them bare ("พายุถล่มแพร่"),
// so they match unless they are part of เผยแพร่ / แพร่ระบาด, ตากแดด / ตากใบ (a southern district) / ตากสิน, น่านฟ้า / น่านน้ำ.
const NORTH_TH_AMBIGUOUS = [
  /(?<!เผย)แพร่(?!ระบาด|กระจาย|เชื้อ|ภาพ|หลาย|ข่าว|พันธุ์|ขยาย)/,
  /(?<!ผึ่ง)ตาก(?!แดด|ผ้า|ลม|ฝน|อากาศ|ข้าว|ใบ|สิน)/,
  /น่าน(?!ฟ้า|น้ำ)/,
];
const NORTH_EN = /\b(northern thailand|chiang mai|chiang rai|lampang|lamphun|mae hong son|nan province|phayao|phrae|uttaradit|tak province|sukhothai|phitsanulok|phetchabun)\b/i;

// TMD quake titles carry "(lat,lon)". Quakes in this box (northern Thailand plus the nearby
// Myanmar, Laos and Yunnan border areas) are often felt in Chiang Rai and Chiang Mai.
const NORTH_BOX = { minLat: 16, maxLat: 23, minLon: 96.5, maxLon: 102.5 };

function nearNorth(text: string): boolean {
  const m = text.match(/\((-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\)/);
  if (!m) return false;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  return lat >= NORTH_BOX.minLat && lat <= NORTH_BOX.maxLat && lon >= NORTH_BOX.minLon && lon <= NORTH_BOX.maxLon;
}

export function isNorth(text: string): boolean {
  return NORTH_TH.some((w) => text.includes(w)) || NORTH_TH_AMBIGUOUS.some((re) => re.test(text)) || NORTH_EN.test(text) || nearNorth(text);
}

// "ขนาด 2.6" (TMD) or "M 4.7" / "Magnitude 6M" (USGS, GDACS).
export function magnitude(text: string): number | null {
  const m = text.match(/(?:ขนาด|magnitude|\bM)\s*([0-9]+(?:\.[0-9]+)?)/i);
  return m ? Number(m[1]) : null;
}

// Which section an item goes to, or null to skip it entirely.
export function admit(source: Pick<Source, "category" | "filter" | "minMagnitude">, title: string, snippet: string): Category | null {
  const text = `${title} ${snippet}`;
  if (source.filter === "disaster" && !isDisaster(text)) return null;
  if (source.minMagnitude !== undefined) {
    const mag = magnitude(text);
    if (mag !== null && mag < source.minMagnitude) return null;
  }
  return classify(source.category, title, snippet);
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

// Round-robin across sources so one busy feed cannot fill the shortlist, and drop near-duplicate
// headlines that clustering missed. Stories carried by more sources go first, then newest first.
export function pickCandidates(articles: Article[], opts: PickOptions = DEFAULT_PICK): Article[] {
  const bySource = new Map<string, Article[]>();
  const ranked = [...articles].sort(
    (p, q) => (q.priority ?? 0) - (p.priority ?? 0) || (q.coverage ?? 1) - (p.coverage ?? 1) || q.published_at - p.published_at,
  );
  for (const a of ranked) {
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
