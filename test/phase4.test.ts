import { test } from "node:test";
import assert from "node:assert/strict";
import { priorityOf } from "../src/brief";
import { collapseClusters, type Article } from "../src/select";
import { PROVINCES, normalizeSettings, watchMatcher } from "../src/settings";
import { goldBahtThb, mergeFuel, mergeGold, parseAir, parseEia, parseFx, parsePtt, pm25Level } from "../src/widgets";

test("watchMatcher matches Latin terms as whole words, any case", () => {
  const m = watchMatcher(["Fortinet", "SAP", "C++"]);
  assert.deepEqual(m("FORTINET patches FortiOS flaw"), ["Fortinet"]);
  assert.deepEqual(m("Sapphire Rapids launch"), []);
  assert.deepEqual(m("SAP's NetWeaver bug"), ["SAP"]);
  assert.deepEqual(m("New C++ compiler"), ["C++"]);
  assert.deepEqual(watchMatcher([])("anything"), []);
});

test("watchMatcher matches Thai terms inside Thai text", () => {
  const m = watchMatcher(["ธนาคารกรุงเทพ", "Microsoft"]);
  assert.deepEqual(m("ลูกค้าธนาคารกรุงเทพโดนฟิชชิ่ง"), ["ธนาคารกรุงเทพ"]);
  assert.deepEqual(m("ไมโครซอฟท์ออกแพตช์ Microsoft Exchange"), ["Microsoft"]);
});

test("normalizeSettings trims, splits commas and dedups ignoring case", () => {
  const s = normalizeSettings({ watch: [" Fortinet ", "fortinet", "VMware, Cisco", "x", "a".repeat(41)] });
  assert.deepEqual(s.watch, ["Fortinet", "VMware", "Cisco"]);
  assert.deepEqual(normalizeSettings("junk"), { watch: [] });
});

const article = (id: string, extra: Partial<Article> = {}): Article => ({
  id, url: `https://e.com/${id}`, source: "thn", category: "cyber", region: "global", lang: "en", title: id, snippet: "", published_at: 1, ...extra,
});

test("a story is watched when any article in its cluster matched", () => {
  const [story] = collapseClusters([
    article("a", { cluster_id: "c", published_at: 2 }),
    article("b", { cluster_id: "c", source: "krebs", watch: "Fortinet" }),
  ]);
  assert.equal(story.watch, "Fortinet");
  assert.equal(priorityOf("cyber", story), 3);
  assert.equal(priorityOf("cyber", article("z")), 0);
});

test("pm25Level follows the Thai 24 h bands", () => {
  assert.equal(pm25Level(15), 0);
  assert.equal(pm25Level(15.04), 0); // rounds to 15.0
  assert.equal(pm25Level(15.1), 1);
  assert.equal(pm25Level(37.5), 2);
  assert.equal(pm25Level(37.6), 3);
  assert.equal(pm25Level(75.1), 4);
});

test("parseAir maps Open-Meteo locations to provinces in order", () => {
  // Open-Meteo's hourly series ends at 08:00 when `current` is 09:00.
  const hours = Array.from({ length: 24 }, (_, h) => `2026-11-0${h < 15 ? 3 : 4}T${String((h + 9) % 24).padStart(2, "0")}:00`);
  const raw = PROVINCES.map((_, i) => ({
    current: { time: "2026-11-04T09:00", pm2_5: i === 0 ? 60.04 : 10 },
    hourly: { time: hours, pm2_5: Array.from({ length: 24 }, (_, h) => (i === 0 ? 30 + h : null)) },
  }));
  const air = parseAir(raw);
  assert.equal(air.readings[0].id, "chiangmai");
  assert.equal(air.readings[0].pm25, 60);
  assert.equal(air.readings[0].trend.length, 24);
  assert.equal(air.readings[0].trend.at(-1), 60); // the current hour closes the trend
  assert.equal(air.readings[0].trend[0], 31); // oldest hour dropped
  assert.equal(air.readings[0].avg24, 42.8); // (31 + ... + 53 + 60) / 24 = 42.75
  assert.equal(air.readings[1].avg24, null); // only the current value, too few hours for a mean
  assert.throws(() => parseAir(raw.slice(1)));
});

