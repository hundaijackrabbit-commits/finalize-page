-- Finalize.page Phase 1 production data model (Postgres / Supabase-ready)
-- Run only after reviewing for your deployment and auth provider.

create extension if not exists pgcrypto;

create type public.finalization_state as enum ('DRAFT','CHECKING','BLOCKED','RESOLVING','READY','FINALIZING','FINALIZED','REOPENED','ARCHIVED');
create type public.requirement_status as enum ('open','checking','passed','waived');
create type public.requirement_type as enum ('human','automated','integration','ai');
create type public.approval_status as enum ('not_requested','pending','approved','rejected','superseded');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan text not null default 'free',
  created_at timestamptz not null default now()
);

create table public.memberships (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','member','viewer')),
  created_at timestamptz not null default now(),
  primary key (organization_id,user_id)
);

create table public.finalizations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  type text not null,
  counterpart_name text,
  state public.finalization_state not null default 'DRAFT',
  artifact_version integer not null default 1,
  due_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finalized_at timestamptz
);

create table public.finalization_participants (
  id uuid primary key default gen_random_uuid(),
  finalization_id uuid not null references public.finalizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  display_name text not null,
  email text,
  role text not null,
  created_at timestamptz not null default now()
);

create table public.requirements (
  id uuid primary key default gen_random_uuid(),
  finalization_id uuid not null references public.finalizations(id) on delete cascade,
  title text not null,
  category text not null default 'Closeout',
  type public.requirement_type not null default 'human',
  required boolean not null default true,
  status public.requirement_status not null default 'open',
  owner_participant_id uuid references public.finalization_participants(id) on delete set null,
  evidence_summary text,
  last_checked_at timestamptz,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  finalization_id uuid not null references public.finalizations(id) on delete cascade,
  requirement_id uuid references public.requirements(id) on delete cascade,
  author_participant_id uuid references public.finalization_participants(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  finalization_id uuid not null references public.finalizations(id) on delete cascade,
  title text not null,
  reviewer_participant_id uuid references public.finalization_participants(id) on delete set null,
  status public.approval_status not null default 'not_requested',
  artifact_version integer not null,
  requested_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.guest_access_grants (
  id uuid primary key default gen_random_uuid(),
  finalization_id uuid not null references public.finalizations(id) on delete cascade,
  participant_id uuid references public.finalization_participants(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  require_email_verification boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  finalization_id uuid references public.finalizations(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_participant_id uuid references public.finalization_participants(id) on delete set null,
  event_type text not null,
  event_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.finalization_records (
  id uuid primary key default gen_random_uuid(),
  public_record_id text not null unique,
  finalization_id uuid not null unique references public.finalizations(id) on delete restrict,
  artifact_version integer not null,
  artifact_fingerprint text,
  passed_requirement_count integer not null,
  record_json jsonb not null,
  finalized_by uuid references auth.users(id) on delete set null,
  finalized_at timestamptz not null default now()
);

create index requirements_finalization_idx on public.requirements(finalization_id);
create index comments_finalization_idx on public.comments(finalization_id);
create index audit_org_created_idx on public.audit_events(organization_id,created_at desc);
create index finalizations_org_state_idx on public.finalizations(organization_id,state);

-- Tenant isolation. Service-role code must still enforce organization boundaries.
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.finalizations enable row level security;
alter table public.finalization_participants enable row level security;
alter table public.requirements enable row level security;
alter table public.comments enable row level security;
alter table public.approvals enable row level security;
alter table public.guest_access_grants enable row level security;
alter table public.audit_events enable row level security;
alter table public.finalization_records enable row level security;

create or replace function public.is_org_member(org_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.memberships m where m.organization_id = org_id and m.user_id = auth.uid()); $$;

create policy "members read organizations" on public.organizations for select using (public.is_org_member(id));
create policy "members read memberships" on public.memberships for select using (public.is_org_member(organization_id));
create policy "members read finalizations" on public.finalizations for select using (public.is_org_member(organization_id));
create policy "members insert finalizations" on public.finalizations for insert with check (public.is_org_member(organization_id) and created_by = auth.uid());
create policy "members update finalizations" on public.finalizations for update using (public.is_org_member(organization_id));

create policy "members read participants" on public.finalization_participants for select using (
  exists(select 1 from public.finalizations f where f.id = finalization_id and public.is_org_member(f.organization_id))
);
create policy "members manage participants" on public.finalization_participants for all using (
  exists(select 1 from public.finalizations f where f.id = finalization_id and public.is_org_member(f.organization_id))
) with check (
  exists(select 1 from public.finalizations f where f.id = finalization_id and public.is_org_member(f.organization_id))
);

create policy "members manage requirements" on public.requirements for all using (
  exists(select 1 from public.finalizations f where f.id = finalization_id and public.is_org_member(f.organization_id))
) with check (
  exists(select 1 from public.finalizations f where f.id = finalization_id and public.is_org_member(f.organization_id))
);
create policy "members manage comments" on public.comments for all using (
  exists(select 1 from public.finalizations f where f.id = finalization_id and public.is_org_member(f.organization_id))
) with check (
  exists(select 1 from public.finalizations f where f.id = finalization_id and public.is_org_member(f.organization_id))
);
create policy "members manage approvals" on public.approvals for all using (
  exists(select 1 from public.finalizations f where f.id = finalization_id and public.is_org_member(f.organization_id))
) with check (
  exists(select 1 from public.finalizations f where f.id = finalization_id and public.is_org_member(f.organization_id))
);
create policy "members manage guest grants" on public.guest_access_grants for all using (
  exists(select 1 from public.finalizations f where f.id = finalization_id and public.is_org_member(f.organization_id))
) with check (
  exists(select 1 from public.finalizations f where f.id = finalization_id and public.is_org_member(f.organization_id))
);
create policy "members read audit" on public.audit_events for select using (public.is_org_member(organization_id));
create policy "members read records" on public.finalization_records for select using (
  exists(select 1 from public.finalizations f where f.id = finalization_id and public.is_org_member(f.organization_id))
);

-- Guest writes should NOT be exposed through broad anonymous RLS policies.
-- Implement guest review actions through server-side endpoints that:
-- 1) hash the presented token and match guest_access_grants.token_hash,
-- 2) enforce expires_at/revoked_at,
-- 3) scope mutations to that grant's finalization/participant,
-- 4) write an audit_event for every action.
