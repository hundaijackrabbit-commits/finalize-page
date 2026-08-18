-- Finalize.page Phase 1B: account bootstrap + secure artifact ingestion metadata
-- Run AFTER phase1-schema.sql.

create type public.artifact_status as enum ('UPLOADING','QUARANTINED','SCANNING','PROCESSING','READY','REJECTED','INFECTED','FAILED','RETAINED','DELETED');
create type public.privacy_classification as enum ('PUBLIC','BUSINESS','CONFIDENTIAL','RESTRICTED');
create type public.upload_status as enum ('CREATED','UPLOADING','COMPLETING','COMPLETE','ABORTED','EXPIRED','FAILED');

create table public.artifacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  finalization_id uuid not null references public.finalizations(id) on delete cascade,
  original_filename text not null,
  storage_key text not null unique,
  size_bytes bigint not null check (size_bytes >= 0),
  mime_type text not null,
  status public.artifact_status not null default 'UPLOADING',
  privacy_classification public.privacy_classification not null default 'BUSINESS',
  integrity_checksum text,
  source_sha256 text,
  malware_scan_status text not null default 'PENDING',
  processing_error text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.upload_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  finalization_id uuid not null references public.finalizations(id) on delete cascade,
  artifact_id uuid not null unique references public.artifacts(id) on delete cascade,
  provider text not null default 's3',
  provider_upload_id text not null,
  part_size_bytes integer not null,
  status public.upload_status not null default 'CREATED',
  expires_at timestamptz not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index artifacts_finalization_created_idx on public.artifacts(finalization_id, created_at desc);
create index artifacts_org_status_idx on public.artifacts(organization_id, status);
create index upload_sessions_expiry_idx on public.upload_sessions(expires_at) where status in ('CREATED','UPLOADING','COMPLETING');

alter table public.artifacts enable row level security;
alter table public.upload_sessions enable row level security;

create policy "members read artifacts" on public.artifacts for select using (public.is_org_member(organization_id));
create policy "members read upload sessions" on public.upload_sessions for select using (public.is_org_member(organization_id));
-- Artifact/session writes are intentionally server-side only. No broad client INSERT/UPDATE policies.

-- Create one private workspace for a newly confirmed user. Replace this bootstrap with
-- explicit onboarding when organization creation becomes a product flow.
create or replace function public.bootstrap_finalize_account()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  org_id uuid;
  display text;
begin
  display := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1), 'My');
  insert into public.organizations(name, plan)
  values (display || '''s Workspace', 'free')
  returning id into org_id;

  insert into public.memberships(organization_id, user_id, role)
  values (org_id, new.id, 'owner');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_finalize on auth.users;
create trigger on_auth_user_created_finalize
after insert on auth.users
for each row execute procedure public.bootstrap_finalize_account();
