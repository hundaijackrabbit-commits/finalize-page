-- Finalize.page Phase 2: Agency Completion
-- Run AFTER phase1-schema.sql, phase1b-migration.sql, phase1c-migration.sql.

alter table public.organizations
  add column if not exists brand_name text,
  add column if not exists brand_accent text default '#182018',
  add column if not exists brand_logo_url text,
  add column if not exists custom_domain text;

alter table public.finalizations
  add column if not exists review_url text,
  add column if not exists template_key text,
  add column if not exists handoff_status text not null default 'NOT_STARTED',
  add column if not exists privacy_closeout_status text not null default 'OPEN';

alter table public.requirements
  add column if not exists depends_on_requirement_id uuid references public.requirements(id) on delete set null,
  add column if not exists evidence_json jsonb not null default '{}'::jsonb,
  add column if not exists resolution_action text;

create table if not exists public.review_annotations (
  id uuid primary key default gen_random_uuid(),
  finalization_id uuid not null references public.finalizations(id) on delete cascade,
  artifact_version integer not null,
  target_type text not null default 'website' check (target_type in ('website','image','pdf','file')),
  target_ref text,
  x_pct numeric(6,3) check (x_pct is null or (x_pct >= 0 and x_pct <= 100)),
  y_pct numeric(6,3) check (y_pct is null or (y_pct >= 0 and y_pct <= 100)),
  body text not null,
  visibility text not null default 'shared' check (visibility in ('shared','internal')),
  status text not null default 'open' check (status in ('open','resolved','accepted')),
  author_participant_id uuid references public.finalization_participants(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.file_requests (
  id uuid primary key default gen_random_uuid(),
  finalization_id uuid not null references public.finalizations(id) on delete cascade,
  title text not null,
  description text,
  accepted_extensions text[] not null default '{}',
  required boolean not null default true,
  participant_id uuid references public.finalization_participants(id) on delete set null,
  status text not null default 'requested' check (status in ('requested','received','waived','expired')),
  artifact_id uuid references public.artifacts(id) on delete set null,
  due_at timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.secure_requests (
  id uuid primary key default gen_random_uuid(),
  finalization_id uuid not null references public.finalizations(id) on delete cascade,
  title text not null,
  request_type text not null default 'credential' check (request_type in ('credential','access','secret','other')),
  participant_id uuid references public.finalization_participants(id) on delete set null,
  status text not null default 'requested' check (status in ('requested','submitted','viewed','destroyed','expired')),
  encrypted_payload text,
  payload_iv text,
  payload_tag text,
  expires_at timestamptz,
  submitted_at timestamptz,
  destroyed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.payment_gates (
  id uuid primary key default gen_random_uuid(),
  finalization_id uuid not null references public.finalizations(id) on delete cascade,
  label text not null default 'Final payment',
  amount_cents integer check (amount_cents is null or amount_cents >= 0),
  currency text not null default 'CAD',
  provider text not null default 'manual',
  provider_reference text,
  payment_url text,
  status text not null default 'unpaid' check (status in ('unpaid','pending','paid','waived','refunded')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.privacy_closeout_items (
  id uuid primary key default gen_random_uuid(),
  finalization_id uuid not null references public.finalizations(id) on delete cascade,
  item_type text not null check (item_type in ('guest_link','credential','temporary_file','test_account','retention','access','other')),
  title text not null,
  description text,
  required boolean not null default true,
  status text not null default 'open' check (status in ('open','resolved','scheduled','waived')),
  due_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  finalization_id uuid not null references public.finalizations(id) on delete cascade,
  participant_id uuid references public.finalization_participants(id) on delete set null,
  channel text not null default 'email' check (channel in ('email','in_app','webhook')),
  subject text,
  status text not null default 'scheduled' check (status in ('scheduled','sent','cancelled','failed')),
  send_at timestamptz not null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.finalization_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  template_key text not null,
  name text not null,
  description text,
  category text not null default 'Agency',
  is_system boolean not null default false,
  spec_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(organization_id, template_key)
);

create index if not exists review_annotations_fin_version_idx on public.review_annotations(finalization_id, artifact_version, status);
create index if not exists file_requests_fin_status_idx on public.file_requests(finalization_id, status);
create index if not exists secure_requests_fin_status_idx on public.secure_requests(finalization_id, status);
create index if not exists payment_gates_fin_status_idx on public.payment_gates(finalization_id, status);
create index if not exists privacy_closeout_fin_status_idx on public.privacy_closeout_items(finalization_id, status);
create index if not exists reminders_due_idx on public.reminders(send_at) where status = 'scheduled';

alter table public.review_annotations enable row level security;
alter table public.file_requests enable row level security;
alter table public.secure_requests enable row level security;
alter table public.payment_gates enable row level security;
alter table public.privacy_closeout_items enable row level security;
alter table public.reminders enable row level security;
alter table public.finalization_templates enable row level security;
create unique index if not exists system_template_key_unique on public.finalization_templates(template_key) where organization_id is null;

create policy "members read review annotations" on public.review_annotations for select using (
  exists(select 1 from public.finalizations f where f.id = finalization_id and public.is_org_member(f.organization_id))
);
create policy "members read file requests" on public.file_requests for select using (
  exists(select 1 from public.finalizations f where f.id = finalization_id and public.is_org_member(f.organization_id))
);
create policy "members read secure request metadata" on public.secure_requests for select using (
  exists(select 1 from public.finalizations f where f.id = finalization_id and public.is_org_member(f.organization_id))
);
-- secure request writes intentionally remain server/service-role only.
create policy "members read payment gates" on public.payment_gates for select using (
  exists(select 1 from public.finalizations f where f.id = finalization_id and public.is_org_member(f.organization_id))
);
create policy "members read privacy closeout" on public.privacy_closeout_items for select using (
  exists(select 1 from public.finalizations f where f.id = finalization_id and public.is_org_member(f.organization_id))
);
create policy "members read reminders" on public.reminders for select using (
  exists(select 1 from public.finalizations f where f.id = finalization_id and public.is_org_member(f.organization_id))
);
create policy "members read templates" on public.finalization_templates for select using (is_system or organization_id is null or public.is_org_member(organization_id));
create policy "members manage org templates" on public.finalization_templates for all using (organization_id is not null and public.is_org_member(organization_id)) with check (organization_id is not null and public.is_org_member(organization_id));

-- System template specs. organization_id NULL means global read-only template.
insert into public.finalization_templates (organization_id, template_key, name, description, category, is_system, spec_json)
values
(null, 'agency-website-launch', 'Agency Website Launch', 'QA, client approval, payment, handoff, access cleanup, and launch proof.', 'Agency', true,
 '{"requirements":[
   {"title":"Critical website QA passed","category":"QA","type":"automated","required":true},
   {"title":"Client final review resolved","category":"Client","type":"human","required":true},
   {"title":"Final invoice paid","category":"Payment","type":"integration","required":true},
   {"title":"Production access confirmed","category":"Access","type":"human","required":true},
   {"title":"Handoff package delivered","category":"Handoff","type":"human","required":true},
   {"title":"Temporary access removed","category":"Privacy","type":"human","required":true}
 ]}'::jsonb),
(null, 'creative-delivery', 'Creative Delivery', 'Versioned client review, final approval, source-file handoff, and payment closeout.', 'Agency', true,
 '{"requirements":[
   {"title":"All review comments resolved","category":"Review","type":"human","required":true},
   {"title":"Final version approved","category":"Client","type":"human","required":true},
   {"title":"Source files delivered","category":"Handoff","type":"human","required":true},
   {"title":"Final payment received","category":"Payment","type":"integration","required":true}
 ]}'::jsonb)
on conflict do nothing;

-- Finalization records are immutable/versioned. Re-finalizing creates a new record and supersedes the old one.
alter table public.finalization_records drop constraint if exists finalization_records_finalization_id_key;
alter table public.finalization_records add column if not exists record_status text not null default 'active' check (record_status in ('active','superseded'));
alter table public.finalization_records add column if not exists supersedes_record_id uuid references public.finalization_records(id) on delete set null;
create unique index if not exists one_active_finalization_record_idx on public.finalization_records(finalization_id) where record_status='active';
create index if not exists finalization_record_history_idx on public.finalization_records(finalization_id, finalized_at desc);

-- Atomic version bump. Any new completed artifact supersedes approval of an older version.
create or replace function public.bump_finalize_artifact_version(p_finalization_id uuid, p_organization_id uuid)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  next_version integer;
begin
  update public.finalizations
  set artifact_version = artifact_version + 1,
      state = case when state = 'FINALIZED' then 'REOPENED'::public.finalization_state else state end,
      updated_at = now()
  where id = p_finalization_id and organization_id = p_organization_id
  returning artifact_version into next_version;

  if next_version is null then raise exception 'finalization_not_found'; end if;

  update public.approvals
  set status = case when status in ('approved','pending') then 'superseded'::public.approval_status else status end,
      approved_at = null,
      requested_at = null
  where finalization_id = p_finalization_id and artifact_version < next_version;

  update public.finalization_records
  set record_status = 'superseded'
  where finalization_id = p_finalization_id and record_status = 'active';

  return next_version;
end;
$$;
revoke all on function public.bump_finalize_artifact_version(uuid, uuid) from public;
grant execute on function public.bump_finalize_artifact_version(uuid, uuid) to service_role;

-- Guest-origin uploads keep provenance without requiring a workspace/auth account.
alter table public.artifacts alter column created_by drop not null;
alter table public.artifacts add column if not exists created_by_participant_id uuid references public.finalization_participants(id) on delete set null;
alter table public.upload_sessions alter column created_by drop not null;
alter table public.upload_sessions add column if not exists created_by_participant_id uuid references public.finalization_participants(id) on delete set null;
alter table public.upload_sessions add column if not exists file_request_id uuid references public.file_requests(id) on delete set null;

create table if not exists public.finalization_versions (
  id uuid primary key default gen_random_uuid(),
  finalization_id uuid not null references public.finalizations(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  artifact_id uuid references public.artifacts(id) on delete set null,
  reason text not null default 'artifact_changed',
  created_by uuid references auth.users(id) on delete set null,
  created_by_participant_id uuid references public.finalization_participants(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(finalization_id, version_number)
);
create index if not exists finalization_versions_idx on public.finalization_versions(finalization_id, version_number desc);
alter table public.finalization_versions enable row level security;
create policy "members read version history" on public.finalization_versions for select using (
  exists(select 1 from public.finalizations f where f.id = finalization_id and public.is_org_member(f.organization_id))
);
-- Version events are server-controlled only.
