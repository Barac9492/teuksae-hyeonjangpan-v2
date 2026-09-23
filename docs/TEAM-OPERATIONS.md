# Team operations backend setup

1. Apply `supabase/migrations/002_team_operations.sql` and then `supabase/migrations/003_review_hardening.sql` to Supabase project `ikvzbyueyqcjajcaqomb` after migration 001. Migration 003 is required for reservation-safe login attempt accounting and account-lock ordering.
2. Set **server-only** Vercel environment variables: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Do not expose either as `VITE_*` variables.
3. Keep `ADMIN_SESSION_SECRET` and `ADMIN_ALLOWED_ORIGIN`. `ADMIN_LOGIN_ID` and `ADMIN_PASSWORD_SCRYPT` are needed only to bootstrap an empty DB: the first login atomically creates the DB superadmin only when no DB superadmin exists. After that, database credentials are canonical and stale or removed bootstrap-password env values do not affect login access.
4. Sign in as the bootstrap superadmin and create `WOORIPARK` with role `parking` and `WOORISEAT` with role `space`. Accounts may be created inactive without passwords. Activating requires a stored password of at least 4 characters.

The server uses native `fetch` against PostgREST RPC endpoints. The migration revokes anon/authenticated access to all `ops_*` tables/functions and grants RPC execution only to `service_role`.

`displayName` is explicitly self-reported per session and is only recorded in the audit as a self-reported actor label. It is not verified identity. Password changes, role changes, and deactivation increment credential version and revoke that account's sessions. Logout revokes only its current session.
