# Moderation volume and usability review — 2026-10-04

Base: fresh main `f1b9c5f98e55c2617ece495ac7074fc400939beb`, isolated checkout on Mac mini. No public worship-time, runtime polling, copy cleanup, game, or unrelated style work included.

## Findings

| Limit | Verified behavior |
| --- | --- |
| Admin prayer/photo tabs and trash | 20 rows per page, explicit next cursor. Prayer includes reflection. |
| Legacy combined admin list | 100 rows per page, with pending-first keyset cursor; not a total limit. |
| Public feed | 12 rows per page with cursor in current public-page RPC; older list fallback is 30. |
| Approval batch | Current page, explicitly selected/rendered item versions only. Sequential existing single-item POSTs; no separate 100-item batch RPC or cross-page auto-selection. |
| Daily photo quota | No 100/day admission check. `photoCountToday` is a counter, not a quota. SQL tests successfully submit and finish 107 photos in one day. |
| Total submissions | No application row-count/admission cap in the current RPC, table constraints or triggers. |
| Abuse limits | Per minute: IP+kind 60 photo or 120 prayer/reflection submissions; token 10; preflight IP 240. Unchanged. |
| Photo bytes | Private storage bucket and server limit 3 MiB per PNG. Project-wide subscription capacity/remaining storage was not audited; absence of a 100-item cap does not imply unlimited infrastructure. |

Read-only production verification used project `ikvzbyueyqcjajcaqomb`: inspected current `community_v2` function, table constraints/triggers and bucket settings. The stored cursor regex accepts a valid timestamp. No production moderation RPC, inserts, updates, DDL, grants or migration application occurred. The production admin URL in a separate browser required login; authenticated production UI behavior was not claimed. No existing sessions or credentials were imported.

Read `manual-db-release-2026-10-03.md`. The manually applied `20261003062254` church migration must not be reapplied. The deployed trash migration is recorded as `20261003183917`; this patch requires no database change.

## Change

Existing batch approval was hidden behind collapsed card details, and its action button stayed at the top of a long page. Checkboxes are now always visible with a reason when disabled, remain disabled until content is opened, and selected cards have a clear border/background. The approval control and selected count stay at the bottom of the viewport. Confirmation scrolls into view. Guidance explains the three steps, page continuation and selection reset; batches show progress.

Actual photo loading, privacy/consent confirmation, role checks, expected versions, double-click lock, partial failure reporting, recoverable trash and fresh review after restore remain intact. Existing submission retry/idempotency and server contracts are unchanged.

## Verification

- Full unit/UI suite: 47 files, 356 tests passed.
- Full server suite: 85 passed.
- Community PostgreSQL/HTTP suite: 233 checks passed.
- Admin PostgreSQL regression passed: trash/restore, privacy, version conflicts/replay, audit, role/session authorization, rollback and bounded cursors. Added 107 prayer + 107 photo real RPC submissions in one day, with all IDs reached by kind-scoped 20-row pages.
- Volume browser: fresh headless Chrome, all external traffic blocked, actual local PostgreSQL migrations and HTTP handler. Traversed 210 pending prayer/reflection items over 11 pages and 105 pending photos over 6 pages; approved only the explicitly selected final 10 and 5 respectively. Zero browser exceptions. No hidden-page writes; double-click lock and page-selection reset passed. Broken photo clears selection. Sticky control and no horizontal overflow checked at 320, 390 and 1440 pixels.
- Production build and ESLint passed; `git diff --check` clean.
- Existing broader admin browser script passed approval, public visibility, trash/restore, parking and history checks, then failed its **unrelated 320px dashboard** overflow assertion. Independently reproduced unchanged main and working branch with identical document width 333 at viewport 320. This pre-existing issue is not changed here. Evidence: `evidence/moderation-volume-20261004/dashboard-baseline.json` and corresponding screenshots.

Reproduce locally (install PGlite/Playwright outside the app and supply absolute module paths):

```sh
npm ci
npm test
npm run test:server
PGLITE_MODULE=/path/to/pglite/dist/index.js npm run test:community-sql
PGLITE_MODULE=/path/to/pglite/dist/index.js node tests/scripts/admin-feedback-db.mjs
PGLITE_MODULE=/path/to/pglite/dist/index.js PORT=4197 QA_ITEM_COUNT=107 node tests/scripts/admin-feedback-fixture.mjs
# Separate terminal, fresh fixture per run:
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs BASE_URL=http://127.0.0.1:4197 node tests/scripts/moderation-volume-browser.mjs
npm run build
npm run lint
```

## Rollout for approval

Cherry-pick this local commit into the parent integration checkout after reviewing the other workers' changes. Re-run combined build/unit/server checks and the isolated moderation volume browser test. Deploy the reviewed frontend bundle only after release approval. No migration, quota, grant or environment-variable change is needed. Read-only smoke check both admin tabs after deployment; perform real approvals only when separately requested by the operator. Rollback is the frontend commit revert; stored content/state remains compatible.
