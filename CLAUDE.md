# SecFin Brief

Personal daily briefing: IT, cybersecurity and finance news, Thai and global, summarized in Thai and English every morning at 05:30 Thai time. The owner is the only intended reader.

## Rule 1: Cloudflare Workers Free plan only

Everything must run on the Cloudflare **Workers Free plan**. Set by the owner, not negotiable without their explicit approval.

- Do not upgrade the account, add paid add-ons, or suggest a Paid upgrade as the fix. Find a design that fits the free quota.
- Do not use paid-only models. Paid-only Workers AI models include Kimi K2.6 / K2.7, GLM-5.2 / 5.3, GLM-5.3-Flash (error 5035) and DeepSeek V4 Pro. No third-party models billed through AI Gateway credits.
- No external paid services (LLM APIs, databases, hosting, auth providers with billing).
- If a feature cannot fit the free quota, say so and propose a smaller version. The owner decides.
- Before adding a Cloudflare product or model, check its free-plan limits in the Cloudflare docs.

### Free-plan budgets (reset 00:00 UTC = 07:00 Thai time)

| Product | Free quota |
|---|---|
| Workers AI | 10,000 Neurons / day |
| Workers | 100,000 requests / day, 10 ms CPU per invocation (cron and queue too), 50 external + 1,000 Cloudflare subrequests per invocation, 5 Cron Triggers per account |
| D1 | 5M rows read, 100,000 rows written / day, 5 GB (enforced since 2026-09-01) |
| KV | 100,000 reads, 1,000 writes / day, 1 GB |
| Queues | 10,000 operations / day, 24 h retention |
| Workflows | 3,000 steps / day, 1 GB-month storage |
| Vectorize | 30M queried, 5M stored dimensions / month |
| Browser Run | 10 browser-minutes / day, 3 concurrent |
| Durable Objects | SQLite backend only, 5 GB |
| R2 | 10 GB, 1M Class A, 10M Class B / month (must be enabled in the dashboard first) |

## Account and resources

- Cloudflare account: **webdev** (`80d3023818cd51d00d21cc21c581318a`), dedicated to this project. Never create or change anything in Pondwachi.th@gmail.com's Account, and do not use it as an AI fallback.
- Source: GitHub `DnopPondz/llfout`, branch `main` (history reset on 2026-11-03 when livelife was retired). No Workers Builds connection.
- Worker `secfin-brief`, live at https://secfin-brief.webdev-80d.workers.dev. Deploy with `npx wrangler deploy`; credentials come from the gitignored `.env`.
- D1 `secfin-db` (`4ac76ae1-e986-41ad-9ed6-13220d43564e`, APAC). KV `secfin-cache` (`d56788bcfbd445e48290247e4284db18`).
- Vectorize `secfin-articles` (1024 dims, cosine). Queue `secfin-ingest`. Workflow `secfin-brief` (class `BriefWorkflow`). AI Gateway `secfin-brief` (logs, 30 requests/minute).
- Durable Object `LiveFeed` (SQLite, one instance "global"). Browser Run binding `BROWSER`. Analytics SQL binding `ANALYTICS_SQL`. Turnstile widget "secfin-brief ask" (site key in `public/app.js`, secret `TURNSTILE_SECRET`, local copy in `.dev.vars`).
- Analytics Engine enabled 2026-11-03 (dataset `secfin_clicks`, binding `CLICKS`).
- R2 is not enabled and the owner chose to skip it (it may ask for card details). Weekly PDFs stay in KV.
- Owner decision 2026-11-03: no Zero Trust Access login. Admin routes stay protected by `ADMIN_KEY` only.
- The old livelife project was retired on 2026-11-03 and all its Cloudflare resources are gone.

## How it works

