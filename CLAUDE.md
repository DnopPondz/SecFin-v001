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
- Source: GitHub `DnopPondz/SecFin-v001` (renamed from `llfout`; GitHub redirects the old URL), branch `main` (history reset on 2026-11-03 when livelife was retired).
- Worker `secfin-brief`, live at https://secfin-brief.webdev-80d.workers.dev. Deploys through Workers Builds on every push to `main` (connected 2026-11-04): build command `npm run check` (typecheck and tests; a failure stops the deploy), deploy command `npm run deploy` (D1 migrations, then `wrangler deploy`). Free plan: 3,000 build minutes a month, 1 build at a time. The build token needs D1 Edit on top of the permissions Cloudflare grants by default, or the migration step fails. `npm run deploy` from this machine still works; credentials come from the gitignored `.env`. Do not deploy by hand and push different code: the next build overwrites it.
- D1 `secfin-db` (`4ac76ae1-e986-41ad-9ed6-13220d43564e`, APAC). KV `secfin-cache` (`d56788bcfbd445e48290247e4284db18`).
- Vectorize `secfin-articles` (1024 dims, cosine). Queue `secfin-ingest`. Workflow `secfin-brief` (class `BriefWorkflow`). AI Gateway `secfin-brief` (logs, 30 requests/minute).
- Durable Object `LiveFeed` (SQLite, one instance "global"). Browser Run binding `BROWSER`. Analytics SQL binding `ANALYTICS_SQL`. Turnstile widget "secfin-brief ask" (site key in `public/app.js`, secret `TURNSTILE_SECRET`, local copy in `.dev.vars`).
- Analytics Engine enabled 2026-11-03 (dataset `secfin_clicks`, binding `CLICKS`).
- R2 is not enabled and the owner chose to skip it (it may ask for card details). Weekly PDFs stay in KV.
- Owner decision 2026-11-03: no Zero Trust Access login. Admin routes stay protected by `ADMIN_KEY` only.
- The old livelife project was retired on 2026-11-03 and all its Cloudflare resources are gone.

## How it works

