import { test } from "node:test";
import assert from "node:assert/strict";
import { isThai, mergeAnswer } from "../src/ask";
import type { Brief, BriefItem } from "../src/brief";
import { validClick } from "../src/clicks";
import type { SearchHit } from "../src/search";
import { renderWeeklyHtml, weeklyTop } from "../src/weekly";

const hit = (n: number): SearchHit => ({ url: `https://example.com/${n}`, title: `t${n}`, snippet: "s", sourceName: "X", category: "cyber", region: "global", published: n, score: 0.8 });

test("mergeAnswer keeps only cited items that exist, once each, in order", () => {
  const out = mergeAnswer([hit(1), hit(2), hit(3)], { answer: "a [3] [1]", cited: [3, 1, 3, 9, 0] });
  assert.deepEqual(out.sources.map((s) => s.n), [1, 3]);
  assert.equal(out.sources[1].url, "https://example.com/3");
});

test("mergeAnswer strips a repeated citation list from the end of the answer", () => {
  assert.equal(mergeAnswer([hit(1)], { answer: "Patched already [1]. (cited: [1], [2])", cited: [1] }).answer, "Patched already [1].");
  assert.equal(mergeAnswer([hit(1)], { answer: "Patched already [1].", cited: [1] }).answer, "Patched already [1].");
});

test("mergeAnswer rejects malformed model output", () => {
  assert.throws(() => mergeAnswer([hit(1)], { answer: "" , cited: [] }));
  assert.throws(() => mergeAnswer([hit(1)], { text: "x" }));
});

test("isThai detects Thai script", () => {
  assert.equal(isThai("แฮกเกอร์ Binance"), true);
  assert.equal(isThai("Who hacked Binance?"), false);
});

test("validClick accepts http links and normalizes unknown fields", () => {
  assert.deepEqual(validClick({ url: "https://a.com/x", category: "cyber", kind: "ticker" }), { url: "https://a.com/x", category: "cyber", kind: "ticker" });
  assert.deepEqual(validClick({ url: "https://a.com/x", category: "evil", kind: 5 }), { url: "https://a.com/x", category: "other", kind: "brief" });
  assert.equal(validClick({ url: "javascript:alert(1)" }), null);
  assert.equal(validClick({ url: `https://a.com/${"x".repeat(600)}` }), null);
});

function item(url: string, coverage: number, title = url): BriefItem {
  return {
    url, source: "s", sourceName: "S", region: "global", published: 0, coverage, alsoReported: [], sourceText: "", cves: [], north: false,
    title: { th: title, en: title }, summary: { th: "sum", en: "sum" }, why: null, severity: null,
  };
}
function brief(date: string, cyber: BriefItem[]): Brief {
  return { date, generatedAt: 0, model: null, neurons: 0, notes: [], sections: { cyber, it: [], finance: [], disaster: [] } };
}

test("weeklyTop dedupes links across days and ranks by coverage", () => {
  const top = weeklyTop([brief("2026-11-02", [item("a", 1), item("b", 3)]), brief("2026-11-03", [item("a", 1), item("c", 1)])]);
  assert.deepEqual(top.cyber.map((i) => i.url), ["b", "a", "c"]);
  assert.equal(top.cyber.find((i) => i.url === "a")!.day, "2026-11-03");
});

test("weekly HTML escapes story text", () => {
  const html = renderWeeklyHtml([brief("2026-11-03", [item("https://e.com/?a=1&b=2", 1, "<script>x</script>")])], 0);
  assert.ok(html.includes("&lt;script&gt;x&lt;/script&gt;"));
  assert.ok(html.includes("https://e.com/?a=1&amp;b=2"));
  assert.ok(!html.includes("<script>x"));
});

test("salvageJson closes a reply that ran into whitespace, never one cut mid-value", async () => {
  const { salvageJson } = await import("../src/ai");
  assert.deepEqual(salvageJson('{\n "answer": "ok [1]"\n\n\n   \n'), { answer: "ok [1]" });
  assert.deepEqual(salvageJson('{"items": [{"i": 0}\n\n\n'), { items: [{ i: 0 }] });
  assert.equal(salvageJson('{"answer": "cut in the mid'), undefined);
  assert.equal(salvageJson('{"answer": "ends with an escaped quote \\"'), undefined);
  assert.equal(salvageJson(42), undefined);
});

test("mergeAnswer falls back to inline citations when cited is missing", () => {
  const out = mergeAnswer([hit(1), hit(2), hit(3)], { answer: "First [1], then [2, 3] and [9]." });
  assert.deepEqual(out.sources.map((s) => s.n), [1, 2, 3]);
});
