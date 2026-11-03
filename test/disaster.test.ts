import { test } from "node:test";
import assert from "node:assert/strict";
import { renderRss } from "../src/rss";
import { admit, isNorth, magnitude, pickCandidates, type Article } from "../src/select";

const general = { category: "disaster" as const, filter: "disaster" as const };
const quakes = { category: "disaster" as const, minMagnitude: 3 };

test("keyword-filtered feeds keep only weather and disaster stories", () => {
  assert.equal(admit(general, "น้ำท่วมหนักที่เชียงราย", ""), "disaster");
  assert.equal(admit(general, "Heavy rain floods Chiang Mai old town", ""), "disaster");
  assert.equal(admit(general, "ค่าฝุ่น PM2.5 เกินมาตรฐาน 10 จังหวัด", ""), "disaster");
  assert.equal(admit(general, "ดาราสาวเปิดตัวแฟนใหม่", ""), null);
  assert.equal(admit(general, "Parliament debates budget", ""), null);
});

test("quakes below the source minimum are dropped", () => {
  assert.equal(admit(quakes, "แผ่นดินไหว ประเทศลาว ขนาด 2.6 วันที่ 3", ""), null);
  assert.equal(admit(quakes, "แผ่นดินไหว ประเทศเมียนมา ขนาด 4.1", ""), "disaster");
  assert.equal(admit(quakes, "Earthquake report", ""), "disaster"); // no magnitude found, keep
});

test("magnitude reads TMD, USGS and GDACS formats", () => {
  assert.equal(magnitude("แผ่นดินไหว ขนาด 2.6 วันที่"), 2.6);
  assert.equal(magnitude("M 4.7 - 86 km SE of Sola, Vanuatu"), 4.7);
  assert.equal(magnitude("Green earthquake (Magnitude 6M, Depth:10km) in MMI IV"), 6);
  assert.equal(magnitude("Flood in Myanmar"), null);
});

test("isNorth matches northern provinces without common-word false positives", () => {
  assert.equal(isNorth("ไฟป่าลุกลามดอยสุเทพ เชียงใหม่"), true);
  assert.equal(isNorth("Haze blankets Chiang Rai"), true);
  assert.equal(isNorth("น้ำป่าไหลหลาก จ.น่าน"), true);
  assert.equal(isNorth("พายุหมุนถล่มแพร่ 3 อำเภออ่วม"), true); // real headline, bare province name
  assert.equal(isNorth("กรมอุตุฯ เผยแพร่ประกาศพายุ"), false); // เผยแพร่ is not แพร่ province
  assert.equal(isNorth("โรคแพร่ระบาดหลังน้ำท่วม"), false);
  assert.equal(isNorth("ประชาชนตากแดดรอรับของ"), false);
  assert.equal(isNorth("น้ำท่วมอำเภอตากใบ นราธิวาส"), false);
  assert.equal(isNorth("เครื่องบินรุกล้ำน่านฟ้า"), false);
  assert.equal(isNorth("Bangkok floods after heavy rain"), false);
});

test("quakes near the North count as North news by coordinates", () => {
  assert.equal(isNorth("แผ่นดินไหว มณฑลยูนนาน, ประเทศจีน (22.662,100.540) ขนาด 3.4"), true);
  assert.equal(isNorth("แผ่นดินไหว ประเทศเมียนมา (23.471,94.631) ขนาด 4.3"), false);
  assert.equal(isNorth("แผ่นดินไหว ประเทศเวียดนาม (19.044,105.284) ขนาด 3.3"), false);
});

test("priority ranks Northern Thailand ahead of wider coverage", () => {
  const a = (source: string, title: string, priority: number, coverage: number): Article => ({
    id: title, url: `https://e.com/${title}`, source, category: "disaster", region: "th", lang: "th", title, snippet: "", published_at: 1, priority, coverage,
  });
  const picked = pickCandidates([a("gdacs", "Cyclone hits Bangladesh", 0, 3), a("chiangmainews", "น้ำท่วมแม่ริม", 2, 1)], { limit: 1, perSource: 4, duplicateAt: 0.5 });
  assert.equal(picked[0].title, "น้ำท่วมแม่ริม");
});

test("RSS rendering tolerates briefs saved before the disaster section existed", () => {
  const old = { date: "2026-11-03", generatedAt: 0, model: null, neurons: 0, notes: [], sections: { cyber: [], it: [], finance: [] } };
  assert.ok(renderRss(old as never, "https://x").includes("<channel>"));
});
