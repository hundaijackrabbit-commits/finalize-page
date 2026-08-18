# Phase 1B build notes

## Product goal
Move Finalize Rooms across the first real trust boundary: authenticated persistent workspaces, server-enforced completion actions, scoped guest access, and secure direct-to-storage artifact ingestion.

## Architecture decisions

### Client is not authority
The browser can request a requirement change, approval or Finalize action, but production-mode server endpoints perform organization scoping and gate checks before persistence.

### Guest access is capability-scoped
A guest URL contains a high-entropy token. Only its SHA-256 hash is stored. The server checks expiry/revocation and scopes actions to the associated participant/finalization.

### Files bypass application servers
Browser file bytes upload directly to S3 using short-lived presigned URLs. This avoids Vercel/function body-size limits and supports large resumable-style multipart workflows.

### Files remain untrusted
Successful transfer promotes an Artifact only to `QUARANTINED`, never `READY`. Security/privacy processing is a separate lifecycle.

## Implemented lifecycle

`UPLOADING → QUARANTINED`

Next build:

`QUARANTINED → SCANNING → PROCESSING → READY | REJECTED | INFECTED | FAILED`

## Still intentionally incomplete
- malware scanning worker
- magic-byte/content signature validation after object arrival
- ZIP decompression safety inspection
- PII/privacy classifier
- derived artifact generation
- durable job queue/retry/dead-letter processing
- multipart session resume after a full page reload
- organization invitation UI
- password reset / MFA / enterprise auth

Those are next because pretending they exist would undermine the trust model.
