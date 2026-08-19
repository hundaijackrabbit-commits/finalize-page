# Phase 5 — Integrations & External Evidence

Phase 5 turns external systems into evidence sources for Finalization requirements.

## Built

- Workspace-scoped integration connection metadata for GitHub, Vercel, Stripe, e-signature, Google Drive, and generic webhooks.
- Server-only integration secret table. Browser-readable metadata never includes tokens/secrets. Non-Stripe connections receive a per-connection webhook secret that is encrypted with the Finalize vault and returned only at creation; Stripe can store its provider-issued signing secret encrypted per connection.
- Explicit Finalization bindings: provider signal → exact external identity matcher → expected state → optional requirement.
- Signed webhook ingestion with GitHub HMAC-SHA256 and Stripe-style timestamped HMAC verification.
- Generic HMAC adapter for Vercel/e-sign/Drive/custom event forwarding.
- Raw webhook payloads are **not retained**. Finalize stores SHA-256 + normalized/minimized evidence.
- Duplicate-event protection using provider event IDs.
- External evidence ledger with PASS / FAIL / INFO outcomes.
- Requirements automatically pass/reopen when bound evidence reaches/leaves the expected state.
- If later external evidence contradicts an already-finalized item, Finalize supersedes the active record, invalidates approval, and reopens the Finalization instead of rewriting history.
- GitHub pull sync: latest Actions workflow can be verified server-side with `GITHUB_TOKEN`.
- Vercel pull sync: latest deployment can be verified server-side with `VERCEL_TOKEN`.
- Finalization Records now retain external evidence used during completion.
- Workspace `/app/integrations` control page.
- Per-Room Integrations tab with connection cards, bindings, webhook path, sync action, and evidence ledger.
- Demo integration signals for Stripe, Vercel, and GitHub.
- New Phase 5 system specs: Software Release and Paid Client Handoff.

## Trust rules

1. External events cannot mutate a Finalization unless there is an explicit binding.
2. Browser clients cannot create trusted external evidence directly.
3. Raw provider payloads are hashed and discarded after normalization.
4. Provider secrets are server-only.
5. A later FAIL can reopen previously FINALIZED work; sealed history remains preserved as superseded.
6. Provider evidence supplements Finalize's own rules, document analysis, privacy gates, and human approval. It does not bypass them.

## Provider maturity

- **GitHub:** signed webhook normalization + pull sync.
- **Vercel:** pull sync via REST API; signed Finalize-forwarded webhook supported.
- **Stripe:** signed event normalization for successful/failed/refunded payments and invoices.
- **E-signature:** normalized envelope adapter; production provider OAuth/webhook registration remains deployment configuration.
- **Google Drive:** normalized file-change adapter; production OAuth/watch-channel setup remains deployment configuration.
- **Generic:** signed HMAC completion signal.

## Database

Run `supabase/phase5-migration.sql` after Phase 4.
