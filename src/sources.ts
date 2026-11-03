export type Category = "it" | "cyber" | "finance" | "disaster";
export type Region = "th" | "global";

export const CATEGORIES: Category[] = ["cyber", "it", "finance", "disaster"];

export interface Source {
  id: string;
  name: string;
  url: string;
  category: Category;
  region: Region;
  lang: "th" | "en";
  // General news feeds: keep only items that match the disaster keywords (see admit() in select.ts).
  filter?: "disaster";
  // Earthquake feeds: drop quakes below this magnitude (TMD lists every M2 tremor in the region).
  minMagnitude?: number;
}

// Every URL was checked to return a non-empty feed on 2026-11-03.
// Left out on purpose: CISA all.xml (5.7 MB, too heavy for 10 ms CPU), NCSA (empty feed),
// Yahoo Finance and Bank of Thailand (404), BleepingComputer (403 to requests from Workers; not worked around).
// Add CISA KEV as a JSON source in phase 2 instead.
export const SOURCES: Source[] = [
  { id: "thn", name: "The Hacker News", url: "https://feeds.feedburner.com/TheHackersNews", category: "cyber", region: "global", lang: "en" },
  { id: "krebs", name: "Krebs on Security", url: "https://krebsonsecurity.com/feed/", category: "cyber", region: "global", lang: "en" },
  { id: "securityweek", name: "SecurityWeek", url: "https://www.securityweek.com/feed/", category: "cyber", region: "global", lang: "en" },
  { id: "thaicert", name: "ThaiCERT", url: "https://www.thaicert.or.th/feed/", category: "cyber", region: "th", lang: "th" },
  { id: "register", name: "The Register", url: "https://www.theregister.com/headlines.atom", category: "it", region: "global", lang: "en" },
  { id: "ars", name: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index", category: "it", region: "global", lang: "en" },
  { id: "blognone", name: "Blognone", url: "https://www.blognone.com/atom.xml", category: "it", region: "th", lang: "th" },
  { id: "techsauce", name: "Techsauce", url: "https://techsauce.co/feed", category: "it", region: "th", lang: "th" },
  { id: "cnbc", name: "CNBC Finance", url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664", category: "finance", region: "global", lang: "en" },
  { id: "marketwatch", name: "MarketWatch", url: "https://feeds.content.dowjones.io/public/rss/mw_topstories", category: "finance", region: "global", lang: "en" },
  { id: "bangkokpost", name: "Bangkok Post Business", url: "https://www.bangkokpost.com/rss/data/business.xml", category: "finance", region: "th", lang: "en" },
  { id: "prachachat", name: "ประชาชาติธุรกิจ", url: "https://www.prachachat.net/feed", category: "finance", region: "th", lang: "th" },
  { id: "kaohoon", name: "ข่าวหุ้น", url: "https://www.kaohoon.com/feed", category: "finance", region: "th", lang: "th" },
  // Weather and disasters, added 2026-11-03. Thai general and regional feeds are keyword-filtered.
  // Left out: TMD weather warnings (no working feed), ปภ. (no RSS), Air4Thai PM2.5 (TLS chain fails validation).
  { id: "gdacs", name: "GDACS", url: "https://www.gdacs.org/xml/rss.xml", category: "disaster", region: "global", lang: "en" },
  { id: "usgs", name: "USGS Earthquakes", url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.atom", category: "disaster", region: "global", lang: "en" },
  { id: "tmdquake", name: "กรมอุตุนิยมวิทยา (แผ่นดินไหว)", url: "https://earthquake.tmd.go.th/feed/rss_inside.xml", category: "disaster", region: "th", lang: "th", minMagnitude: 3 },
  { id: "chiangmainews", name: "Chiang Mai News", url: "https://www.chiangmainews.co.th/feed/", category: "disaster", region: "th", lang: "th", filter: "disaster" },
  { id: "khaosod-region", name: "ข่าวสด ทุกทิศทั่วไทย", url: "https://www.khaosod.co.th/around-thailand/feed", category: "disaster", region: "th", lang: "th", filter: "disaster" },
  { id: "matichon-region", name: "มติชน ภูมิภาค", url: "https://www.matichon.co.th/region/feed", category: "disaster", region: "th", lang: "th", filter: "disaster" },
  { id: "thairath", name: "ไทยรัฐ", url: "https://www.thairath.co.th/rss/news", category: "disaster", region: "th", lang: "th", filter: "disaster" },
  { id: "bangkokpost-th", name: "Bangkok Post Thailand", url: "https://www.bangkokpost.com/rss/data/thailand.xml", category: "disaster", region: "th", lang: "en", filter: "disaster" },
];

export function sourceById(id: string): Source | undefined {
  return SOURCES.find((s) => s.id === id);
}
