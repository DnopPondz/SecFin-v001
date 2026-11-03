-- Lead image URL from the feed (media:content, enclosure or the first <img>). The image itself is
-- not copied; pages load it from the publisher and credit them.
ALTER TABLE articles ADD COLUMN image TEXT;

-- Detailed AI write-ups for the stories in each day's brief. body is the StoryDetail JSON.
-- Only the summary is stored, never the publisher's article text.
CREATE TABLE stories (
  id TEXT PRIMARY KEY,           -- same id as articles (SHA-256 of the URL)
  created_at INTEGER NOT NULL,
  body TEXT NOT NULL
);
