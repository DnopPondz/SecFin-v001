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
- The API token in `.env` has no Vectorize or AI Gateway permission, and R2 is not enabled yet.
- The old livelife project was retired on 2026-11-03. Its D1 database `livelife-db` may still exist and can be deleted.

## How it works

- Cron `*/30 * * * *`: `src/ingest.ts` fetches the 3 feeds that waited longest (CPU budget), stores headline + snippet + link in D1. Full article text is never stored.
- Cron `30 22 * * *` (05:30 Thai): `src/brief.ts` shortlists up to 18 stories per section (round-robin by source, near-duplicates dropped), asks Gemma 4 26B for the top 5 in Thai and English, saves the brief to D1 and KV `brief:latest`, prunes articles older than 14 days.
- Every AI call is metered in D1 `ai_usage` and refused past `DAILY_NEURON_BUDGET` (3,000). A full brief costs about 155 Neurons. Without AI the brief falls back to raw headlines.
- The model's picks are mapped back to stored articles by index, so it can never invent a link. Prompts forbid facts not in the snippet; spot-check CVE ids and numbers when changing prompts or models.
- Sources live in `src/sources.ts`. Do not work around a publisher's block (BleepingComputer returns 403 to Workers, so it was removed).
- Admin: `POST /api/admin/run?task=ingest|brief` and `GET /api/admin/status`, header `x-admin-key` (secret `ADMIN_KEY`, local copy in `.dev.vars`).

## Tests

`npm test` bundles `test/*.test.ts` with esbuild and runs Node's built-in test runner. Do not switch to vitest or `@cloudflare/vitest-pool-workers`: Defender ASR blocks their fresh native binaries on this machine. `npm run typecheck` runs tsc.
