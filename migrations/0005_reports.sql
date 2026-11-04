-- Reader reports of a wrong story (fact, translation, link). Shown on /adms; no IP or identity kept.
-- Pruned after 90 days.
CREATE TABLE reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  story_id TEXT NOT NULL,        -- article id (SHA-256 of the URL)
  reason TEXT NOT NULL,          -- fact | translation | link | other
  note TEXT NOT NULL DEFAULT '',
  lang TEXT NOT NULL DEFAULT 'th',
  created_at INTEGER NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX reports_open ON reports (resolved, created_at);
