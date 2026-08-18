# Phase 3 Validation

Validated in the build environment on 2026-08-18:

- 55 JS/JSX/MJS source files parsed with the installed TypeScript parser: **0 syntax diagnostics**.
- Relative import scan: **0 missing relative imports**.
- Node syntax checks passed for non-JSX server/worker modules.
- AI privacy policy smoke test passed:
  - BUSINESS + completed privacy scan/redaction -> eligible by default.
  - CONFIDENTIAL -> blocked by default (`confidential_ai_processing_disabled`).
  - RESTRICTED -> blocked by default (`restricted_ai_processing_disabled`).
- Phase 3 tables enable RLS; destructive workspace privacy actions require owner/admin server authorization.
- Privacy export source does not query `encrypted_payload` or `token_hash`.
- Workspace privacy inventory queries are explicitly scoped to the authenticated organization even when service-role access is used.
- Member and guest upload routes inherit the workspace source-retention default.
- Finalization guest-link TTL now comes from workspace privacy policy rather than a hard-coded seven days.
- Retention worker records disposal completion/failure in the Phase 3 privacy lifecycle.

## Build limitation

`npm install --no-audit --no-fund` timed out in this execution environment, so a full `next build` could not be run here. Run the following in a normal npm-connected checkout before deployment:

```bash
npm install
npm run build
```

Then apply `supabase/phase3-migration.sql` after the earlier migrations and test against configured Supabase/S3 services.
