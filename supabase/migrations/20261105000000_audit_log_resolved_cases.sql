-- Audit log, resolved-case labels, retention purge.
--
-- audit_events: append-only record of who changed what (ids, roles, statuses; never names, emails, bodies, graphs).
--   workspace_id ... on delete set null: the trail of a deleted workspace (including who deleted it) outlives the
--   workspace until the retention purge; rows with a null workspace are readable by no client, only the service role.
--   actor_id ... on delete set null: account deletion clears the actor, the event stays.
--   Read: workspace OWNERS only (an audit trail is an admin tool; editors/viewers are often contractors).
--   Write: server only (service role). No client insert/update/delete policy and the privileges are revoked too.
-- case_resolutions: the confirmed fault for a resolved investigation; server-written only (investigations has an editor
--   update policy, so these labels live in their own table to keep clients from marking a case benchmark-eligible).
-- purge_expired(): retention; schedule with pg_cron (docs/OPERATIONS.md). Not callable by clients.

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete set null,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null check (char_length(action) between 1 and 64),
  target_type text not null check (char_length(target_type) between 1 and 32),
  target_id uuid,
  metadata jsonb not null default '{}' check (jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) <= 2048),
  request_id text check (char_length(request_id) <= 64),
  created_at timestamptz not null default now()
);
create index on public.audit_events (workspace_id, created_at desc);
create index on public.audit_events (created_at);

alter table public.audit_events enable row level security;
create policy owner_read on public.audit_events for select to authenticated using (
  exists (select 1 from public.workspace_members m where m.workspace_id = audit_events.workspace_id and m.user_id = (select auth.uid()) and m.role = 'owner')
);
revoke insert, update, delete, truncate on public.audit_events from anon, authenticated;

create table public.case_resolutions (
  investigation_id uuid primary key,
  workspace_id uuid not null,
  component_id text check (char_length(component_id) between 1 and 64),
  fault_class text not null check (fault_class in ('open', 'short', 'x10', 'x0.1', 'dead', 'other', 'no_fault_found')),
  measured_ohms double precision check (measured_ohms >= 0 and measured_ohms <= 1e9),
  benchmark_consent boolean not null default false,
  benchmark_eligible boolean not null default false, -- true only if a server-side post-repair verification passed
  verification_id uuid references public.verifications (id) on delete set null,
  resolved_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, investigation_id) references public.investigations (workspace_id, id) on delete cascade
);
create index on public.case_resolutions (workspace_id);

alter table public.case_resolutions enable row level security;
create policy r on public.case_resolutions for select to authenticated using (private.is_member(workspace_id));
revoke insert, update, delete, truncate on public.case_resolutions from anon, authenticated;

create function public.purge_expired() returns jsonb language plpgsql security definer set search_path = public as $$
declare traces bigint; events bigint;
begin
  delete from public.model_traces where created_at < now() - interval '90 days';
  get diagnostics traces = row_count;
  delete from public.audit_events where created_at < now() - interval '400 days';
  get diagnostics events = row_count;
  return jsonb_build_object('model_traces', traces, 'audit_events', events);
end $$;
revoke all on function public.purge_expired() from public, anon, authenticated;
grant execute on function public.purge_expired() to service_role;
