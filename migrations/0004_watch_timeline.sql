-- Watchlist terms each article matched at ingest (comma-separated), NULL when none.
-- Re-tagged for the last 72 hours whenever the watchlist changes.
ALTER TABLE articles ADD COLUMN watch TEXT;
CREATE INDEX articles_watch ON articles (published_at) WHERE watch IS NOT NULL;

-- Story timeline on the story page: every article in one cluster.
CREATE INDEX articles_cluster ON articles (cluster_id);
