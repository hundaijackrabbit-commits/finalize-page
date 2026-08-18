
## Phase 3 — Privacy & Data Control

Phase 3 adds a workspace Privacy Center and an enforceable Privacy Firewall. Privacy policy now controls AI eligibility, retention defaults, guest-link lifetime, credential cleanup, and disposal/audit behavior. Run `supabase/phase3-migration.sql` after the Phase 2 migration. See `PHASE3_STATUS.md` for the full scope.

# Finalize.page

> **Current build: Phase 2 — Agency Completion.** See `PHASE2_STATUS.md` for the feature/security boundary and production setup.

Finalize is the completion layer for work: **verify → resolve → prove**.

Phase 2 keeps the Phase 1 trust foundation intact and adds the agency-grade completion layer: branded client Rooms, visual review, requested-file uploads, encrypted access requests, payment gates, version-bound approvals, privacy closeout, and handoff proof.

## Trust boundary inherited from Phase 1C

```text
browser
  ↓ direct multipart upload
private S3
  ↓
QUARANTINED
  ↓
file signature / source SHA-256 / archive safety
  ↓
malware gate
  ↓
safe parsing
  ↓
privacy scan
  ↓
redacted derived processing copy
  ↓
READY

safe_for_ai = true only when the privacy-minimized derivative exists
```

The original customer object remains immutable. Derived text and AI-safe copies are stored separately under the artifact prefix.

## What is implemented

### Durable processing queue
- Postgres-backed `processing_jobs`
- atomic `FOR UPDATE SKIP LOCKED` claiming
- worker leases so abandoned jobs can be reclaimed
- idempotent `(artifact_id, job_type)` job identity
- exponential retry scheduling
- dead-letter state after repeated failures
- per-artifact processing-event history
- authenticated internal worker endpoint
- standalone worker loop (`npm run worker:processing`)

### Quarantine / file validation
- upload remains `QUARANTINED` after transfer
- extension + magic-byte/content-signature validation
- full-source SHA-256 computed server-side from stored bytes
- declared/stored size integrity from Phase 1B remains in place
- mismatched file signatures are rejected before parsing

### ZIP / Office-container safety
ZIP, DOCX, XLSX and PPTX containers are inspected through the central directory before any extraction. Checks include:
- directory bounds
- entry-count ceiling
- total declared expansion ceiling
- expansion-ratio ceiling
- absolute / drive / `..` traversal paths

The inspector is intentionally conservative. ZIP64/very unusual archives can be rejected or routed to a future hardened archive service rather than being optimistically extracted.

### Malware gate
`FINALIZE_MALWARE_MODE=guardduty` is the production default.

The malware job enters `WAITING_EXTERNAL`. An authenticated security adapter posts the final result to:

`POST /api/internal/artifact-security-event`

with `x-finalize-worker-secret` and:

```json
{
  "artifactId": "...",
  "result": "CLEAN",
  "provider": "guardduty",
  "eventId": "..."
}
```

Supported results: `CLEAN`, `INFECTED`, `FAILED`.

`FINALIZE_MALWARE_MODE=trusted_dev` exists for local development only and is explicitly refused when `NODE_ENV=production`.

### Safe parsing + privacy firewall
- TXT/Markdown: local UTF-8 parsing
- PDF: conservative best-effort text derivative in this phase
- Office containers/images/oversized documents: marked `LIMITED` until a hardened parser/vision adapter is configured
- privacy detector inventories common email, phone, SIN-like, payment-card-like and IP-address patterns
- payment-card candidates require Luhn validation
- privacy findings are stored separately from source files
- redacted AI-safe text replaces detected values with category tokens
- `safe_for_ai` remains **false** if Finalize could not produce and privacy-scan a text derivative

This means `READY` means the artifact passed the storage/security workflow. It does **not** automatically mean raw customer content can be sent to an AI model.

### Retention hook
Artifacts can carry `retention_delete_after`.

`POST /api/internal/retention/run` removes every object under that artifact prefix, marks content `DELETED`, clears AI eligibility and writes an audit event. Finalization metadata/fingerprints can remain according to policy without keeping the private source bytes.

### Customer-visible processing UX
The Files panel now exposes:
- overall artifact state
- signature status
- archive status
- malware status
- parser status
- privacy status
- AI-copy/redaction status
- source SHA-256
- detected privacy categories/counts
- whether a privacy-minimized AI copy is actually ready
- retry-from-quarantine for failed non-malware processing

## Database setup

Fresh Supabase project:

1. `supabase/phase1-schema.sql`
2. `supabase/phase1b-migration.sql`
3. `supabase/phase1c-migration.sql`
4. `supabase/phase2-migration.sql`

Phase 1C writes are service-role/server-only. Workspace members receive read policies for job/progress/privacy metadata; they do not get arbitrary client-side queue mutation privileges.

## Environment

Copy `.env.example` to `.env.local` and configure Supabase + S3 from Phase 1B, then add:

```bash
FINALIZE_WORKER_SECRET=<long-random-secret>
FINALIZE_MALWARE_MODE=guardduty
FINALIZE_BASE_URL=http://localhost:3000
```

Optional processing ceilings are documented in `.env.example`.

## Local processing

Terminal 1:

```bash
npm install
npm run dev
```

Terminal 2:

```bash
npm run worker:processing
```

For local-only end-to-end pipeline testing:

```bash
FINALIZE_MALWARE_MODE=trusted_dev
```

Never use that mode in production.

## Production worker model

Run the Next.js app normally, then run one or more worker processes against the authenticated worker endpoint. The database claim function prevents two workers from claiming the same active job. In a larger deployment this HTTP worker can later be replaced by SQS/Cloudflare Queues/etc. without changing the artifact state model.

Malware scanning should be fed by a real provider (for example, an S3 malware-scanning integration) into the security-event adapter. Do not automatically translate “uploaded” into “clean.”

## S3 CORS

The Phase 1B direct-upload CORS rule still applies. The bucket must remain private. Browser upload needs `PUT` and exposed `ETag`; processing workers use server credentials and do not require public object URLs.

## Known trust-processing boundaries

This is deliberately the **trust-processing foundation**, not the later Document Finalizer.

- PDF extraction is best-effort, not legal-grade document parsing.
- DOCX/XLSX/PPTX are archive-safety checked but content extraction waits for a hardened parser adapter.
- Images require a privacy-aware vision/OCR adapter before becoming `safe_for_ai`.
- malware scanning requires the external provider event in production.
- retention scheduling UI/policies become richer in Phase 3; Phase 1C provides the enforcement hook.

Those limitations fail closed: they reduce AI eligibility instead of silently exposing unprocessed customer data.

## Roadmap

- Phase 0 — Website Finalizer acquisition scanner
- **Phase 1 — Finalize Rooms + trust foundation**
  - Phase 1A — Room UX / completion loop
  - Phase 1B — auth, persistence, guest grants, secure multipart intake
  - Phase 1C — quarantine, privacy firewall, durable processing
- **Phase 2 — Agency Completion (this build)**
  - branded no-account client rooms
  - reusable Finalize Specs
  - visual review + version history
  - requested-file guest uploads
  - encrypted credential/access requests
  - payment completion gates
  - version-bound approvals
  - privacy closeout + handoff manifest
- Phase 3 — richer customer-facing privacy controls and cleanup
- Phase 4 — Document Finalizer
- Phase 5 — integrations
- Phase 6 — Finalize API / completion infrastructure