- Cron `0 * * * *`: `enqueueFeeds` sends one queue message per feed, 30 s apart. The consumer (`handleIngest`, one feed per invocation for the 10 ms CPU budget) stores headline + snippet + link in D1, then `embedPending` embeds new articles with bge-m3, joins each to the nearest earlier story in Vectorize (score >= 0.75 within 72 h, `src/cluster.ts`) and upserts the vector. Full article text is never stored.
- Cron `30 22 * * *` (05:30 Thai) starts `BriefWorkflow` (`src/workflow.ts`): one step per section (`aiSection`, retried twice, falls back to `rawSection`), a CVE step, save, prune. Sections collapse clusters first, so a story counts all sources that carried it in the last 30 h; Gemma 4 26B picks the top 5 in Thai and English and sees the source count.
- CVE data (CVSS, CISA KEV dates) comes from the NVD API for ids found in the publisher's own text, never from the model; cached in D1 `cves`, at most 5 NVD calls per run (NVD allows 5 per 30 s without a key). The full KEV JSON is too heavy to parse in 10 ms CPU.
- `GET /api/search?q=` embeds the query and searches Vectorize (14 days of articles), 10 per minute per IP.
- `POST /api/ask` (Turnstile token required, 3 per minute per IP): retrieves 8 stories from Vectorize and asks Gemma for a cited answer in the question's language (`src/ask.ts`). Only sources the model cited and that exist are returned. About 35 Neurons each.
- Visitor-triggered AI (search, ask) cannot use the last `BRIEF_RESERVE` (600) Neurons of the daily budget, because the brief runs at 22:30 UTC near the end of the UTC day.
- Live ticker: after each feed, the queue consumer calls `LiveFeed.publish()` with articles published in the last 6 h; the page connects to `/ws` (hibernatable WebSocket) and gets the last 30.
- Cron `0 23 * * 6` (Sunday 06:00 Thai): `makeWeeklyPdf` renders the week's top 10 per section (`/weekly.html`) to PDF with `BROWSER.quickAction("pdf")` and stores it in KV (`pdf:<date>`, `pdf:latest`, 60-day TTL) until R2 is enabled. Served at `/weekly.pdf`. About 10 s of the 10 free browser-minutes a day.
- Clicks: `POST /api/click` writes to Analytics Engine; `/api/popular` reads the week's top links back through the Analytics SQL binding, keeps only URLs that exist in D1 (looked up by id = SHA-256 of the URL), and caches 30 minutes in KV.
- Every AI call is metered in D1 `ai_usage` and refused past `DAILY_NEURON_BUDGET` (3,000). A full brief costs about 160 Neurons and a day of embeddings well under 100. Without AI the brief falls back to raw headlines.
- Pruning deletes vectors before rows: Vectorize Free stores 5M dimensions, about 4,800 bge-m3 vectors.
- The model's picks are mapped back to stored articles by index, so it can never invent a link. Prompts forbid facts not in the snippet; spot-check CVE ids and numbers when changing prompts or models.
- Fourth section `disaster` (weather and natural disasters, added 2026-11-03 at the owner's request): GDACS, USGS M4.5+, TMD earthquakes (M3+ only), plus Thai general and regional feeds kept only when `admit()` finds a disaster keyword. The owner lives in the North: stories mentioning a northern province get `priority` 2 (rest of Thailand 1) and a "ภาคเหนือ" chip. Ambiguous province names (แพร่, ตาก, น่าน) match bare, with lookarounds that exclude เผยแพร่, แพร่ระบาด, ตากแดด, ตากใบ, น่านฟ้า and similar. TMD quakes whose coordinates fall in a box around the North (lat 16 to 23, lon 96.5 to 102.5) also count as North news.
- Sources live in `src/sources.ts`. Do not work around a publisher's block (BleepingComputer returns 403 to Workers, so it was removed).
- Admin: `POST /api/admin/run?task=ingest|brief|weekly` (ingest queues every feed, brief starts the Workflow and returns its id, weekly renders the PDF now), `POST /api/admin/ask` (ask without Turnstile, for testing), `GET /api/admin/workflow/:id`, `GET /api/admin/status`, header `x-admin-key` (secret `ADMIN_KEY`, local copy in `.dev.vars`).
- The Cloudflare observability MCP server is deprecated and fails to parse queue events in the events view; use the calculations view or `npx wrangler tail`.

## Tests

`npm test` bundles `test/*.test.ts` with esbuild and runs Node's built-in test runner. Do not switch to vitest or `@cloudflare/vitest-pool-workers`: Defender ASR blocks their fresh native binaries on this machine. `npm run typecheck` runs tsc.
