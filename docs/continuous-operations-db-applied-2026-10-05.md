# Approved continuous-operations database release

The user approved the four operational changes, including their database change and production release, on 2026-10-04 at 22:58:17 UTC. Implementation commit: `fa6f3173211e87bb11d7175279e4a7cd99caea26`, based on photo-archive main `097413ad4716d0cba889acf0b5e4b72021bedf3f`.

Applied only `supabase/migrations/20261004222445_continuous_operations_capacity.sql` through the official Supabase migration tool to church project `ikvzbyueyqcjajcaqomb`. The tool returned success. Supabase recorded the application as **20261004230127 / continuous_operations_capacity**. Do not reapply it using the different local filename timestamp, and do not rerun older manual migrations.

Exact file SHA-256: `f181ee5108f4cae6c6b78aa3aad3ea8979009fee2466f70b5946a9d9ce4f4cf4`.

Independent before/after reads at 23:01:11 and 23:01:58 UTC confirmed:

- Every pre-existing operational row was unchanged: aggregate hash `f8c82e2edd21db06af1f82176b5a75a0` before and after.
- Operational history stayed at 154 rows and request receipts at 158. No real status/percentage was submitted.
- `space.songrim.f4` is present as 본당 4층 / space / checking, version 0, with null timestamp and occupancy.
- The new Dream percentage-compatible constraint and RPC are present. Function execution is denied to anon/authenticated and allowed to service_role.
- Photo-archive community functions are unchanged: `community_v2(text,jsonb)` hash `b9dd820470907aa517249a606c18f877`; `community_public_page(text,timestamptz,uuid)` hash `5b3573ffe0493b6dd7d90bff3c582662`.
- Existing photo archive migration `20261004222018` remains recorded. Pending prayer dual-mode work is not included.

The security advisor still reports informational no-policy RLS entries for server-only tables and warnings on untouched legacy pilot functions/policies and Supabase Auth password settings. No new grant or public policy was added by this migration. Those unrelated settings were not changed as part of this release. Advisor guidance: [function execution privileges](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [RLS without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

This record covers the completed database step. The application release must pass exact-head full CI before merge; production READY and public read-only verification follow the merge. The implementation report and synthetic browser evidence remain in `continuous-operations-2026-10-05.md` and `evidence/continuous-operations/`.
