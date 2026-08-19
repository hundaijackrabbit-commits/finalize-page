-- Finalize.page Phase 5: Integrations & External Evidence
-- Run AFTER phase4-migration.sql.

create table if not exists public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('github','vercel','stripe','docusign','google_drive','generic')),
  display_name text not null,
  status text not null default 'configured' check (status in ('configured','connected','degraded','disconnected')),
  auth_mode text not null default 'environment' check (auth_mode in ('environment','oauth','webhook','manual')),
  config_json jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  last_error text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Provider secrets/tokens are isolated from member-readable connection metadata.
create table if not exists public.integration_secrets (
  connection_id uuid primary key references public.integration_connections(id) on delete cascade,
  encrypted_payload text not null,
  payload_iv text not null,
  payload_tag text not null,
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);

create table if not exists public.integration_bindings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  finalization_id uuid not null references public.finalizations(id) on delete cascade,
  connection_id uuid not null references public.integration_connections(id) on delete cascade,
  requirement_id uuid references public.requirements(id) on delete cascade,
  signal_key text not null,
  expected_state text not null,
  matcher_json jsonb not null default '{}'::jsonb,
  required boolean not null default true,
  status text not null default 'waiting' check (status in ('waiting','satisfied','failed','paused')),
  last_observed_state text,
  last_observed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Store only normalized/minimized event data. Raw provider payloads are intentionally not retained.
create table if not exists public.integration_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid references public.integration_connections(id) on delete set null,
  provider text not null,
  provider_event_id text,
  signal_key text not null,
  observed_state text,
  normalized_event_json jsonb not null default '{}'::jsonb,
  raw_sha256 text not null,
  signature_valid boolean not null default false,
  received_at timestamptz not null default now(),
  unique(connection_id, provider_event_id)
);

create table if not exists public.external_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  finalization_id uuid not null references public.finalizations(id) on delete cascade,
  requirement_id uuid references public.requirements(id) on delete set null,
  binding_id uuid references public.integration_bindings(id) on delete set null,
  event_id uuid references public.integration_events(id) on delete set null,
  provider text not null,
  evidence_status text not null check (evidence_status in ('PASS','FAIL','INFO')),
  summary text not null,
  evidence_json jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists integration_connections_org_idx on public.integration_connections(organization_id, provider);
create index if not exists integration_bindings_fin_idx on public.integration_bindings(finalization_id, status);
create index if not exists integration_events_org_idx on public.integration_events(organization_id, received_at desc);
create index if not exists external_evidence_fin_idx on public.external_evidence(finalization_id, observed_at desc);

alter table public.integration_connections enable row level security;
alter table public.integration_secrets enable row level security;
alter table public.integration_bindings enable row level security;
alter table public.integration_events enable row level security;
alter table public.external_evidence enable row level security;

create policy "members read integration connections" on public.integration_connections for select using (public.is_org_member(organization_id));
create policy "members read integration bindings" on public.integration_bindings for select using (public.is_org_member(organization_id));
create policy "members read integration evidence" on public.external_evidence for select using (public.is_org_member(organization_id));
-- integration_events and integration_secrets remain service-role only by design.
-- All writes remain server-controlled so browser clients cannot forge completion evidence.

-- Add an integration-oriented system template.
insert into public.finalization_templates (organization_id, template_key, name, description, category, is_system, spec_json)
values
(null, 'software-release', 'Software Release', 'Deployment, CI, release approval, and production verification gates backed by external evidence.', 'Software', true,
 '{"requirements":[
   {"title":"Required CI checks pass","category":"CI","type":"integration","required":true},
   {"title":"Production deployment succeeds","category":"Deployment","type":"integration","required":true},
   {"title":"Release owner approval received","category":"Approval","type":"human","required":true}
 ]}'::jsonb),
(null, 'paid-client-handoff', 'Paid Client Handoff', 'Client approval, payment confirmation, delivery evidence, and closeout.', 'Agency', true,
 '{"requirements":[
   {"title":"Client approval received","category":"Approval","type":"human","required":true},
   {"title":"Final payment received","category":"Payment","type":"integration","required":true},
   {"title":"Final deliverables uploaded","category":"Handoff","type":"human","required":true}
 ]}'::jsonb)
on conflict do nothing;
