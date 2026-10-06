# Administrator feedback DB migration — applied with approval

On 2026-10-03, the user approved the bundled recoverable-trash migration and code publication/merge/deployment. Only the new migration was applied to church project **ikvzbyueyqcjajcaqomb** through the official migration tool. The tool returned `success: true`; independent physical-schema verification confirmed the new constraint and function.

Source: `supabase/migrations/20261003115248_admin_tabs_recoverable_trash.sql`

SHA-256: `2fbc0ac633d85eccb5f93c17ced387db04e148a60ed4c2a5054faa71b8c524df`

Remote history version assigned by the tool: **20261003183917**, name `admin_tabs_recoverable_trash`. The source filename's timestamp is different; this is the same already-applied migration, not a pending second application. Future CLI history reconciliation must account for this mapping and the earlier manually applied migration. Do not run bulk db push or reapply either source file based only on filename/history mismatch.

## Read-only before/after verification

| Check | Before | After |
|---|---|---|
| Community item count | 20 | 20 |
| Whole-row community MD5 aggregate | `07f279967e31840d255dcca639b80fdf` | identical |
| Audit count | 24 | 24 |
| Whole-row audit MD5 aggregate | `ed9614d5ae46a5f4bfcb6e37147d3cb2` | identical |
| Operations resources | 14 | 14 |
| Operations history | 59 | 59 |
| Operations receipts | 60 | 60 |
| Item status constraint includes `trashed` | no | yes |
| Live RPC advertises `trashSupported` | no | yes |

All three community tables retain RLS and no anon/authenticated SELECT grants. `community_v2(text,jsonb)` retains SECURITY DEFINER with empty search_path and execute restricted to service_role (anon/authenticated denied). Legacy public list reads return 2 prayers; the public photo page returns 4 photos. Prior `guide_floor` and the seven-argument operations writer were verified before applying. No production submissions, approvals, deletions, restore actions, operator status writes or test posts were made.

The earlier `20261003062254_church_feedback_guidance_and_pages.sql` remains manually applied without a history entry and was **not rerun**. See [its release record](manual-db-release-2026-10-03.md).

Application rollback may retain this additive DB change. Do not restore the older DB function while trashed rows exist; that requires a separately reviewed preservation plan. Full application CI and preview validation precede merge/deployment.

## 2026-10-06 repository filename reconciliation

The approved/applied source filename above is retained as an audit record. The current repository file is `supabase/migrations/20261003183917_admin_tabs_recoverable_trash.sql`; its SQL bytes and SHA-256 are unchanged. The timestamp difference described above was the state at release time. This rename does not reapply SQL or modify database history. See [the eight-file mapping and remaining history constraints](migration-history-alignment-2026-10-06.md).
