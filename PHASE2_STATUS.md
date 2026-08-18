# Finalize.page Phase 2 — Agency Completion

Phase 2 turns the Phase 1 trust foundation into an agency-facing completion product. It does **not** attempt to replace CRM, project-management, e-signature, or accounting systems. It coordinates and proves the remaining conditions required to call client work finished.

## Included in this build

### Client-facing completion desk
- Branded guest Rooms with configurable agency name/accent and custom-domain configuration metadata.
- No-account guest review with scoped, expiring, hashed access grants.
- Visual website review surface with coordinate annotations tied to the current artifact version.
- Guest project notes and version-bound final approval.
- Client file requests with accepted-extension policies.
- **Real guest multipart file uploads** into the same private S3 quarantine/trust-processing pipeline as member uploads.
- Secure credential/access requests using AES-256-GCM when `FINALIZE_VAULT_KEY` is configured.
- Payment completion gates with manual completion plus a generic HMAC webhook adapter.

### Completion intelligence
- Readiness now considers requirements, file requests, secure requests, payments, privacy closeout, and unresolved current-version review feedback.
- Root-blocker grouping surfaces likely root completion causes instead of presenting every problem as an independent task.
- New artifact uploads atomically increment the Finalization artifact version and supersede pending/approved reviews of older versions.
- Immutable `finalization_versions` events preserve version history.
- Approval can only satisfy the Finalize gate when its artifact version matches the current artifact version.

### Finalize Specs
- Reusable system templates: Agency Website Launch, Creative Delivery, Client Handoff.
- New Rooms can be created from a machine-readable definition of done instead of an empty project board.

### Closeout + proof
- Privacy closeout items can block completion until temporary access/data obligations are resolved or intentionally scheduled/waived.
- Handoff manifest endpoint exports a portable JSON snapshot of requirements, evidence, artifact hashes, approval, payments, requests, and privacy status.
- Encrypted credential payloads are **never** included in guest responses or handoff manifests.
- Finalization records now include payment and privacy-closeout proof metadata.
- Finalizing revokes active guest links and destroys submitted vault secrets.

### Reminder + integration scaffolding
- Client reminders are queued as durable reminder records.
- Optional internal reminder delivery endpoint can forward due reminders to an external email adapter.
- Generic signed payment webhook supports a provider adapter without coupling Phase 2 to a specific payment processor.

## Required production configuration

Run migrations in order:
1. `supabase/phase1-schema.sql`
2. `supabase/phase1b-migration.sql`
3. `supabase/phase1c-migration.sql`
4. `supabase/phase2-migration.sql`

Configure Supabase + S3 as described in `.env.example`.

For secure credential/access requests, set `FINALIZE_VAULT_KEY` to a random 32-byte key encoded as base64 or 64-character hex. Never expose it to the browser.

For guest multipart uploads, your private S3 bucket CORS policy must allow the Finalize origin to `PUT` signed part URLs and expose the `ETag` response header. Do not make the bucket public.

## Explicit limitations / next production work

- Custom-domain values are stored and surfaced but automated DNS verification/provisioning is not implemented.
- Visual review currently uses Finalize's review surface. Production webpage screenshot capture and PDF/image rendering adapters should replace the mock review canvas for real artifacts.
- Payment processing is not reimplemented. Use the HMAC adapter or a provider adapter (for example Stripe) to update a payment gate.
- Reminder records can be delivered through the configured email webhook adapter; Finalize does not bundle an email provider.
- Secure secret retrieval is intentionally absent from the normal Room UI. Phase 2 stores secrets encrypted and exposes status/destruction, not plaintext. A future privileged reveal flow should require re-authentication and enhanced audit logging.
- Guest file uploads are implemented for requested files. The browser demo simulates them when production storage is not configured.
