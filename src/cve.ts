// CVE facts come from NVD, never from the model: CVSS base score plus the CISA Known Exploited
// Vulnerabilities fields that NVD carries (cisaExploitAdd, cisaActionDue). The full KEV JSON is
// too large to parse inside the Workers Free 10 ms CPU budget, so it is looked up per CVE instead.

export interface CveInfo {
  id: string;
  cvss: number | null;
  severity: string | null;
  kevAdded: string | null;
  kevDue: string | null;
}

const CACHE_MS = 3 * 86_400_000;
// NVD allows 5 requests per rolling 30 seconds without an API key.
export const MAX_LOOKUPS = 5;

export function extractCves(text: string): string[] {
  return [...new Set((text.match(/CVE-\d{4}-\d{4,7}/gi) ?? []).map((c) => c.toUpperCase()))];
}

interface NvdMetric {
  cvssData?: { baseScore?: number; baseSeverity?: string };
}

export function parseNvd(json: unknown): Omit<CveInfo, "id"> | null {
  const cve = (json as { vulnerabilities?: { cve?: Record<string, unknown> }[] })?.vulnerabilities?.[0]?.cve;
  if (!cve) return null;
  const metrics = (cve.metrics ?? {}) as Record<string, NvdMetric[] | undefined>;
  const best = metrics.cvssMetricV40?.[0] ?? metrics.cvssMetricV31?.[0] ?? metrics.cvssMetricV30?.[0];
  return {
    cvss: best?.cvssData?.baseScore ?? null,
    severity: best?.cvssData?.baseSeverity ?? null,
    kevAdded: typeof cve.cisaExploitAdd === "string" ? cve.cisaExploitAdd : null,
    kevDue: typeof cve.cisaActionDue === "string" ? cve.cisaActionDue : null,
  };
}

interface CveRow {
  id: string;
  cvss: number | null;
  severity: string | null;
  kev_added: string | null;
  kev_due: string | null;
  found: number;
  checked_at: number;
}

// Cached rows first; up to MAX_LOOKUPS fresh NVD calls per run. Unknown or failed lookups are left out.
export async function lookupCves(env: Env, ids: string[], now = Date.now()): Promise<CveInfo[]> {
  const out: CveInfo[] = [];
  let lookups = 0;
  for (const id of ids) {
    const row = await env.DB.prepare("SELECT * FROM cves WHERE id = ?").bind(id).first<CveRow>();
    if (row && now - row.checked_at < CACHE_MS) {
      if (row.found) out.push({ id, cvss: row.cvss, severity: row.severity, kevAdded: row.kev_added, kevDue: row.kev_due });
      continue;
    }
    if (lookups >= MAX_LOOKUPS) continue;
    lookups++;
    try {
      const res = await fetch(`https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=${encodeURIComponent(id)}`, {
        headers: { "user-agent": "SecFinBrief/0.1 (personal news digest)" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) continue;
      const info = parseNvd(await res.json());
      await env.DB.prepare(
        "INSERT OR REPLACE INTO cves (id, cvss, severity, kev_added, kev_due, found, checked_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
        .bind(id, info?.cvss ?? null, info?.severity ?? null, info?.kevAdded ?? null, info?.kevDue ?? null, info ? 1 : 0, now)
        .run();
      if (info) out.push({ id, ...info });
    } catch (err) {
      console.error(`NVD ${id}:`, err);
    }
  }
  return out;
}
