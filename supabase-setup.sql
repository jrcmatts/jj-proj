-- J&J Sports Wear: Supabase Auth roles + shared workspace snapshots
-- Execute in Supabase SQL Editor. DO NOT use the service_role / secret key in browser code.
-- First create each email/password user using Supabase > Authentication > Users.

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role text not null check (role in ('owner','admin','staff')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;
revoke all on public.user_profiles from anon;
grant select on public.user_profiles to authenticated;

drop policy if exists "User can read own profile" on public.user_profiles;
create policy "User can read own profile"
on public.user_profiles for select to authenticated
using (id = (select auth.uid()));

-- Privileged helper consults role records without recursive RLS profile checks.
create or replace function public.can_access_jj_workspace(target_workspace text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_profiles p
    where p.id = (select auth.uid())
      and p.active
      and (p.role in ('owner','admin')
           or (p.role = 'staff' and target_workspace = 'press'))
  );
$$;
revoke all on function public.can_access_jj_workspace(text) from public;
grant execute on function public.can_access_jj_workspace(text) to authenticated;

create table if not exists public.workspace_snapshots (
  workspace text primary key check (workspace in ('studio','press')),
  payload jsonb not null default '{}'::jsonb,
  revision bigint not null default 1 check (revision >= 1),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table public.workspace_snapshots enable row level security;
revoke all on public.workspace_snapshots from anon;
grant select, insert, update on public.workspace_snapshots to authenticated;

drop policy if exists "Read permitted workspace" on public.workspace_snapshots;
create policy "Read permitted workspace"
on public.workspace_snapshots for select to authenticated
using (public.can_access_jj_workspace(workspace));

drop policy if exists "Insert permitted workspace" on public.workspace_snapshots;
create policy "Insert permitted workspace"
on public.workspace_snapshots for insert to authenticated
with check (public.can_access_jj_workspace(workspace)
            and updated_by = (select auth.uid()));

drop policy if exists "Update permitted workspace" on public.workspace_snapshots;
create policy "Update permitted workspace"
on public.workspace_snapshots for update to authenticated
using (public.can_access_jj_workspace(workspace))
with check (public.can_access_jj_workspace(workspace)
            and updated_by = (select auth.uid()));

-- Compare-and-swap revision: concurrent browsers never silently overwrite a newer snapshot.
create or replace function public.save_workspace_snapshot(
  p_workspace text,
  p_payload jsonb,
  p_expected_revision bigint
)
returns bigint
language plpgsql security invoker
set search_path = ''
as $$
declare
  v_new_revision bigint;
begin
  if p_workspace not in ('studio','press') or p_workspace is null then
    raise exception 'Invalid workspace';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Snapshot payload must be a JSON object';
  end if;
  if p_expected_revision = 0 then
    insert into public.workspace_snapshots(workspace,payload,revision,updated_by)
    values (p_workspace,p_payload,1,(select auth.uid()))
    on conflict (workspace) do nothing
    returning revision into v_new_revision;
    if found then return v_new_revision; end if;
  else
    update public.workspace_snapshots
       set payload = p_payload,
           revision = revision + 1,
           updated_at = now(),
           updated_by = (select auth.uid())
     where workspace = p_workspace
       and revision = p_expected_revision
    returning revision into v_new_revision;
    if found then return v_new_revision; end if;
  end if;
  raise exception 'Cloud revision conflict or insufficient workspace permission. Export a JSON backup before refreshing.';
end;
$$;
revoke all on function public.save_workspace_snapshot(text,jsonb,bigint) from public;
grant execute on function public.save_workspace_snapshot(text,jsonb,bigint) to authenticated;

-- USER PROVISIONING (run separately, AFTER adding users in Supabase Authentication):
-- Replace the example email and name. Only trusted project administrators should run this.
--
-- insert into public.user_profiles (id, display_name, role, active)
-- select id, 'Owner Name', 'owner', true
-- from auth.users where email = 'owner@example.com'
-- on conflict (id) do update set
--   display_name = excluded.display_name,
--   role = excluded.role,
--   active = true;
--
-- To add other users, repeat the INSERT above with role 'admin' or 'staff'.
-- Do not create self-signup role policies; roles must only be assigned by a trusted administrator.
