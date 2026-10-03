# Administrator feedback — tested local release candidate

This records the original local candidate. The subsequently approved database application is recorded in [admin-feedback-db-applied-2026-10-03.md](admin-feedback-db-applied-2026-10-03.md); use that record for the current migration state.

## Outcome and release boundary

Implemented in a fresh standalone clone on `codex/admin-feedback`, based on verified main `89d7404c1c87dc0a6081fc1b69f80c996bb0201d`. The reference checkout was only read/copied; its files and Git state were not modified. No PR was opened or pushed. No deployment, merge, production submission changes, or remote DB writes were performed.

2026-10-03 read-only verification: GitHub main and the Vercel production alias both resolve to that PR21 merge, with Vercel `READY`. Production HTML is accessible. Church project is **ikvzbyueyqcjajcaqomb**. No game resources were modified.

## Blank dashboard: confirmed facts and limits

The DB is not empty: 14 retained resources, 8 current resources after excluding six retired parking rows. At verification, none of the eight had been confirmed in the preceding 10 minutes. The new `parking.dream` row remained `checking`, version 0, `updated_at = NULL`. The deployed physical `ops_list_operations(uuid)` function returns resources/history for the role; `guide_floor` exists.

The old frontend shows the dashboard title as soon as it accepts a session, before `/api/admin/operations` completes. Its operations fetch and response decoding had no deadline, and it rendered no loading/empty explanation. A hung response leaves only the header; a successful empty resource array produces no resource cards. Both paths are now explicit, and hung fetch **and body decoding** reach retry UI after 15 seconds. Local tests reproduce and verify these paths. This identifies concrete UI defects; the original administrator's exact session/network failure was not observed, so it must not be claimed as conclusively proven. No production admin session was accessed.

Stale or never-confirmed public data intentionally displays “확인 필요”; it is not evidence of missing DB rows. Operator workflow:

1. Open 현황판 to enter worship-space opening/occupancy status; parking accounts start directly on 주차.
2. In 주차, enter Songrim's estimated occupancy or Dream Center's currently directed basement floor / full status. Nothing counts cars or changes floors automatically.
3. Press 현황 확인/저장. The public app rechecks every 20 seconds while open and on foreground/reconnection.
4. Reconfirm and save even if unchanged. After 10 minutes, the public view asks for confirmation rather than presenting stale occupancy as live.

## Delivered behavior

- Mobile keyboard-accessible tabs: 현황판 / 주차 / 안내 / 기도카드 승인 / 사진 승인; separate 휴지통 / 변경 기록 / 계정 관리 for authorized roles. Existing draft/version conflict handling survives tab switches. 안내 explains operation and links to official public information; this does not introduce a new public-notice editor.
- History uses its own bounded scroll region and 10-row pages within the existing latest-100 server contract. No audit rows are removed.
- Kind-filtered moderation pages contain at most 20 items; filtering occurs **before** LIMIT. Prayer includes retained reflection submissions. Cursor binds both status and kind and preserves timestamp microseconds.
- Compact cards open actual content before selection. There is no select-all. Images must successfully load from the same origin before approval. Selection is cleared on close, refresh, filter, page or tab change. A single explicit confirmation covers only selected reviewed versions on the current page.
- Batch processing calls the existing single-item version-checked POST sequentially. A synchronous lock prevents duplicate clicks. Conflicts are reported by item; other chosen items continue. Authentication/network/ambiguous errors stop remaining requests; unattempted items are identified. All outcomes require refreshed data and new selection before retry. Navigation aborts further requests; a request already committed can only be resolved by rereading.
- Recoverable trash retains private content and image objects, hides them from public feeds/counts/photo reads, and permits superadmin preview only. Restore returns to **pending**, never approved. An old approval cannot bypass trash. Existing owner withdrawal and explicit permanent deletion remain irreversible and erase content. Previously erased rejected/deleted content cannot be recovered. The UI exposes permanent deletion separately with an explicit irreversibility confirmation.
- All transitions retain per-item actor audit rows, session/role revalidation, locks and expected versions. No new public grants, RLS policies, storage policies, or roles. Retained rehearsal code is unchanged.

