-- Supabase API enables pg_safeupdate; SQL Editor/PGlite do not.
-- Explicit predicates intentionally cover ALL rows in rehearsal-only tables.
-- No live table, account, or session is modified.
begin;
create or replace function public.rehearsal_ops_reset_rehearsal(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_username text; v_role text;
begin
 -- Global exclusive lock first: no mutation may cross a reset boundary.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('rehearsal-global-reset', 0));
 select username into v_username from public.rehearsal_ops_sessions where id=p_session_id;
 if v_username is null then raise exception 'unauthorized' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('rehearsal-ops-account:' || v_username, 0));
 select a.role into v_role from public.rehearsal_ops_sessions s
 join public.rehearsal_ops_accounts a on a.username=s.username
 where s.id=p_session_id and s.username=v_username and s.revoked_at is null
 and s.expires_at>now() and a.active and a.credential_version=s.credential_version
 for update of s,a;
 if v_role is distinct from 'superadmin' then raise exception 'unauthorized' using errcode='42501'; end if;
 update public.rehearsal_ops_resources set state='checking',occupancy_percent=null,
 updated_at=null,last_closed_at=null,last_full_at=null,version=version+1 where true;
 delete from public.rehearsal_ops_history where true;
 delete from public.rehearsal_ops_request_receipts where true;
 delete from public.rehearsal_community_v2_rates where true;
 delete from public.rehearsal_community_v2_audit where true;
 -- Keep path/token/payload tombstones indefinitely for late-upload cleanup and
 -- idempotent retries. Never remove storage.objects or return private paths.
 update public.rehearsal_community_v2_items set status='deleted',text='',event_day=null,
 ready=false,version=version+1,last_cleanup_at=null where true;
 return jsonb_build_object('reset',true);
end; $$;
revoke all on function public.rehearsal_ops_reset_rehearsal(uuid) from public,anon,authenticated;
grant execute on function public.rehearsal_ops_reset_rehearsal(uuid) to service_role;
commit;
