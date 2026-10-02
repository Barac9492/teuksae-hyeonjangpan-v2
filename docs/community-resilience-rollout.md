# Community resilience: migration 011 rollout

## Scope and current state

This change adds bounded administrator pagination/status filtering and removes deleted tombstones before the SQL limit. The accompanying UI changes handle interrupted requests and stale list responses. The migration and regression tests are local deliverables; no remote SQL, deployment, production content, or storage mutation is part of this change.

`011_community_admin_pagination.sql` depends on migrations 002–010, including the retained rehearsal namespace from 009. It replaces only `community_v2(text,jsonb)` and `rehearsal_community_v2(text,jsonb)` and adds partial indexes for active administrator pages. Existing row data, deletion receipts/tombstones, versions, sessions, account settings and storage objects are untouched. Old migrations must not be edited or rerun.

The live and rehearsal RPCs retain their own account locks, transaction-time superadmin/session checks, moderation versions, terminal-state handling and service-role-only grants. The rehearsal RPC still takes its global shared reset lock before every other operation. The application continues to use the live namespace; maintaining the retained rehearsal function does not restore the retired rehearsal UI.

## Request recovery and freshness rules

- Each community/admin fetch, including JSON body decoding, has a 15-second deadline. Expiration aborts transport and releases the UI lock even if the transport never settles. Photo file reading is separately bounded before submission.
- Aborting a POST does **not** prove the server rejected or rolled back it. The UI shows an unconfirmed outcome. Public retries reuse the same request ID and deletion token; unresolved attempts survive in-memory panel switches and edits back to the same payload. The capability is written before transmission and is never replaced merely because of a timeout. Local storage still contains only ID/kind/token, not content or images.
- A page reload loses in-memory payload-to-attempt matching. Use the retained submission records to check/withdraw the earlier request before starting a new submission. Same-payload retry matching is not promised across a full browser reload or a newly selected photo.
- Background feed polling is single-flight. An explicit refresh, visibility change, mutation refresh, kind change or unmount invalidates older responses and aborts obsolete reads. Failed/timed-out reads clear public cards/counts with a freshness warning; returning from a hidden tab clears its snapshot until a fresh read completes.
- Administrator decisions retain their version check and require a fresh list after an uncertain result. Pagination replaces the current page rather than accumulating possibly outdated content; switching filters or refreshing starts at the first page.

## Required release order

1. Run the checks below against the candidate checkout. Apply migrations through 011 to a disposable database and verify permissions with the intended PostgreSQL/Supabase configuration. The local PGlite harness executes real PostgreSQL SQL but does not reproduce Supabase PostgREST, pg_safeupdate, production load or concurrent-session timing.
2. With explicit release authorization, apply **only the new 011 migration** to an environment already at 010. It is atomic. The non-concurrent partial-index builds can briefly block community writes; use an appropriate low-traffic release window. Any failure rolls back the entire migration.
3. Verify both function definitions and execute permissions, then deploy the matching API and frontend together. **Database first is required.** The new SQL supports old `adminList` callers without a filter/cursor and returns a maximum of 100 non-deleted items. Do not deploy only the new UI/API over 006/009: those older RPCs ignore pagination arguments and cannot expose older pages correctly.
4. With a valid superadmin session, inspect the first page and the approved filter. In an isolated/test dataset containing >100 approved rows and >100 newer deleted rows, follow every page, confirm no deleted row is shown and no active row is lost, and withdraw an older approved row. Use synthetic content for destructive smoke tests. Confirm a parking/space account still receives a denial.
5. Test request recovery in the UI: an indefinitely pending fetch/body must release controls after the deadline; a late response must not restore withdrawn items; refresh/filter/page navigation must not let stale results replace newer state.

If an application rollback is needed, the prior API/frontend can run against 011 and ignore its additive `nextCursor` field. Keep 011 in place; restoring 006 would reintroduce the tombstone cap defect. A database rollback must be separately reviewed and must never remove tombstones or content simply to undo this read-path change.

## API contract

- `GET /api/admin/community` remains valid and defaults to `status=all`
- Optional `status`: `all`, `pending`, `approved`, or `rejected`; deleted is intentionally not a review filter
- Optional `cursor`: pass the previous response's `nextCursor` unchanged using URL encoding and the same status filter
- Response retains `enabled`, `items`, `photoCountToday`, `today`; adds `nextCursor`, an opaque string or `null` when finished
- The RPC accepts a validated cursor object internally; only the server encodes/decodes it. Its timestamp preserves PostgreSQL microseconds and its UUID is the stable tiebreaker. Browsers must not interpret or rebuild the token
- Invalid/mismatched query cursors return 400 before the listing RPC. The existing valid, current superadmin session remains mandatory on every page. The response is private/no-store
- If the RPC has not received 011, new filtered/cursor requests return 503 instead of silently reusing an unfiltered first page; a legacy bare first-page request remains supported
- At most 100 items are selected into each page. An `EXISTS` lookahead establishes whether another page exists; the API does not download whole history or request increasingly large limits
- Ordering is pending first, then `created_at DESC, id DESC`. Filters/cursors are live keyset reads, not a fixed snapshot. New submissions or changed statuses can move around a page boundary. Refresh to reconcile; when appending pages, deduplicate by ID. Existing version checks still reject stale moderation decisions

## Local verification

Run the normal application checks:

```bash
npm run test:server
npm test
npm run lint
npm run build
node --check public/sw.js
node scripts/build-rehearsal-migration.mjs --check
git diff --check
```

The executable SQL regression uses a test-only PGlite package outside the application; it never connects to a deployed database or reads credentials:

```bash
npm install --prefix /tmp/church-community-sql --no-save @electric-sql/pglite@0.3.14
PGLITE_MODULE=/tmp/church-community-sql/node_modules/@electric-sql/pglite/dist/index.js npm run test:community-sql
```

The reusable harness is `tests/scripts/community-db.mjs`. It executes migrations 002–011 and validates both namespaces: migration atomicity/data preservation, >100 tombstone regression, >100 active rows, status filtering, bounded pages, tied/microsecond timestamps, a deleted cursor boundary, malformed cursors, cross-scope/non-admin/revoked/expired/stale-credential denial, RPC privileges, public visibility, owner tokens, replay safety, moderation versions, rejected/deleted terminal states and photo cleanup/counts. It also routes actual HTTP-handler pagination into the migrated local SQL rather than substituting a listing mock.

## Candidate verification (2026-10-01 UTC)

- Frontend: 287 tests across 42 files passed, including 16 new deadline/order/navigation regressions and six canonical retry-identity regressions
- Server: 76 tests passed, including API cursor validation, role checks and pre-011 fail-closed behavior
- Isolated real PostgreSQL/HTTP: 233 assertions passed against migrations 002–011 in both namespaces
- ESLint, TypeScript/Vite production build, service-worker syntax, rehearsal migration reproducibility and whitespace checks passed
- Two extra service-worker controls passed: fresh hashed assets and offline shell/API-photo cache isolation
- Independent read-only review found no actionable correctness/security regression
- Browser visual QA was attempted using the cloud browser and a synthetic local preview, but localhost navigation returned `net::ERR_BLOCKED_BY_CLIENT`; it is not claimed as passed. Real iPhone/Safari and deployed Supabase verification were not performed
- No production data writes, SQL application, branch push, PR publication, merge or deployment occurred during preparation

The follow-up retry check canonicalizes text with the same `trim()` used in the transmitted payload. Whitespace-only prayer/reflection edits reuse an unresolved request's identity; changed content, kind, event day and photo render identity remain separate. Consent and editor freshness still use the unnormalized UI key.
