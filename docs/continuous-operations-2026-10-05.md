# Continuous operational status and manual capacity

Local implementation verified on 2026-10-04 at 22:40 UTC (2026-10-05 07:40 KST). Based on released main `097413ad4716d0cba889acf0b5e4b72021bedf3f` (PR #29). Photo archive is included unchanged; the pending prayer dual-mode work is excluded. No production mutation, migration, push, PR, or deployment was performed for this change.

## Cause and observed production state

The public `/api/status` read at 2026-10-04 22:18:41 UTC returned the following saved operational metadata, even though its timestamps were already more than two hours old:

| Resource | Saved state | Estimate | Updated UTC |
| --- | --- | --- | --- |
| `space.songrim.access` | `hall_closed`, v17 | none | 19:43:05.147950 |
| `space.songrim.hall` | `full`, v17 | 100% | 19:43:01.957770 |
| `space.songrim.gym` | `full`, v21 | 100% | 19:43:00.913209 |
| `parking.songrim` | `busy`, v21 | 90% | 19:54:52.011104 |
| `parking.dream` | `full`, v18 | unknown; no guide floor | 19:43:29.920545 |

The new 4F resource was absent. The saved records were not expiring in this response. The administrator form independently forced an `unselected` value after ten minutes and also expired an unsaved selection. Public service-period logic stopped reads and hid values at 04:40, then replaced the worship-space rows with departure guidance at 05:50. These were separate from database persistence.

Live authenticated administrator comparison remains unverified: no authorized live admin session was available, and no authentication bypass was attempted. All save, role, conflict and moderation tests below use synthetic local fixtures.

## Behavior after this change

- Administrator saved selections and unsaved drafts do not expire. Polls preserve the original draft version for conflict checks. A genuinely missing confirmation or missing legacy percentage still needs an explicit selection; an old confirmation by itself does not.
- Public saved values and the confirmed entrance stage remain visible past ten minutes, across midnight, and during connection failure. The timestamp/date and neutral “마지막 기록” disclosure distinguish old values from a recent confirmation. Explicit operator changes remain authoritative.
- 04:40 and 05:50 do not gate reads, forms, public feeds, or operational rows. A nonblocking service phase banner remains. Foreground operational reads continue every 20 seconds; community feeds retain their existing 30-second interval. Hidden/offline request cancellation and moderation-related feed invalidation remain intact.
- `parking.dream` is one manually estimated lot: 0, 10, …, 100%. It shares the existing state mapping: 0–60 available, 70–90 busy, 100 full. There are no invented space counts or capacity denominators.
- `space.songrim.f4` / “본당 4층” is independent of “본당 1·2층”. It uses the same percentage mapping and the space-operator role. Its initial state is checking, version 0, timestamp null, percentage null.
- Old Dream floor records are never translated into percentages. The first estimate must come from an operator. Existing explicit closed/full records remain recognizable without inventing a percentage. Legacy current floor data, retired floor resources, history, and request receipts are retained; new saves record both the old floor and the new percentage in history.
- Existing per-resource authorization, optimistic versions, request-ID replay, entrance discrepancy acknowledgement and audit attribution are preserved.

## Data path / principal source files

`src/features/admin/AdminApp.tsx` → POST `/api/admin/operations` → `server/admin-auth.js` → `ops_set_resource_state` → `ops_resources` + history + receipt → `ops_public_resources` → GET `/api/status` → `RuntimeProvider` / `LiveOperations` → HOME and parking rows.

Time policy is in `serviceSchedule.ts`, `polling.ts`, `Community.tsx`, `statusPresentation.ts`, `CompanionApp.tsx` and `worship.tsx`. `public/sw.js` advances the shell cache generation; navigation remains network-first, API responses are not cached by the worker, and already-open pages are not forcibly reloaded.

## Verification

- Frontend: **641 passed**, 56 files; includes every percentage for both new controls, saved/public value parity, 10-minute exact boundaries, week-old records, prior-day/offline retention, draft retention through polls and both service boundaries, continuous 20-second polling, public submission/withdrawal during worship, late response cancellation, and unknown/legacy API data.
- Server: **98 passed**; includes new percentages, old floor callers and no retry that silently drops an estimate against an older RPC.
- New actual PostgreSQL migration tests: **180 checks passed** using in-memory PGlite with synthetic data. Checks rollback, exact preservation of every existing operational row/history/receipt, independent unknown 4F, all percentage steps, state validation, public/admin equality, role separation, revoked sessions, grants, optimistic conflicts and replay.
- Existing SQL suites: feedback migration, admin feedback, community (233 checks), moderation audit (30), prayer masking (36), photo archive (77) all passed.
- Lint, production TypeScript/Vite build, service-worker syntax and `git diff --check` passed.
- Browser: isolated Chrome, external traffic blocked, **320 / 390 / 1440px**, no horizontal overflow or JavaScript exceptions. Tested new 4F edit retention/save, both service boundaries, old timestamps/offline recovery, entrance warning cancel/confirm/double-click, and Dream admin-save → real local SQL → public polling within 20 seconds. Existing admin tabs, history, moderation, public pagination, timer, and photo archive passed. No production writes.

Evidence: `evidence/continuous-operations/browser-results.json`, `full-flow/browser-results.json`, `admin/browser-results.json`, and `archive/results.json`. Screenshots are synthetic; notably `home-390.png`, `home-after-390.png`, `admin-floor4-390.png`, `parking-offline-prior-day-390.png`, and `full-flow/mobile-parking.png`.

## Pending approval: DB-first release

1. Freshly verify main remains based on PR #29 or integrate any newer authorized changes, then rerun exact-head CI. This local branch adds only one migration: `20261004222445_continuous_operations_capacity.sql`. **Do not repeat the already released photo-archive migration.**
2. After explicit operational DB/release approval, the designated release writer checks whether this new migration is already applied, verifies the existing seven-argument RPC and Dream constraint, and applies this exact new migration once. It replaces the Dream floor-only constraint/RPC validation and inserts 4F; it does not backfill/reset any existing reading or audit row. Execute permissions remain service-role only, with session/account/category authorization inside the function and empty `search_path`.
3. Release the paired server/frontend, wait for production READY, and read back the public metadata and rendered HOME/parking. Do not submit a production test value. The first real Dream/4F percentage is a normal operator action.
4. Ask operators to reload already-open admin/public tabs once the release is ready. New navigation is network-first and the cache generation changes, but an already-running old JavaScript bundle stays old until reload. No evidence established that the reporting user's device had a stale cache. Do not force reloads that discard drafts.

Compatibility: the DB migration accepts the previous floor-shaped API during the DB-first interval. New code accepts old response records safely without fabricating a percentage. After percentages have been saved, an old frontend may show Dream as unconfirmed because its old validator only understands floor guidance; it must be refreshed. Prefer a forward fix over rolling the application back to floor-only code after real percentages exist. Never reapply the old constraint, delete 4F, or rewrite historical floor data as a rollback.

Supabase changelog and current function/security documentation were checked: https://supabase.com/changelog.md and https://supabase.com/docs/guides/database/functions. The reported PostgreSQL extension upgrade issues do not involve the plain integer/JSONB resource change here. No remote database advisors were run because remote DB activity is outside this implementation authorization; the local test checks grants, RLS preservation and RPC authorization explicitly.
