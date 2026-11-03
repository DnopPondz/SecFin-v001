-- Story clustering: articles about the same story (any language, any source) share a cluster_id,
-- assigned from Vectorize nearest neighbours when the article is embedded.
ALTER TABLE articles ADD COLUMN cluster_id TEXT;
ALTER TABLE articles ADD COLUMN embedded INTEGER NOT NULL DEFAULT 0;
CREATE INDEX articles_source_embedded ON articles (source, embedded);
CREATE INDEX articles_published ON articles (published_at);

-- NVD lookups cached for a few days: NVD allows 5 requests per 30 seconds without an API key.
CREATE TABLE cves (
  id TEXT PRIMARY KEY,           -- CVE-YYYY-NNNN
  cvss REAL,                     -- base score, newest CVSS version available
  severity TEXT,                 -- CRITICAL | HIGH | MEDIUM | LOW
  kev_added TEXT,                -- date CISA added it to the Known Exploited Vulnerabilities catalog
  kev_due TEXT,                  -- CISA remediation due date for US federal agencies
  found INTEGER NOT NULL,        -- 0 when NVD has no record yet (new CVEs appear with a delay)
  checked_at INTEGER NOT NULL
);
