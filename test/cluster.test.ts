import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseCluster } from "../src/cluster";
import { extractCves, parseNvd } from "../src/cve";
import { collapseClusters, pickCandidates, type Article } from "../src/select";

const H = 3_600_000;
let n = 0;
function art(source: string, cluster: string | null, published_at: number, category: Article["category"] = "cyber"): Article {
  n++;
  return { id: `a${n}`, url: `https://example.com/${n}`, source, category, region: "global", lang: "en", title: `story ${n}`, snippet: "", published_at, cluster_id: cluster };
}

test("chooseCluster joins the closest match above the threshold inside the window", () => {
  const now = 100 * H;
  const matches = [
    { id: "x", score: 0.8, metadata: { published: now - 2 * H, cluster: "c1" } },
    { id: "y", score: 0.9, metadata: { published: now - 1 * H } },
  ];
  assert.equal(chooseCluster(matches, "self", now), "y");
});

test("chooseCluster ignores itself, weak matches and old stories", () => {
  const now = 100 * H;
  assert.equal(chooseCluster([{ id: "self", score: 1, metadata: { published: now } }], "self", now), null);
  assert.equal(chooseCluster([{ id: "x", score: 0.6, metadata: { published: now } }], "self", now), null);
  assert.equal(chooseCluster([{ id: "x", score: 0.95, metadata: { published: now - 80 * H, cluster: "old" } }], "self", now), null);
});

test("collapseClusters keeps one row per story with source coverage", () => {
  const rows = [art("thn", "c1", 3), art("securityweek", "c1", 5), art("thn", "c1", 4), art("krebs", null, 1)];
  const out = collapseClusters(rows);
  assert.equal(out.length, 2);
  const story = out.find((a) => a.cluster_id === "c1")!;
  assert.equal(story.source, "securityweek"); // newest member represents the story
  assert.equal(story.coverage, 2);
  assert.deepEqual(story.alsoIn, ["thn"]);
});

test("a story goes to the section most of its articles were filed under", () => {
  const rows = [art("blognone", "c2", 9, "it"), art("thn", "c2", 2, "cyber"), art("securityweek", "c2", 1, "cyber")];
  assert.equal(collapseClusters(rows)[0].category, "cyber");
});

test("stories carried by more sources are shortlisted first", () => {
  const wide = { ...art("thn", "w", 1), coverage: 3, title: "Ivanti zero-day" };
  const fresh = { ...art("krebs", null, 9), coverage: 1, title: "Botnet takedown" };
  const picked = pickCandidates([fresh, wide], { limit: 1, perSource: 4, duplicateAt: 0.5 });
  assert.equal(picked[0].title, "Ivanti zero-day");
});

test("extractCves finds unique, upper-cased CVE ids", () => {
  assert.deepEqual(extractCves("Fix for cve-2026-1234 and CVE-2026-1234, plus CVE-2025-987654."), ["CVE-2026-1234", "CVE-2025-987654"]);
  assert.deepEqual(extractCves("no ids here"), []);
});

test("parseNvd reads CVSS and CISA KEV fields", () => {
  const json = {
    vulnerabilities: [
      { cve: { id: "CVE-2023-46805", cisaExploitAdd: "2024-01-10", cisaActionDue: "2024-01-22", metrics: { cvssMetricV31: [{ cvssData: { baseScore: 8.2, baseSeverity: "HIGH" } }] } } },
    ],
  };
  assert.deepEqual(parseNvd(json), { cvss: 8.2, severity: "HIGH", kevAdded: "2024-01-10", kevDue: "2024-01-22" });
  assert.equal(parseNvd({ vulnerabilities: [] }), null);
});
