// Minimal RSS 2.0 / Atom parser. Regex-based on purpose: a DOM parser would not fit the
// Workers Free 10 ms CPU budget for several feeds per invocation.

export interface FeedItem {
  title: string;
  link: string;
  summary: string;
  published: number; // epoch ms, 0 when the feed gives no usable date
}

const SNIPPET_CHARS = 300;

export function parseFeed(xml: string, limit = 20): FeedItem[] {
  const items: FeedItem[] = [];
  const blocks = xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/g);
  for (const [, kind, body] of blocks) {
    if (items.length >= limit) break;
    const title = clean(tag(body, "title"));
    const link = kind === "entry" ? atomLink(body) : clean(tag(body, "link")) || clean(tag(body, "guid"));
    if (!title || !/^https?:\/\//.test(link)) continue;
    const summary = truncate(clean(tag(body, "description") ?? tag(body, "summary") ?? tag(body, "content:encoded") ?? tag(body, "content")), SNIPPET_CHARS);
    const date = tag(body, "pubDate") ?? tag(body, "published") ?? tag(body, "updated") ?? tag(body, "dc:date");
    const published = date ? Date.parse(clean(date)) : NaN;
    items.push({ title, link, summary, published: Number.isFinite(published) ? published : 0 });
  }
  return items;
}

function tag(body: string, name: string): string | undefined {
  const m = body.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`));
  return m?.[1];
}

// Atom: prefer rel="alternate" (or no rel), the article page rather than self/edit links.
function atomLink(body: string): string {
  for (const m of body.matchAll(/<link\b([^>]*)\/?>/g)) {
    const attrs = m[1];
    const rel = attrs.match(/\brel=["']([^"']+)["']/)?.[1];
    const href = attrs.match(/\bhref=["']([^"']+)["']/)?.[1];
    if (href && (!rel || rel === "alternate")) return decodeEntities(href);
  }
  return "";
}

export function clean(raw: string | undefined): string {
  if (!raw) return "";
  let s = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  // Some feeds escape their HTML, so tags only become visible after one round of decoding.
  s = decodeEntities(s).replace(/<[^>]*>/g, " ");
  return decodeEntities(s).replace(/\s+/g, " ").trim();
}

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : whole;
    }
    return NAMED[code.toLowerCase()] ?? whole;
  });
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + "…";
}
