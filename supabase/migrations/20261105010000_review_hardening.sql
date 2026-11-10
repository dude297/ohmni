-- Review hardening (2026-11-05 security review of #94/#98/#99/#100).
--
-- 1. Column-level writes. The editor update policies on investigations and projects admitted ANY column through
--    PostgREST (status, opened_by, opened_at, created_by, workspace_id...). Clients now update only the user-editable
--    columns; status/closed_at change only through close_investigation() below (service role, after the API proved
--    editor access), and authorship columns are never client-writable.
-- 2. close_investigation(): closes an open investigation and stores its case_resolutions label in ONE transaction, so
--    a failed label insert can no longer leave a resolved case without a label (and a retry that 404s).
-- 3. Last owner: a workspace that has members always keeps at least one owner. Deferred constraint trigger, checked at
--    commit under a row lock on the workspace, so two last owners deleting their accounts (or demoting each other) at
--    the same time cannot both pass. Deleting the workspace itself (cascade to all members) is allowed: the workspace
--    row is gone by the time the check runs. Auth user deletion cascades memberships and is checked the same way.

-- 1 ------------------------------------------------------------------------------------------------------------------
revoke update on public.investigations from authenticated;
grant update (title) on public.investigations to authenticated;
revoke update on public.projects from authenticated;
grant update (name, description, archived_at) on public.projects to authenticated;

-- 2 ------------------------------------------------------------------------------------------------------------------
create function public.close_investigation(p_id uuid, p_status public.investigation_status, p_resolution jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare inv record; res jsonb;
begin
  if p_status = 'open' then raise exception 'cannot close to open' using errcode = '22023'; end if;
  update investigations set status = p_status, closed_at = now() where id = p_id and status = 'open'
    returning id, workspace_id, status, closed_at into inv;
  if not found then raise exception 'investigation is not open' using errcode = 'P0002'; end if;
  if p_resolution is not null then
    insert into case_resolutions (investigation_id, workspace_id, component_id, fault_class, measured_ohms, benchmark_consent,
                                  benchmark_eligible, verification_id, resolved_by)
    select inv.id, inv.workspace_id, r.component_id, r.fault_class, r.measured_ohms, coalesce(r.benchmark_consent, false),
           coalesce(r.benchmark_eligible, false), r.verification_id, r.resolved_by
    from jsonb_populate_record(null::case_resolutions, p_resolution) r
    returning jsonb_build_object('component_id', component_id, 'fault_class', fault_class, 'measured_ohms', measured_ohms,
      'benchmark_consent', benchmark_consent, 'benchmark_eligible', benchmark_eligible, 'verification_id', verification_id,
      'created_at', created_at) into res;
  end if;
  return jsonb_build_object('investigation', to_jsonb(inv), 'resolution', res);
end $$;
revoke all on function public.close_investigation(uuid, public.investigation_status, jsonb) from public, anon, authenticated;
grant execute on function public.close_investigation(uuid, public.investigation_status, jsonb) to service_role;

-- 3 ------------------------------------------------------------------------------------------------------------------
create function private.keep_an_owner() returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Serialises concurrent membership changes per workspace; no row = the workspace itself was deleted (cascade).
  perform 1 from workspaces where id = old.workspace_id for no key update;
  if not found then return null; end if;
  if exists (select 1 from workspace_members where workspace_id = old.workspace_id)
     and not exists (select 1 from workspace_members where workspace_id = old.workspace_id and role = 'owner') then
    raise exception 'LAST_OWNER: workspace % must keep at least one owner', old.workspace_id using errcode = '23514';
  end if;
  return null;
end $$;
revoke all on function private.keep_an_owner() from public, anon, authenticated;

create constraint trigger keep_an_owner after delete or update of role on public.workspace_members
  deferrable initially deferred for each row execute function private.keep_an_owner();
