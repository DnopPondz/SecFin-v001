-- Headlines and short snippets only, with a link back to the publisher. Full article text is never stored.
CREATE TABLE articles (
  id TEXT PRIMARY KEY,           -- SHA-256 of the article URL
  url TEXT NOT NULL,
  source TEXT NOT NULL,          -- id from src/sources.ts
  category TEXT NOT NULL,        -- it | cyber | finance (after keyword reclassification)
  region TEXT NOT NULL,          -- th | global
  lang TEXT NOT NULL,            -- th | en
  title TEXT NOT NULL,
  snippet TEXT NOT NULL,
  published_at INTEGER NOT NULL, -- epoch ms (fetch time when the feed has no date)
  fetched_at INTEGER NOT NULL
);
CREATE INDEX articles_category_published ON articles (category, published_at);

-- One row per feed, so each ingest run picks the feeds that waited longest.
CREATE TABLE feed_state (
  source TEXT PRIMARY KEY,
  last_run INTEGER NOT NULL,
  last_status TEXT NOT NULL,     -- "ok" or a short error
  last_count INTEGER NOT NULL
);

-- One brief per Thai calendar date. body is the Brief JSON served to the page.
CREATE TABLE briefs (
  date TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  body TEXT NOT NULL
);

-- Neurons spent per UTC day (the Workers AI free allocation resets at 00:00 UTC).
CREATE TABLE ai_usage (
  day TEXT PRIMARY KEY,
  neurons REAL NOT NULL
);