test("parseFx inverts THB-based rates and quotes yen per 100", () => {
  const fx = parseFx({ rates: { "2026-11-02": { USD: 0.0296, EUR: 0.0256, JPY: 4.5 }, "2026-11-03": { USD: 0.02962, EUR: 0.0256, JPY: 4.5 } } });
  const usd = fx.find((r) => r.code === "USD")!;
  assert.equal(usd.thb, 33.761);
  assert.equal(usd.date, "2026-11-03");
  assert.equal(usd.series.length, 2);
  assert.ok(usd.change! < 0);
  assert.equal(fx.find((r) => r.code === "JPY")!.thb, 22.222);
});

test("parseEia splits Brent and WTI, sorts oldest first and keeps 10 days", () => {
  const data = Array.from({ length: 12 }, (_, i) => [
    { period: `2026-10-${String(21 - i).padStart(2, "0")}`, series: "RBRTE", value: String(71 - i) },
    { period: `2026-10-${String(21 - i).padStart(2, "0")}`, series: "RWTC", value: i === 0 ? null : 60 - i },
  ]).flat();
  const [brent, wti] = parseEia({ response: { data } });
  assert.equal(brent.code, "BRENT");
  assert.equal(brent.series.length, 10);
  assert.equal(brent.usd, 71);
  assert.equal(brent.date, "2026-10-21");
  assert.equal(brent.change, 1);
  assert.equal(wti.date, "2026-10-20"); // the missing newest value is skipped
  assert.deepEqual(parseEia({ error: "x" }), []);
});

const PTT = `<CurrentOilPriceResult>&lt;PTTOR_DS&gt;
  &lt;FUEL&gt;&lt;PRICE_DATE&gt;2026-10-29T05:00&lt;/PRICE_DATE&gt;&lt;PRODUCT&gt;Diesel B20&lt;/PRODUCT&gt;&lt;PRICE&gt;33.50&lt;/PRICE&gt;&lt;/FUEL&gt;
  &lt;FUEL&gt;&lt;PRICE_DATE&gt;2026-10-29T05:00&lt;/PRICE_DATE&gt;&lt;PRODUCT&gt;Diesel&lt;/PRODUCT&gt;&lt;PRICE&gt;42.54&lt;/PRICE&gt;&lt;/FUEL&gt;
  &lt;FUEL&gt;&lt;PRICE_DATE&gt;2026-10-29T05:00&lt;/PRICE_DATE&gt;&lt;PRODUCT&gt;Gasohol 95&lt;/PRODUCT&gt;&lt;PRICE&gt;41.95&lt;/PRICE&gt;&lt;/FUEL&gt;
  &lt;FUEL&gt;&lt;PRICE_DATE&gt;2026-10-29T05:00&lt;/PRICE_DATE&gt;&lt;PRODUCT&gt;Super Power X99&lt;/PRODUCT&gt;&lt;/FUEL&gt;
&lt;/PTTOR_DS&gt;</CurrentOilPriceResult>`;

test("parsePtt reads the escaped PTT OR document in display order", () => {
  const fuel = parsePtt(PTT)!;
  assert.equal(fuel.effective, "2026-10-29T05:00");
  assert.deepEqual(fuel.prices.map((p) => [p.id, p.price]), [["g95", 41.95], ["diesel", 42.54], ["b20", 33.5]]);
  assert.equal(parsePtt("<x/>"), null);
});

test("mergeFuel measures changes only when the effective date moves", () => {
  const first = parsePtt(PTT)!;
  assert.equal(mergeFuel(null, first).prices[0].change, null);
  const raised = { effective: "2026-11-05T05:00", prices: first.prices.map((p) => ({ ...p, price: p.price + 0.3 })) };
  const after = mergeFuel(first, raised);
  assert.equal(after.prices[0].change, 0.3);
  const sameDay = mergeFuel(after, { ...raised, prices: raised.prices.map((p) => ({ ...p, change: null })) });
  assert.equal(sameDay.prices[0].change, 0.3); // kept, not reset to 0
});