## New migration requiring separate approval

File: `supabase/migrations/20261003115248_admin_tabs_recoverable_trash.sql`

SHA-256: `2fbc0ac633d85eccb5f93c17ced387db04e148a60ed4c2a5054faa71b8c524df`

It expands the live item status CHECK with `trashed` and replaces the existing `community_v2(text,jsonb)` function to support trash/restore and bounded kind filters. It does not rewrite existing content, delete objects, modify operations RPCs, or change effective execution grants. Existing records are preserved; transactional failure rollback is tested. Trash has no automatic expiration in this change. Existing hourly cleanup ignores trashed photos; owner/permanent deletions remain eligible for cleanup.

The prior `20261003062254_church_feedback_guidance_and_pages.sql` was manually applied and is **not in migration history**. Read [manual DB release record](manual-db-release-2026-10-03.md). Its source hash is unchanged (`e200d557f30d2bee52658831fb4598a2cc98d6807cbdc672f812f66fe8e2d0d9`). **Do not use an unreviewed bulk db push, reapply that migration, or infer missing physical schema from migration history.**

Release approvals needed, in order:

1. Approve applying **only this new migration** to church project **ikvzbyueyqcjajcaqomb**, after checking the physical prior schema and verifying the exact file hash. If using CLI migration management, explicitly reconcile the previous manual application first under separately approved history repair; do not silently repair it. A controlled one-file SQL editor application is also possible, with a new manual release record.
2. Approve publishing the branch as a draft PR if desired, then separately approve merging/deploying the tested commit to `teuksae-hyeonjangpan-v2.vercel.app`. The new frontend kind queries deliberately fail closed before the supporting DB migration, so apply the migration first. Old app callers remain supported during the interval.
3. Verify deployment commit/READY status and read-only public status/community endpoints, then have an authorized operator inspect tabs/role visibility. Do not approve, trash, delete or submit production content as a smoke test. Removing test content requires the operator to identify and select it explicitly.

Rollback: revert app/API to PR21 while retaining the additive DB migration. Existing old API contracts remain tested; trashed items stay private and can be restored after redeploying this UI. Do not roll the DB function back while trashed rows exist: the older admin listing is not designed for that status. Any future schema rollback must preserve those records and receive separate review/authorization.

## Verification and evidence

- `npm test -- --reporter=dot`: **344 passed, 47 files**. The suite emits four existing jsdom “navigation not implemented” warnings; zero test failures.
- `npm run test:server`: **81 passed**.
- `npm run build`, `npm run lint`, `git diff --check`: pass.
- `PGLITE_MODULE=… node tests/scripts/admin-feedback-db.mjs`: actual local migrated PostgreSQL checks pass for rollback/data preservation, all content kinds, trash/restore, privacy, repeated/stale requests, owner withdrawal, audit, privileges/RLS/search path, revoked/expired sessions and kind-bound pagination.
- `PGLITE_MODULE=… npm run test:community-sql`: **233 actual PostgreSQL/HTTP regression checks**, including the new live replacement RPC and unchanged rehearsal RPC.
- `PGLITE_MODULE=… node tests/scripts/feedback-db.mjs`: prior guidance/public-page SQL regression passes.
- `tests/scripts/admin-feedback-fixture.mjs` + `admin-feedback-browser.mjs`: separate headless Google Chrome process, fresh Playwright context, synthetic loopback data only, all external browser traffic blocked. Mobile 390×844, desktop 1440×1000, narrow 320×640. Verified tabs/keyboard, 10-row history, parking save/public read, selected two-item approval with double-click protection, pagination selection reset, photo loading, trash/restore to pending, public exclusion, and no horizontal overflow or browser exceptions.

Screenshots and machine-readable browser results: [evidence/admin-feedback-20261003](../evidence/admin-feedback-20261003/). These show synthetic content only.

Local tooling was reused as copied dependencies under `/tmp/church-qa`; no application dependencies or lockfile changed. PGlite is a local PostgreSQL WASM engine, not a full remote Supabase deployment; live advisors/production writes were deliberately not run for this unapproved candidate.
