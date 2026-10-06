# Migration filename alignment — 2026-10-06

Repository-only reconciliation authorized on 2026-10-06 at 23:03:54 UTC. The delegated read-only comparison found the eight stored SQL bodies in production project `ikvzbyueyqcjajcaqomb` exactly match these source files. This work uses that supplied comparison; it does not independently reconnect to production. Only filename versions change. Original approved/applied filenames remain below for audit.

| Original approved/applied filename | Current filename / recorded version | Unchanged SQL SHA-256 |
|---|---|---|
| `011_community_admin_pagination.sql` | `20261002024937_community_admin_pagination.sql` | `155e20d7e35a5bb8149d7c2ea79a0f70d5096bd7ef7d86564bf7dad779e2c10f` |
| `20261003115248_admin_tabs_recoverable_trash.sql` | `20261003183917_admin_tabs_recoverable_trash.sql` | `2fbc0ac633d85eccb5f93c17ced387db04e148a60ed4c2a5054faa71b8c524df` |
| `20261004152334_reviewed_prayer_masking.sql` | `20261004161445_reviewed_prayer_masking.sql` | `9c6ffab17e720c0a840ab9176a193ed9e5d76e06aa16d2f1751a7c22b8c61261` |
| `20261004215412_photo_private_archive.sql` | `20261004222018_photo_private_archive.sql` | `77dbf4abe65aee6a3d07df14e1a41013ac501949bb85c5c288ebbd91ad5862df` |
| `20261004222445_continuous_operations_capacity.sql` | `20261004230127_continuous_operations_capacity.sql` | `f181ee5108f4cae6c6b78aa3aad3ea8979009fee2466f70b5946a9d9ce4f4cf4` |
| `20261005031042_prayer_public_edit.sql` | `20261005031956_prayer_public_edit.sql` | `f80f7576bb196e1d69d9ab312f435bd64d929a3b57d1c4273618bc75eb8286f7` |
| `20261005202358_prayer_blessing_boards.sql` | `20261005214409_prayer_blessing_boards.sql` | `935c6f2aa99eea74f75004a044df8458796c9c3937e5c1f00eca1df732f31e54` |
| `20261006214311_split_gym_floors.sql` | `20261006215814_split_gym_floors.sql` | `809479e46802426fd802f20a58535b60c3a6ffb9322ff031c7f43e68070bc179` |

## Execution and local validation

Lexicographic order is unchanged by logical migration name: legacy 001, 002–010, community admin pagination, feedback guidance/pages, recoverable trash, audit attribution, prayer masking, photo archive, continuous operations, prayer public edit, prayer boards, gym floors. Pagination still follows 010 and precedes feedback guidance. Tests/fixtures that selected pagination with the old `011` numeric range now include it by suffix; explicit file paths use the recorded versions. No SQL file body, including the original filename comment in `20261004090000_moderation_audit_attribution.sql`, is edited.

Run the checks in `.github/workflows/church-regression.yml` with its pinned PGlite version in a disposable local environment. Every SQL harness constructs an in-memory `new PGlite()` instance with synthetic tables/accounts and no production credentials. The 009 preflight refusal for an existing rehearsal namespace remains intact. Do not run these historical account-copy/reset statements against an existing or remote database.

## Completed repository checks

Validated on main `23ec71b` (includes day-three sermon PR #42), with no overlap with that release's changed files:

- All 20 SQL bodies byte-identical to the base; all eight rename hashes above match.
- All 12 SQL harness/fixture selection lists preserve the same logical files and ordering. Old filename references remain only in this mapping, three original application records and the unchanged historical SQL comment.
- All ten in-memory SQL harnesses pass, including the nine CI suites plus rehearsal guard/preservation checks (76 assertions). `build-rehearsal-migration.mjs --check` passes.
- Lint, 62 frontend test files / 707 tests, 99 server tests, production build and service-worker syntax check pass.
- All seven CI browser suites pass against loopback synthetic fixtures: feedback, sermon card (including day three), intergenerational prayer, admin feedback, entrance, photo archive and prayer boards. External browser traffic is blocked.

No remote DB connection was used for these checks. Local PGlite does not reproduce Supabase PostgREST, pg_safeupdate, production load or concurrent-session timing.

## Remaining constraints

This is **not** complete `db push` readiness. The other 12 files have visible current effects according to the supplied comparison, but historical seeds, backfills, account copies and storage settings have not all been verified. Do not automatically adopt them into migration history:

- `001_production_pilot.sql`
- `002_team_operations.sql`
- `003_review_hardening.sql`
- `004_occupancy_and_event_history.sql`
- `005_community.sql`
- `006_reflections.sql`
- `007_occupancy_steps.sql`
- `008_previous_day_parking.sql`
- `009_rehearsal.sql`
- `010_rehearsal_reset_safeupdate.sql`
- `20261003062254_church_feedback_guidance_and_pages.sql`
- `20261004090000_moderation_audit_attribution.sql`

The supplied comparison also reports 36 current function bodies/attributes matching the repository and 25 related tables present. These observations do not prove every historical data operation ran. In particular, 009 contains rehearsal account initialization and a one-time canonical account copy; its guard must never be bypassed.

No production SQL execution, migration repair, history write, db push, blanket `--include-all`, account copy or deletion is authorized by this reconciliation. Future reconciliation of the 12 unrecorded files requires separate evidence and approval. The original release records remain historical evidence, not a new execution queue.
