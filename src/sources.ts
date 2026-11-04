export type Category = "it" | "cyber" | "finance" | "disaster";
export type Region = "th" | "global";

export const CATEGORIES: Category[] = ["cyber", "it", "finance", "disaster"];

// official: government agencies, CERTs, vendors' own security advisories.
// mainstream: established news organisations with an editorial desk.
// specialist: trade and niche outlets, individual reporters, high-volume market news.
export type Tier = "official" | "mainstream" | "specialist";

export interface Source {
  id: string;
  name: string;
  url: string;
  category: Category;
  region: Region;
  lang: "th" | "en";
  tier: Tier;
  // Shown on story pages and /sources so readers can weigh the source themselves.
  note?: { th: string; en: string };
  // General news feeds: keep only items that match the disaster keywords (see admit() in select.ts).
  // "no-tips" drops stock recommendations and price-target pieces (see admit()).
  filter?: "disaster" | "no-tips";
  // Earthquake feeds: drop quakes below this magnitude (TMD lists every M2 tremor in the region).
  minMagnitude?: number;
  // Read at most this many bytes of the feed: some put whole documents in each item.
  maxBytes?: number;
}

// Preference when several sources carry the same story: the brief links to the strongest one.
export const TIER_RANK: Record<Tier, number> = { official: 3, mainstream: 2, specialist: 1 };

const NOTE_SPONSORED = { th: "มีบทความที่ผู้สนับสนุนจ่ายเงินลง (sponsored) ปนอยู่บ้าง ระบบกรองที่ระบุชัดออกแล้ว", en: "Publishes some sponsored articles; clearly labelled ones are filtered out." };
const NOTE_PR = { th: "มีเนื้อหาแนวประชาสัมพันธ์ของบริษัทปนอยู่บ้าง", en: "Carries some corporate PR-style content." };
const NOTE_TIPS = { th: "ข่าวหุ้นปริมาณมาก ระบบกรองบทแนะนำซื้อขายและราคาเป้าหมายออกแล้ว", en: "High-volume stock news; buy/sell tips and price targets are filtered out." };
const NOTE_TABLOID = { th: "สื่อหลักที่พาดหัวเร้าอารมณ์ได้ ระบบเก็บเฉพาะข่าวอากาศและภัยพิบัติ", en: "Mainstream outlet with sometimes sensational headlines; only weather and disaster stories are kept." };

