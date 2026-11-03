import { test } from "node:test";
import assert from "node:assert/strict";
import { mergePicks } from "../src/brief";
import { classify, pickCandidates, similarity, type Article } from "../src/select";
import { thaiDate, utcDay } from "../src/time";

let n = 0;
function art(source: string, title: string, published_at: number): Article {
  n++;
  return { id: `id${n}`, url: `https://example.com/${n}`, source, category: "cyber", region: "global", lang: "en", title, snippet: "s", published_at };
}

test("security keywords move IT stories to cyber, other categories stay put", () => {
  assert.equal(classify("it", "Microsoft fixes zero-day in Exchange", ""), "cyber");
  assert.equal(classify("it", "ธนาคารพบช่องโหว่ในแอป", ""), "cyber");
  assert.equal(classify("it", "New laptop launch", ""), "it");
  assert.equal(classify("finance", "Bank hacked", ""), "finance");
});

test("near-duplicate headlines score high, unrelated ones low", () => {
  assert.ok(similarity("Chrome zero-day exploited in the wild", "Chrome zero-day exploited in attacks") > 0.5);
  assert.ok(similarity("Chrome zero-day exploited", "Bank of Thailand holds rate") < 0.2);
});

test("candidates round-robin across sources and drop duplicates", () => {
  const list = [
    art("a", "Chrome zero-day exploited in the wild", 100),
    art("a", "Ransomware hits hospital chain", 90),
    art("a", "Router botnet grows", 80),
    art("b", "Chrome zero-day exploited in attacks", 95),
    art("b", "Phishing kit targets banks", 70),
  ];
  const picked = pickCandidates(list, { limit: 4, perSource: 4, duplicateAt: 0.5 });
  assert.deepEqual(picked.map((p) => p.title), [
    "Chrome zero-day exploited in the wild",
    "Ransomware hits hospital chain",
    "Phishing kit targets banks",
    "Router botnet grows",
  ]);
});

test("perSource caps how many stories one feed contributes", () => {
  const list = [art("a", "one alpha", 3), art("a", "two bravo", 2), art("a", "three charlie", 1), art("b", "four delta", 0)];
  const picked = pickCandidates(list, { limit: 10, perSource: 2, duplicateAt: 0.9 });
  assert.equal(picked.filter((p) => p.source === "a").length, 2);
  assert.equal(picked.length, 3);
});

test("mergePicks drops unknown and repeated indexes so links are never invented", () => {
  const cands = [art("a", "x", 1), art("b", "y", 2)];
  const pick = (i: number) => ({ i, title_th: "t", summary_th: "s", why_th: "w", title_en: "t", summary_en: "s", why_en: "w", severity: "high" });
  const items = mergePicks(cands, { items: [pick(1), pick(7), pick(1), { ...pick(0), severity: "none" }] });
  assert.deepEqual(items.map((i) => i.url), [cands[1].url, cands[0].url]);
  assert.equal(items[0].severity, "high");
  assert.equal(items[1].severity, null);
});

test("mergePicks rejects output that does not match the schema", () => {
  assert.throws(() => mergePicks([], { items: [{ i: 0 }] }));
});

test("Thai date rolls over at Thai midnight; Neuron day is UTC", () => {
  const ms = Date.parse("2026-11-03T22:30:00Z"); // 05:30 on 4 Nov in Thailand
  assert.equal(thaiDate(ms), "2026-11-04");
  assert.equal(utcDay(ms), "2026-11-03");
});
