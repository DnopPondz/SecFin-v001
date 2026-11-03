import { test } from "node:test";
import assert from "node:assert/strict";
import { clean, parseFeed } from "../src/feed";

const RSS = `<?xml version="1.0"?><rss><channel><title>Feed</title>
<item>
  <title><![CDATA[Patch now: <b>CVE-2026-1234</b> exploited]]></title>
  <link>https://example.com/a</link>
  <description>&lt;p&gt;Attackers use the bug &amp;amp; more.&lt;/p&gt;</description>
  <pubDate>Mon, 02 Nov 2026 10:00:00 +0000</pubDate>
</item>
<item><title>No link</title></item>
<item><title>ข่าวไทย &#3585;</title><link>https://example.com/b</link></item>
</channel></rss>`;

const ATOM = `<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom</title>
<entry>
  <title type="html">Cloud outage</title>
  <link rel="self" href="https://example.com/self"/>
  <link rel="alternate" type="text/html" href="https://example.com/post?x=1&amp;y=2"/>
  <summary>Short summary</summary>
  <updated>2026-11-03T01:02:03Z</updated>
</entry>
</feed>`;

test("RSS items keep title, link, cleaned snippet and date", () => {
  const items = parseFeed(RSS);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "Patch now: CVE-2026-1234 exploited");
  assert.equal(items[0].link, "https://example.com/a");
  assert.equal(items[0].summary, "Attackers use the bug & more.");
  assert.equal(items[0].published, Date.parse("2026-11-02T10:00:00Z"));
});

test("items without a link are skipped and missing dates become 0", () => {
  const items = parseFeed(RSS);
  assert.equal(items[1].title, "ข่าวไทย ก");
  assert.equal(items[1].published, 0);
});

test("Atom entries use the alternate link, not self", () => {
  const [e] = parseFeed(ATOM);
  assert.equal(e.link, "https://example.com/post?x=1&y=2");
  assert.equal(e.summary, "Short summary");
  assert.equal(e.published, Date.parse("2026-11-03T01:02:03Z"));
});

test("limit caps the number of items", () => {
  assert.equal(parseFeed(RSS, 1).length, 1);
});

test("clean strips tags and collapses whitespace", () => {
  assert.equal(clean("  <p>a\n\n <i>b</i></p> "), "a b");
});
