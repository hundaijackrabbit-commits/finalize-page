# Finalize.page

> **Current build: Phase 4 — Finalize Documents**  
> Finalize is the completion layer for work: **verify → resolve → prove**.

Phase 4 adds evidence-backed document and package completion on top of the existing Finalize Rooms, agency workflow, secure artifact pipeline, and Privacy Firewall.

## What Finalize does now

A Finalization can coordinate:

- definition-of-done requirements
- client/no-account review
- version-sensitive approvals
- secure requested-file uploads
- encrypted access/credential requests
- payment completion gates
- privacy closeout
- immutable Finalization Records
- PDF/DOCX/PPTX/XLSX/TXT/Markdown/CSV/JSON document analysis
- missing Schedule/Exhibit/Appendix/Attachment detection
- specialized Contract / Proposal / Application / Report checks
- package-level consistency observations
- optional privacy-gated semantic AI review

## Core trust path

```text
browser
  ↓ direct multipart upload
private S3
  ↓
QUARANTINED
  ↓
file signature + source SHA-256 + archive safety
  ↓
malware gate
  ↓
local document extraction
  ↓
privacy scan + redacted derivative
  ↓
READY
  ├─ deterministic document checks
  └─ optional semantic AI review only if Privacy Firewall allows it
```

`READY` and `safe_for_ai` remain separate states. Finalize can securely process a Restricted document for human workflow while still blocking it from external AI.

## Phase 4 document model

Each supported artifact can have:

- `document_profile` — inferred/overridden type, Finalization Spec, structure, entities, score
- `document_findings` — evidence-backed BLOCKER/WARNING/INFO findings, status, source and artifact version
- `document_references` — Schedule/Exhibit/Appendix/Annex/Attachment references and package-presence status

OPEN document blockers for the current artifact version are part of the same hard completion gate as unresolved client actions, payments, privacy items and review feedback.

AI findings are warnings by default. A human must explicitly promote an AI finding to a blocker.

See `PHASE4_STATUS.md` for the full feature/trust boundary and `PHASE4_VALIDATION.md` for validation results.

## Database setup

For a fresh Supabase project, run in order:

1. `supabase/phase1-schema.sql`
2. `supabase/phase1b-migration.sql`
3. `supabase/phase1c-migration.sql`
4. `supabase/phase2-migration.sql`
5. `supabase/phase3-migration.sql`
6. `supabase/phase4-migration.sql`

## Environment

Copy `.env.example` to `.env.local` and configure the Supabase, private S3, worker and vault settings needed by earlier phases.

Phase 4 optional semantic-review settings:

```bash
FINALIZE_DOCUMENT_TEXT_MAX_BYTES=26214400
FINALIZE_DOCUMENT_AI_ENDPOINT=
FINALIZE_DOCUMENT_AI_API_KEY=
FINALIZE_DOCUMENT_AI_MODEL=
FINALIZE_DOCUMENT_AI_MAX_CHARS=70000
FINALIZE_DOCUMENT_AI_TIMEOUT_MS=45000
```

Leave the AI settings empty to run deterministic document checks only.

## Local development

```bash
npm install
npm run dev
```

Run trust/document processing in another terminal:

```bash
npm run worker:processing
```

For local-only pipeline testing, `FINALIZE_MALWARE_MODE=trusted_dev` is available and is explicitly refused in production. Production should use an external malware result adapter.

## Security / privacy principles

- private object storage; no permanent public artifact URLs
- original source objects remain immutable
- quarantined uploads are not available to AI
- service-role/server-controlled processing mutations
- tenant-scoped reads/writes
- guest Room responses do not expose internal artifact/privacy records
- privacy-minimized AI derivative is separate from source/extracted text
- AI findings never become machine-enforced blockers without human confirmation
- destructive workspace privacy controls remain owner/admin scoped
- retention/disposal and guest/credential cleanup are auditable

## Roadmap

- Phase 0 — Website Finalizer acquisition scanner
- Phase 1 — Finalize Rooms + trust foundation
- Phase 2 — Agency Completion
- Phase 3 — Privacy & Data Control
- **Phase 4 — Finalize Documents (current)**
- Phase 5 — integrations / external completion events
- Phase 6 — Finalize API / completion infrastructure

## Product boundary

Finalize is not trying to replace project managers, document editors, payment processors, e-signature providers, or legal counsel. It is designed to determine **what still prevents work from being finished**, coordinate the resolution, and preserve proof of what was finalized.


## Phase 5 — Integrations & External Evidence

Finalize can now bind external provider facts to completion requirements. GitHub and Vercel support server-side pull verification; Stripe, GitHub and generic/provider-forwarded events can enter through signed webhook adapters. Raw provider payloads are hashed and discarded after normalization. If a later provider fact contradicts a previously finalized condition, the Finalization reopens and the prior record remains preserved as superseded history.

Run `supabase/phase5-migration.sql` after the Phase 4 migration and configure the Phase 5 environment variables from `.env.example`.
