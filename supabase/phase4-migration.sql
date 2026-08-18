-- Finalize.page Phase 4: Finalize Documents
-- Run AFTER phase3-migration.sql.

alter table public.artifacts
  add column if not exists document_analysis_status text not null default 'PENDING',
  add column if not exists document_type text,
  add column if not exists document_type_override text,
  add column if not exists document_score integer check (document_score between 0 and 100);

create table if not exists public.document_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  finalization_id uuid not null references public.finalizations(id) on delete cascade,
  artifact_id uuid not null references public.artifacts(id) on delete cascade unique,
  document_type text not null default 'GENERIC' check (document_type in ('GENERIC','CONTRACT','PROPOSAL','APPLICATION','REPORT')),
  spec_key text not null default 'generic-document',
  title text,
  language text,
  score integer not null default 100 check (score between 0 and 100),
  metrics jsonb not null default '{}'::jsonb,
  structure_json jsonb not null default '{}'::jsonb,
  entities_json jsonb not null default '{}'::jsonb,
  analyzed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_findings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  finalization_id uuid not null references public.finalizations(id) on delete cascade,
  artifact_id uuid not null references public.artifacts(id) on delete cascade,
  artifact_version integer,
  rule_key text not null,
  severity text not null check (severity in ('BLOCKER','WARNING','INFO')),
  source text not null default 'DETERMINISTIC' check (source in ('DETERMINISTIC','AI','HUMAN')),
  title text not null,
  detail text,
  evidence_json jsonb not null default '{}'::jsonb,
  status text not null default 'OPEN' check (status in ('OPEN','RESOLVED','WAIVED','SUPERSEDED')),
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_references (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  finalization_id uuid not null references public.finalizations(id) on delete cascade,
  artifact_id uuid not null references public.artifacts(id) on delete cascade,
  reference_type text not null,
  reference_label text not null,
  raw_text text,
  present_in_package boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists document_profiles_fin_idx on public.document_profiles(finalization_id, analyzed_at desc);
create index if not exists document_findings_fin_gate_idx on public.document_findings(finalization_id, severity, status);
create index if not exists document_findings_artifact_idx on public.document_findings(artifact_id, created_at desc);
create index if not exists document_references_fin_idx on public.document_references(finalization_id, present_in_package);

alter table public.document_profiles enable row level security;
alter table public.document_findings enable row level security;
alter table public.document_references enable row level security;

create policy "members read document profiles" on public.document_profiles for select using (public.is_org_member(organization_id));
create policy "members read document findings" on public.document_findings for select using (public.is_org_member(organization_id));
create policy "members read document references" on public.document_references for select using (public.is_org_member(organization_id));
-- Writes remain server/service-role controlled so findings cannot be forged by a browser client.

-- Phase 4 system templates extend the same Finalization Spec mechanism from Phase 2.
insert into public.finalization_templates (organization_id, template_key, name, description, category, is_system, spec_json)
values
(null, 'contract-completeness', 'Contract Completeness', 'Execution-readiness, missing schedules, placeholders, signatures, and consistency. Not legal advice.', 'Documents', true,
 '{"documentType":"CONTRACT","requirements":[
   {"title":"Contract package assembled","category":"Document","type":"human","required":true},
   {"title":"Internal contract review completed","category":"Review","type":"human","required":false},
   {"title":"Required signatures received","category":"Signature","type":"integration","required":true}
 ]}'::jsonb),
(null, 'proposal-readiness', 'Proposal Readiness', 'Scope, pricing, timeline, acceptance, references, and client-ready completeness.', 'Documents', true,
 '{"documentType":"PROPOSAL","requirements":[
   {"title":"Proposal package assembled","category":"Document","type":"human","required":true},
   {"title":"Proposal version approved for delivery","category":"Approval","type":"human","required":true}
 ]}'::jsonb),
(null, 'submission-package', 'Application / Submission Package', 'Required attachments, dates, declaration/signature readiness, and submission completeness.', 'Documents', true,
 '{"documentType":"APPLICATION","requirements":[
   {"title":"Submission package assembled","category":"Document","type":"human","required":true},
   {"title":"Submission package owner approval received","category":"Approval","type":"human","required":true}
 ]}'::jsonb),
(null, 'report-completeness', 'Report Completeness', 'Findings, conclusion, supporting references, appendices, and unfinished-content checks.', 'Documents', true,
 '{"documentType":"REPORT","requirements":[
   {"title":"Report package assembled","category":"Document","type":"human","required":true},
   {"title":"Final report approved","category":"Approval","type":"human","required":true}
 ]}'::jsonb)
on conflict do nothing;
