import { test } from "node:test";
import assert from "node:assert/strict";
import { deviceOf, groupStats, isBot, issueSession, readCookie, rankStories, refHost, validView, verifySession } from "../src/adms";
import type { Brief, BriefItem } from "../src/brief";

const PIN = "1234567890";
const NOW = Date.parse("2026-11-04T05:00:00Z");

test("a session verifies with the same PIN and before expiry only", async () => {
  const token = await issueSession(PIN, NOW);
  assert.equal(await verifySession(token, PIN, NOW + 1000), true);
  assert.equal(await verifySession(token, "0987654321", NOW), false); // PIN changed: everyone signed out
  assert.equal(await verifySession(token, PIN, NOW + 13 * 3600e3), false); // expired after 12 h
  const [exp, mac] = token.split(".");
  assert.equal(await verifySession(`${Number(exp) + 3600}.${mac}`, PIN, NOW), false); // extended expiry, old signature
  assert.equal(await verifySession(undefined, PIN, NOW), false);
  assert.equal(await verifySession("garbage", PIN, NOW), false);
  assert.equal(await verifySession(token, undefined, NOW), false);
});

test("readCookie picks the named cookie", () => {
  assert.equal(readCookie("a=1; adms=x.y=; b=2", "adms"), "x.y=");
  assert.equal(readCookie(undefined, "adms"), undefined);
});

test("validView accepts home and story views and normalises the rest", () => {
  const id = "a".repeat(64);
  assert.deepEqual(validView({ page: "story", id, edition: "2026-11-04", ref: "https://www.google.com/search?q=x", lang: "en", vid: "abc12345" }, "site.dev"),
    { page: "story", id, edition: "2026-11-04", ref: "google.com", lang: "en", vid: "abc12345" });
  assert.equal(validView({ page: "story" }, "site.dev"), null); // a story view needs an id
  assert.equal(validView({ page: "settings" }, "site.dev"), null);
  const v = validView({ page: "home", id: "bad", edition: "x", ref: 5, lang: "fr", vid: "NO!" }, "site.dev")!;
  assert.deepEqual([v.id, v.edition, v.ref, v.lang, v.vid], ["", "", "direct", "th", ""]);
});

test("refHost marks own-site navigation as internal", () => {
  assert.equal(refHost("https://site.dev/story?id=1", "site.dev"), "internal");
  assert.equal(refHost("", "site.dev"), "direct");
  assert.equal(refHost("not a url", "site.dev"), "direct");
  assert.equal(refHost("https://l.facebook.com/x", "site.dev"), "l.facebook.com");
});

test("bots and headless browsers are not counted; devices are classified", () => {
  assert.equal(isBot("Mozilla/5.0 (compatible; Googlebot/2.1)"), true);
  assert.equal(isBot("Mozilla/5.0 ... HeadlessChrome/140"), true);
  assert.equal(isBot(undefined), true);
  assert.equal(isBot("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Safari/604.1"), false);
  assert.equal(deviceOf("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Mobile Safari"), "mobile");
  assert.equal(deviceOf("Mozilla/5.0 (iPad; CPU OS 18_0)"), "tablet");
  assert.equal(deviceOf("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"), "desktop");
});

const item = (id: string): BriefItem => ({
  id, image: null, url: `https://e.com/${id}`, source: "thn", sourceName: "THN", region: "global", published: 1,
  title: { th: `t-${id}`, en: id }, summary: { th: "", en: "" }, why: null, severity: null, coverage: 1, alsoReported: [],
  sourceText: "", cves: [], north: false,
});

test("rankStories combines reads, clicks and front-page impressions per edition", () => {
  const brief = { date: "2026-11-04", generatedAt: 0, model: null, neurons: 0, notes: [], sections: { cyber: [item("a"), item("b")], it: [item("c")], finance: [], disaster: [] } } as Brief;
  const stats = rankStories([brief], new Map([["a", 6], ["c", 1]]), new Map([["a", 2], ["b", 1]]), new Map([["2026-11-04", 20]]));
  const a = stats.find((s) => s.id === "a")!;
  assert.deepEqual([a.position, a.reads, a.clicks, a.impressions, a.rate], [0, 6, 2, 20, 0.4]);
  assert.equal(stats.find((s) => s.id === "b")!.position, 1);
  const none = rankStories([brief], new Map(), new Map(), new Map());
  assert.equal(none[0].rate, 0); // no impressions: rate 0, not NaN
  const byCat = groupStats(stats, (s) => s.category);
  assert.deepEqual(byCat.find((g) => g.key === "cyber"), { key: "cyber", stories: 2, reads: 6, clicks: 3, impressions: 40, rate: 0.225 });
});
