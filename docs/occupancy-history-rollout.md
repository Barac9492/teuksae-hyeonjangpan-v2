# Operator estimates and historical event times (migration 004)

## Implemented
- `occupancyPercent`: nullable integer 0–100 for worship rooms and parking, explicitly labelled an operator estimate, not measured capacity. No default percentages and no percentage on the school access-stage resource. A blank admin input sends null; rechecks retain the explicitly displayed estimate. Percent and state are separately entered, never inferred from each other.
- Public estimates require a valid, fresh resource (10 minutes), connected/enabled API and non-checking state. Invalid percentages fail the entire resource closed. Old timestamps are visibly marked as historical, not current availability.
- `parking.calvary` starts `checking`, version 0, with no estimate/time. It is shown alongside Songrim parking; no address, opening time, availability or capacity is invented.
- User-supplied Songrim school admission schedule: 03:00. This does not set the live stage, parking state, or building opening state.
- `lastClosedAt` and `lastFullAt` record the latest actual transition into closed/hall_closed and full. Same-state rechecks update freshness/version but not these event times. Reopening does not erase history; a subsequent closure/full event updates the latest timestamp while retaining previous transitions in `ops_history`.
- Existing historical transitions are backfilled from audit rows, not from freshness timestamps. Existing repeated-confirmation rows do not count as transitions. No known transition means null, not an invented time.
- Estimate before/after values are stored in history and request receipts bind the estimate, state, resource, version and session. Existing session authorization, role restriction, account locking, CAS and replay protection remain in place. Conflict review issues a new request ID.

## Deployment gate
Apply `supabase/migrations/004_occupancy_and_event_history.sql` after 001–003, on the intended v2 database only. No production credentials were used or copied and this migration has NOT been applied remotely. Transactional migration drops the old write overload and replaces it with the integer estimate-aware overload; old callers can omit the defaulted estimate (null). Coordinate deployment of migration and application; deploying API first will fail closed on the missing RPC signature.

No PostgreSQL runtime is available in this task. SQL was reviewed and statically regression-tested, not executed. Before production: apply all migrations to a disposable database and verify role denials, estimate bounds/access-resource rejection, same-state rechecks, reopen/reclose history, conflict replay, changed-estimate request-ID mismatch, and public output without actor/session details. Only then apply the migration to the approved v2 DB and deploy API/frontend together.

Audit rows remain durable with no deletion/retention added. Admin UI shows its existing most-recent 100 audit entries; full historical querying remains a database/operator task. Public output exposes only latest historical timestamps, never operator identity.
