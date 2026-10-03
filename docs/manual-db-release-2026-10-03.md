# Church feedback DB release — manually applied

The reviewed migration `supabase/migrations/20261003062254_church_feedback_guidance_and_pages.sql` was applied once through the official Supabase SQL editor to production project `ikvzbyueyqcjajcaqomb` on 2026-10-03, with success verified at 09:24 UTC. The previously attempted migration connector returned `Invalid or expired requestState`; repeated read-only schema checks confirmed no earlier application. The user explicitly authorized the rollout and retry.

Before running, the editor contents were copied back and their SHA-256 matched the tested file exactly:

`e200d557f30d2bee52658831fb4598a2cc98d6807cbdc672f812f66fe8e2d0d9`

SQL editor result: **Success. No rows returned.** Independent read verification then confirmed:

- `guide_floor` and the new public page RPC exist. The replacement writer has seven arguments with two defaults, retaining old five/six-argument call compatibility tested locally.
- Existing community items **20**, history **58**, receipts **59** are unchanged. Resources increased **13 → 14** only through the new `parking.dream` row (`checking`, guide floor NULL, version0). Six retired/legacy parking rows remain preserved.
- All four relevant tables retain RLS. All four touched RPCs retain empty search paths and execute permission only for `service_role`; `anon`/`authenticated` cannot execute them.
- Public read RPCs succeed:14 resource rows,2 prayer items and5 photo items in the first bounded pages. Existing deployed API reads remain compatible. No test posts, photos, or operator status writes were made in production.

## Migration history is intentionally not fabricated

The SQL editor does **not** register this operation in `supabase_migrations.schema_migrations`. The migration listing still contains `20261002024937 community_v2_admin_cursor_011`. **Do not run the SQL again based on that absence.** Check physical schema/function state and this recorded hash first. A future CLI-driven migration rollout must explicitly reconcile this manual application before applying pending migration files; this release did not insert or repair migration history.

The original SQL file remains the authoritative reproducible migration for local validation and new environments. It was not changed into an unverified idempotent variant.
