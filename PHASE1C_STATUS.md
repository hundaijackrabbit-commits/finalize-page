# Finalize.page — Phase 1C Trust Processing

Phase 1C moves uploaded artifacts from **untrusted storage** into an explicit, auditable processing lifecycle before any AI analysis is allowed.

## Artifact security gate

`UPLOADING → QUARANTINED → SCANNING → PROCESSING → READY`

Failure paths: `REJECTED`, `INFECTED`, `FAILED`. `safe_for_ai` defaults to `false` and is only promoted after required security/privacy jobs pass.

## Durable processing jobs

Postgres-backed queue with atomic `FOR UPDATE SKIP LOCKED` claiming, leases, idempotent job keys, exponential retries, and dead-letter state.

Pipeline jobs:

1. `VALIDATE_SIGNATURE`
2. `HASH_SOURCE`
3. `ARCHIVE_SAFETY`
4. `MALWARE_SCAN`
5. `PRIVACY_SCAN`
6. `PARSE_DOCUMENT`
7. `REDACT_DERIVED`
8. `PROMOTE_READY`

## Malware

Production promotion requires a clean malware result. Phase 1C supports:

- `FINALIZE_MALWARE_MODE=guardduty`: waits for an authenticated malware-result event and does not promote prematurely.
- `FINALIZE_MALWARE_MODE=trusted_dev`: development-only clean result. Refused when `NODE_ENV=production`.

## Privacy firewall

Privacy scans run only after malware is clean. Extracted text is inspected for common personal identifiers. Derived AI text replaces detected identifiers with stable category tokens; originals remain immutable.

## Archives

ZIP/Office containers are inspected from the ZIP central directory before extraction. The worker rejects path traversal, excessive entry counts, extreme expansion ratios, and declared uncompressed sizes over the configured ceiling.

## Retention

Artifacts can carry `retention_delete_after`; a cleanup worker hook can delete source and derived objects after policy expiry. Finalization metadata/fingerprints can outlive source content according to policy.
