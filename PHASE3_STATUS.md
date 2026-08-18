# Phase 3 — Privacy & Data Control

Phase 3 turns Finalize's trust foundation into a customer-facing privacy product and enforces workspace privacy policy in the backend.

## Added

- Workspace Privacy Center at `/app/privacy`
- Privacy posture score and exposure summary
- Organization-level sensitive-data inventory
- AI Privacy Firewall policy controls
- Backend AI eligibility enforcement during artifact promotion
- Distinct controls for Business, Confidential, and Restricted artifact classes
- Mandatory-redaction option before AI eligibility
- Fixed `trainingUse: NEVER` product policy marker (does not claim third-party provider behavior)
- Workspace retention defaults for source, derived, and evidence data
- Guest-link TTL policy
- Automatic guest-link revocation option at Finalization
- Automatic encrypted-credential destruction option at Finalization
- Retention deadlines assigned at member and guest upload time
- Disposal request queue and privacy event log
- Workspace privacy export that intentionally excludes raw files, secret payloads, and guest token values
- Bulk guest-link revocation
- Bulk live-credential destruction
- Artifact deletion scheduling
- Retention worker updates disposal request status and privacy audit events
- Per-Room Privacy tab showing sensitive findings, AI eligibility, and privacy closeout
- Artifact records now expose policy decision reason/version to authorized members

## Data model

Run `supabase/phase3-migration.sql` after the earlier migrations.

New tables:
- `workspace_privacy_settings`
- `privacy_disposal_requests`
- `privacy_events`

New artifact fields:
- `ai_policy_decision`
- `ai_blocked_reason`
- `privacy_policy_version`

## Important boundary

`READY` still means the artifact passed secure storage/processing gates. It does **not** imply AI eligibility. `safe_for_ai` is now produced by the privacy policy engine and can remain false even for a READY artifact.