test("mergeGold keeps one point per Thai day and caps the series at 10", () => {
  const day = (d: number) => Date.parse(`2026-11-${String(d).padStart(2, "0")}T05:00:00Z`);
  let g = mergeGold(null, 4000, 33.75, day(1), "x");
  assert.deepEqual(g.series, [4000]);
  assert.equal(g.change, null);
  g = mergeGold(g, 4010, 33.75, day(1) + 3_600_000, "x"); // same Thai day: replaced
  assert.deepEqual(g.series, [4010]);
  g = mergeGold(g, 4030, 33.75, day(2), "x");
  assert.deepEqual(g.series, [4010, 4030]);
  assert.equal(g.change, 20);
  for (let d = 3; d <= 14; d++) g = mergeGold(g, 4000 + d, 33.75, day(d), "x");
  assert.equal(g.series.length, 10);
  assert.equal(g.days.at(-1), "2026-11-14");
});

test("goldBahtThb estimates a 96.5% baht-weight from spot and USD/THB", () => {
  // 4,000 USD/oz at 33.75 THB/USD: 4000 * 33.75 * 15.244 / 31.1035 * 0.965 = 63,846
  assert.equal(goldBahtThb(4000, 33.75), 63850);
  assert.equal(goldBahtThb(4000, undefined), null);
});

test("balancePicks guarantees global and Thai stories without breaking the model's order", async () => {
  const { balancePicks } = await import("../src/brief");
  const it = (id: string, region: "th" | "global") => ({ id, region }) as never;
  const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
  // All-Thai top 5, globals ranked 6th and 7th: the two lowest Thai picks make room.
  assert.deepEqual(ids(balancePicks([it("t1", "th"), it("t2", "th"), it("t3", "th"), it("t4", "th"), it("t5", "th"), it("g1", "global"), it("g2", "global")], 5, 2, 1)),
    ["t1", "t2", "t3", "g1", "g2"]);
  // All-global top 5 with a Thai story 6th: one global gives way.
  assert.deepEqual(ids(balancePicks([it("g1", "global"), it("g2", "global"), it("g3", "global"), it("g4", "global"), it("g5", "global"), it("t1", "th")], 5, 2, 1)),
    ["g1", "g2", "g3", "g4", "t1"]);
  // Nothing to swap in: the picks stay as they are.
  assert.deepEqual(ids(balancePicks([it("t1", "th"), it("t2", "th")], 5, 2, 1)), ["t1", "t2"]);
  // No quota (weather section): plain top 5.
  assert.equal(balancePicks([it("a", "th"), it("b", "th"), it("c", "th"), it("d", "th"), it("e", "th"), it("f", "global")], 5).length, 5);
});

test("sponsored and stock-tip filters skip promotions but keep real news", async () => {
  const { admit, isSponsored, isStockTip } = await import("../src/select");
  assert.equal(isSponsored("State-sponsored hackers breach telecoms"), false);
  assert.equal(isSponsored("[Sponsored] Why zero trust matters"), true);
  assert.equal(isSponsored("Webinar: Stop ransomware before it starts"), true);
  assert.equal(isSponsored("Sponsored by Acme: cloud security guide"), true);
  assert.equal(isSponsored("ข่าวประชาสัมพันธ์ บริษัทเปิดตัวสินค้าใหม่"), true);
  assert.equal(isStockTip("โบรกฯ แนะซื้อ CPALL ราคาเป้า 75 บาท"), true);
  assert.equal(isStockTip("หุ้นเด่นวันนี้"), true);
  assert.equal(isStockTip("ดัชนี SET หลุด 1,500 จุด"), false);
  const tips = { category: "finance" as const, filter: "no-tips" as const };
  assert.equal(admit(tips, "แนะนำซื้อ PTT เป้าหมาย 40 บาท", ""), null);
  assert.equal(admit(tips, "ธปท. คงดอกเบี้ยนโยบาย", ""), "finance");
});

test("a cluster is represented by its most credible source", async () => {
  const { collapseClusters } = await import("../src/select");
  const a = (id: string, source: string, published: number) => ({ id, url: `https://e.com/${id}`, source, category: "cyber" as const, region: "global" as const, lang: "en" as const, title: id, snippet: "", published_at: published, cluster_id: "c" });
  const [story] = collapseClusters([a("thn", "thn", 3), a("cisa", "cisa", 1), a("sw", "securityweek", 2)]);
  assert.equal(story.source, "cisa"); // official beats newer specialist coverage
  assert.equal(story.coverage, 3);
});
