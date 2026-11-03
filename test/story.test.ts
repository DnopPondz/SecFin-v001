import { test } from "node:test";
import assert from "node:assert/strict";
import type { BriefItem } from "../src/brief";
import { imageOf, parseFeed, safeImageUrl } from "../src/feed";
import { mergeStory, ogImage } from "../src/story";

test("imageOf finds media:content, thumbnails, enclosures and inline images", () => {
  assert.equal(imageOf(`<media:content url="https://a.com/1.jpg" medium="image" />`), "https://a.com/1.jpg");
  assert.equal(imageOf(`<media:thumbnail url="https://a.com/t.jpg"/>`), "https://a.com/t.jpg");
  assert.equal(imageOf(`<enclosure url="https://a.com/p.mp3" type="audio/mpeg"/><enclosure url="https://a.com/e.png" type="image/png"/>`), "https://a.com/e.png");
  assert.equal(imageOf(`<description>&lt;p&gt;&lt;img src="https://a.com/i.webp?w=1&amp;h=2"&gt;&lt;/p&gt;</description>`), "https://a.com/i.webp?w=1&h=2");
  assert.equal(imageOf(`<content:encoded><![CDATA[<p><img class="x" src="https://a.com/c.jpg"></p>]]></content:encoded>`), "https://a.com/c.jpg");
  assert.equal(imageOf(`<description>no image</description>`), null);
});

test("parseFeed carries the image through", () => {
  const xml = `<rss><channel><item><title>T</title><link>https://a.com/x</link><media:content url="https://a.com/m.jpg" type="image/jpeg"/></item></channel></rss>`;
  assert.equal(parseFeed(xml)[0].image, "https://a.com/m.jpg");
});

test("safeImageUrl rejects non-http, oversized and tracking-pixel URLs", () => {
  assert.equal(safeImageUrl("data:image/png;base64,AAA"), null);
  assert.equal(safeImageUrl("javascript:alert(1)"), null);
  assert.equal(safeImageUrl(`https://a.com/${"x".repeat(1100)}`), null);
  assert.equal(safeImageUrl("https://a.com/pixel.gif"), null);
  assert.equal(safeImageUrl("https://a.com/photo.jpg"), "https://a.com/photo.jpg");
});

test("ogImage reads og:image or twitter:image in either attribute order", () => {
  assert.equal(ogImage(`<meta property="og:image" content="https://a.com/og.jpg">`), "https://a.com/og.jpg");
  assert.equal(ogImage(`<meta content="https://a.com/tw.jpg" name="twitter:image">`), "https://a.com/tw.jpg");
  assert.equal(ogImage(`<meta property="og:title" content="x">`), null);
});

const item: BriefItem = {
  id: "a".repeat(64), image: null, url: "https://a.com/x", source: "thn", sourceName: "The Hacker News", region: "global", published: 1,
  title: { th: "t", en: "t" }, summary: { th: "s", en: "s" }, why: null, severity: "high", coverage: 2, alsoReported: ["SecurityWeek"],
  sourceText: "", cves: [], north: false,
};
const output = {
  title_th: "หัวข้อ", title_en: "Title", lede_th: "นำ", lede_en: "Lede", points_th: ["ก"], points_en: ["a"],
  body_th: ["ย่อหน้า"], body_en: ["Paragraph"], why_th: "เพราะ", why_en: "Because",
};

test("mergeStory keeps brief facts and prefers the feed image over og:image", () => {
  const s = mergeStory({ ...item, image: "https://a.com/feed.jpg" }, "cyber", "https://a.com/og.jpg", "article", output, 5);
  assert.equal(s.image, "https://a.com/feed.jpg");
  assert.equal(s.severity, "high");
  assert.deepEqual(s.body.th, ["ย่อหน้า"]);
  assert.equal(mergeStory(item, "cyber", "https://a.com/og.jpg", "snippet", output, 5).image, "https://a.com/og.jpg");
});

test("mergeStory rejects output missing required parts", () => {
  assert.throws(() => mergeStory(item, "cyber", null, "article", { ...output, body_th: [] }, 5));
  assert.throws(() => mergeStory(item, "cyber", null, "article", { title_th: "x" }, 5));
});