- Cron `0 * * * *`: refreshes the side panels (below) and `enqueueFeeds` sends one queue message per feed, 30 s apart. The consumer (`handleIngest`, one feed per invocation for the 10 ms CPU budget) stores headline + snippet + link in D1, then `embedPending` embeds new articles with bge-m3, joins each to the nearest earlier story in Vectorize (score >= 0.75 within 72 h, `src/cluster.ts`) and upserts the vector. Full article text is never stored.
- Cron `30 22 * * *` (05:30 Thai) starts `BriefWorkflow` (`src/workflow.ts`): one step per section (`aiSection`, retried twice, falls back to `rawSection`), a CVE step, save, prune. Sections collapse clusters first, so a story counts all sources that carried it in the last 30 h; Gemma 4 26B picks the top 5 in Thai and English and sees the source count.
- After the brief is saved, the Workflow queues one `{ story }` message per brief item (20 a day). The queue consumer (`runStoryJob` in `src/story.ts`) fetches the publisher's page, converts it to text with `env.AI.toMarkdown` (`cssSelector: "article"`, then the whole page), and asks Gemma for a bilingual write-up (lede, key points, 2 to 4 paragraphs, why it matters). Only the write-up is stored (D1 `stories`), never the article text. About 60 Neurons a story. Stories must not run inside the Workflow: a Workflow instance gets only 50 external subrequests in total on Free (hit on 2026-11-03).
- Images: the feed's image (`articles.image`, from media:content, enclosure or the first `<img>`) or the page's og:image. Pages load them straight from the publisher with `referrerpolicy="no-referrer"` and credit the source; nothing is copied. `patchBriefImages` copies a story's og:image back onto the saved brief so the front page shows it.
- Pages: `public/index.html` + `app.js` (front page) and `public/story.html` + `story.js` (story page at `/story?id=<article id>`; static assets 307-redirect `.html` paths, so links use the short form), sharing `common.js` (language, theme, cards, ticker, click beacons, service worker registration) and `style.css` (light and dark tokens; `?theme=light|dark` forces a theme, used for screenshots). `public/settings.html` + `settings.js` is the owner's settings page (admin key kept in sessionStorage).
- Archive: `/?d=YYYY-MM-DD` opens an edition; story links from it carry `&d=` so `/api/story/:id?d=` falls back to that day's brief entry once the write-up is pruned (14 days).
- Story timeline: `GET /api/story/:id/timeline` lists every article in the story's cluster, oldest first (index `articles_cluster`).
- PWA: `manifest.webmanifest`, `icons/`, `sw.js` (cache `sf-v1`; network first with a 4 s timeout for pages and read-only APIs, stale-while-revalidate for scripts and styles; the front page asks it to precache the day's `/api/story/` responses). Bump the cache name when the shell changes shape.
- Side panels (`src/widgets.ts`, KV `widgets`, `GET /api/widgets`), refreshed by the hourly cron, no AI: PM2.5 for 13 northern provinces from Open-Meteo (CAMS model estimates, not stations; free for non-commercial use with attribution; Air4Thai fails TLS from Workers), colored by the Thai PCD 24 h bands; USD, EUR and JPY(100) in THB from Frankfurter (ECB); BTC from CoinGecko's keyless API; gold spot (USD/oz) from gold-api.com (no key, commercial use allowed; its history API needs a key, so the chart is our own one-point-per-Thai-day series, 10 days) with an estimated THB per baht-weight of 96.5% bar gold computed from spot and the ECB USD rate, labelled as not the Gold Traders Association price; Brent and WTI spot from the EIA API v2 (`petroleum/pri/spt`, series RBRTE and RWTC, about a week behind, fetched every 6 h) only when the free secret `EIA_API_KEY` is set (register at https://www.eia.gov/opendata/register.php); FRED's CSV of the same data answers HTTP 520 to Workers, so it is not used. Thai pump prices (Bangkok) in their own card from PTT OR's public SOAP service `CurrentOilPrice` (orapiweb.pttor.com, fetched every 3 h; change shown against the prices before the last effective date). Each source keeps its previous value when it fails. SET and the association's gold price are left out: no free source allows it.
- Watchlist (`src/settings.ts`, KV `settings`, edited on `/settings`): terms matched at ingest into `articles.watch` (Latin terms whole-word, Thai anywhere), re-tagged for 72 h on save. Watched stories get shortlist priority 3 and a prompt hint, a ★ chip, and appear in `GET /api/watch`. The terms are visible on the public pages.
- Health report (`src/health.ts`, `GET /api/admin/health`, shown on `/settings`): missing brief, unfinished write-ups, brief notes, feed errors, feeds not run in 3 h, unfiltered feeds quiet for 48 h, Neurons above 80% of budget. Nothing is pushed anywhere.
- Owner decision 2026-11-04: no Telegram. Do not add Telegram notifications.
- `GET /api/admin/screenshot?path=/...&w=1280&full=1&wait=ms` screenshots one of this site's pages through Browser Run (same-origin paths only). Free allows 1 Quick Action every 10 seconds.
- AI Gateway calls use `skipCache: true`: a cached reply made Workflow retries return the same broken JSON. `runJson` throws `TruncatedOutput` when a reply hits `max_tokens`.
- CVE data (CVSS, CISA KEV dates) comes from the NVD API for ids found in the publisher's own text, never from the model; cached in D1 `cves`, at most 5 NVD calls per run (NVD allows 5 per 30 s without a key). The full KEV JSON is too heavy to parse in 10 ms CPU.
- `GET /api/search?q=` embeds the query and searches Vectorize (14 days of articles), 10 per minute per IP.
- `POST /api/ask` (Turnstile token required, 3 per minute per IP): retrieves 8 stories from Vectorize and asks Gemma for a cited answer in the question's language (`src/ask.ts`). Only sources the model cited and that exist are returned. About 35 Neurons each. The UI is the floating chat in `public/chat.js` (front page and story page): each question is sent on its own (no conversation memory), the transcript and open state live in sessionStorage, Turnstile loads on first open with `appearance: "interaction-only"` and one single-use token per question. Motion (bubble float, clip-path drop opening, spring pops) is CSS in `style.css` under "Floating chat" and is disabled under `prefers-reduced-motion`; `--chat-fill` keeps white text at WCAG AA in both themes.
- Visitor-triggered AI (search, ask) cannot use the last `BRIEF_RESERVE` (2,500) Neurons of the daily budget, because the brief runs at 22:30 UTC near the end of the UTC day.
- Live ticker: after each feed, the queue consumer calls `LiveFeed.publish()` with articles published in the last 6 h; the page connects to `/ws` (hibernatable WebSocket) and gets the last 30.
- Cron `0 23 * * 6` (Sunday 06:00 Thai): `makeWeeklyPdf` renders the week's top 10 per section (`/weekly.html`) to PDF with `BROWSER.quickAction("pdf")` and stores it in KV (`pdf:<date>`, `pdf:latest`, 60-day TTL) until R2 is enabled. Served at `/weekly.pdf`. About 10 s of the 10 free browser-minutes a day.
- Clicks: `POST /api/click` writes to Analytics Engine; `/api/popular` reads the week's top links back through the Analytics SQL binding, keeps only URLs that exist in D1 (looked up by id = SHA-256 of the URL), and caches 30 minutes in KV.
- ADMS (`/adms`, `src/adms.ts`, `public/adms.html` + `adms.js`), added 2026-11-04: the owner's dashboard behind a 10-digit PIN in the secret `ADMS_PIN` (set by the owner; login is disabled until it exists). `POST /api/adms/login` checks the PIN (constant time, `LOGIN_LIMITER` 5 per minute per IP) and sets a 12 h HttpOnly, Secure, SameSite=Strict cookie `adms` signed with HMAC keyed by the PIN, so changing the PIN signs everyone out. `GET /api/adms/traffic|stories|quotas` need that cookie.
  - Visits: `public/common.js` `trackView` sends `POST /api/view` (front page with the edition shown, story page with its id) to Analytics Engine dataset `secfin_views` (binding `VIEWS`). Stored: page, story id, edition, Cloudflare country/region/city, referrer host, device, language, a random visitor id that changes every Thai day, and an owner flag when the `adms` cookie is valid (excluded by default on the dashboard). No IP. Bots and headless browsers are skipped; Do Not Track and Global Privacy Control stop the beacon.
  - Story interest: (story reads + publisher clicks) ÷ front-page views of that edition, up to 14 days of briefs; least-read only counts stories that were shown.
  - Quotas read Cloudflare's own datasets through the `ANALYTICS_SQL` binding (no token; binding queries must not contain `accountTag`): `logs.workersLogs` (requests, log events), `events.aiInference` (Neurons), `events.d1Queries`, `events.kvRequests`, `events.queuesMessages`, `events.workflows`, `events.vectorizeOperations` (`vectorQuery`), `states.d1Storage`, `states.kvStorage`, `states.vectorizeStorage`. All sampled; each query fails on its own and is listed on the page. `logs.workersLogs` returned 403 to the local `.env` token on 2026-11-04; check it works through the binding.
- Every AI call is metered in D1 `ai_usage` and refused past `DAILY_NEURON_BUDGET` (5,000). The brief costs about 200 Neurons, the 20 stories about 1,200, and a day of embeddings well under 100. `BRIEF_RESERVE` (2,500) keeps that much free of visitor traffic. Without AI the brief falls back to raw headlines.
- Pruning deletes vectors before rows: Vectorize Free stores 5M dimensions, about 4,800 bge-m3 vectors.
- The model's picks are mapped back to stored articles by index, so it can never invent a link. Prompts forbid facts not in the snippet; spot-check CVE ids and numbers when changing prompts or models.
- Fourth section `disaster` (weather and natural disasters, added 2026-11-03 at the owner's request): GDACS, USGS M4.5+, TMD earthquakes (M3+ only), plus Thai general and regional feeds kept only when `admit()` finds a disaster keyword. The owner lives in the North: stories mentioning a northern province get `priority` 2 (rest of Thailand 1) and a "ภาคเหนือ" chip. Ambiguous province names (แพร่, ตาก, น่าน) match bare, with lookarounds that exclude เผยแพร่, แพร่ระบาด, ตากแดด, ตากใบ, น่านฟ้า and similar. TMD quakes whose coordinates fall in a box around the North (lat 16 to 23, lon 96.5 to 102.5) also count as North news.
- Sources live in `src/sources.ts`. Do not work around a publisher's block (BleepingComputer returns 403 to Workers, so it was removed).
- Admin: `POST /api/admin/run?task=ingest|brief|weekly|widgets` (ingest queues every feed, brief starts the Workflow and returns its id, weekly renders the PDF now, widgets refreshes the side panels), `POST /api/admin/ask` (ask without Turnstile, for testing), `GET /api/admin/workflow/:id`, `GET /api/admin/status`, `GET|PUT /api/admin/settings`, `GET /api/admin/health`, header `x-admin-key` (secret `ADMIN_KEY`, local copy in `.dev.vars`).
- The Cloudflare observability MCP server is deprecated and fails to parse queue events in the events view; use the calculations view or `npx wrangler tail`.

## Tests

`npm test` bundles `test/*.test.ts` with esbuild and runs Node's built-in test runner. Do not switch to vitest or `@cloudflare/vitest-pool-workers`: Defender ASR blocks their fresh native binaries on this machine. `npm run typecheck` runs tsc.