// Every URL was checked to return a non-empty feed on 2026-11-03.
// Left out on purpose: CISA all.xml (5.7 MB; the advisories-only feed below is used instead), NCSA (empty feed),
// Yahoo Finance and Bank of Thailand (404), BleepingComputer (403 to requests from Workers; not worked around).
// Official sources added 2026-11-04: CISA advisories (whole advisories in each item, so read
// capped at 700 KB, about two items, enough for an hourly fetch) and Fortinet PSIRT. Checked and
// not usable on 2026-11-04: สกมช. (empty), ปภ. and ธปท. (404), SET (no feed), MSRC blog (no feed),
// TMD warning API demo key (returns 2022 sample data).
export const SOURCES: Source[] = [
  { id: "thn", name: "The Hacker News", url: "https://feeds.feedburner.com/TheHackersNews", category: "cyber", region: "global", lang: "en", tier: "specialist", note: NOTE_SPONSORED },
  { id: "krebs", name: "Krebs on Security", url: "https://krebsonsecurity.com/feed/", category: "cyber", region: "global", lang: "en", tier: "specialist" },
  { id: "securityweek", name: "SecurityWeek", url: "https://www.securityweek.com/feed/", category: "cyber", region: "global", lang: "en", tier: "specialist" },
  { id: "thaicert", name: "ThaiCERT", url: "https://www.thaicert.or.th/feed/", category: "cyber", region: "th", lang: "th", tier: "official" },
  { id: "cisa", name: "CISA Advisories", url: "https://www.cisa.gov/cybersecurity-advisories/cybersecurity-advisories.xml", category: "cyber", region: "global", lang: "en", tier: "official", maxBytes: 700_000 },
  { id: "fortinet-psirt", name: "Fortinet PSIRT", url: "https://filestore.fortinet.com/fortiguard/rss/ir.xml", category: "cyber", region: "global", lang: "en", tier: "official" },
  { id: "register", name: "The Register", url: "https://www.theregister.com/headlines.atom", category: "it", region: "global", lang: "en", tier: "mainstream" },
  { id: "ars", name: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index", category: "it", region: "global", lang: "en", tier: "mainstream" },
  { id: "blognone", name: "Blognone", url: "https://www.blognone.com/atom.xml", category: "it", region: "th", lang: "th", tier: "specialist" },
  { id: "techsauce", name: "Techsauce", url: "https://techsauce.co/feed", category: "it", region: "th", lang: "th", tier: "specialist", note: NOTE_PR },
  { id: "cnbc", name: "CNBC Finance", url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664", category: "finance", region: "global", lang: "en", tier: "mainstream" },
  { id: "marketwatch", name: "MarketWatch", url: "https://feeds.content.dowjones.io/public/rss/mw_topstories", category: "finance", region: "global", lang: "en", tier: "mainstream" },
  { id: "bangkokpost", name: "Bangkok Post Business", url: "https://www.bangkokpost.com/rss/data/business.xml", category: "finance", region: "th", lang: "en", tier: "mainstream" },
  { id: "prachachat", name: "ประชาชาติธุรกิจ", url: "https://www.prachachat.net/feed", category: "finance", region: "th", lang: "th", tier: "mainstream" },
  { id: "kaohoon", name: "ข่าวหุ้น", url: "https://www.kaohoon.com/feed", category: "finance", region: "th", lang: "th", tier: "specialist", note: NOTE_TIPS, filter: "no-tips" },
  // Weather and disasters, added 2026-11-03. Thai general and regional feeds are keyword-filtered.
  // Left out: TMD weather warnings (no working feed), ปภ. (no RSS), Air4Thai PM2.5 (TLS chain fails validation).
  { id: "gdacs", name: "GDACS", url: "https://www.gdacs.org/xml/rss.xml", category: "disaster", region: "global", lang: "en", tier: "official" },
  { id: "usgs", name: "USGS Earthquakes", url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.atom", category: "disaster", region: "global", lang: "en", tier: "official" },
  { id: "tmdquake", name: "กรมอุตุนิยมวิทยา (แผ่นดินไหว)", url: "https://earthquake.tmd.go.th/feed/rss_inside.xml", category: "disaster", region: "th", lang: "th", tier: "official", minMagnitude: 3 },
  { id: "chiangmainews", name: "Chiang Mai News", url: "https://www.chiangmainews.co.th/feed/", category: "disaster", region: "th", lang: "th", tier: "mainstream", filter: "disaster" },
  { id: "khaosod-region", name: "ข่าวสด ทุกทิศทั่วไทย", url: "https://www.khaosod.co.th/around-thailand/feed", category: "disaster", region: "th", lang: "th", tier: "mainstream", note: NOTE_TABLOID, filter: "disaster" },
  { id: "matichon-region", name: "มติชน ภูมิภาค", url: "https://www.matichon.co.th/region/feed", category: "disaster", region: "th", lang: "th", tier: "mainstream", filter: "disaster" },
  { id: "thairath", name: "ไทยรัฐ", url: "https://www.thairath.co.th/rss/news", category: "disaster", region: "th", lang: "th", tier: "mainstream", note: NOTE_TABLOID, filter: "disaster" },
  { id: "bangkokpost-th", name: "Bangkok Post Thailand", url: "https://www.bangkokpost.com/rss/data/thailand.xml", category: "disaster", region: "th", lang: "en", tier: "mainstream", filter: "disaster" },
];

export function sourceById(id: string): Source | undefined {
  return SOURCES.find((s) => s.id === id);
}
