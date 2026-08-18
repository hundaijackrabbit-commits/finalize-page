# Phase 4 — Finalize Documents

Phase 4 turns trusted artifacts into evidence-backed document Finalizations. It extends the Phase 1–3 security/privacy foundation; source files still pass quarantine, malware, parsing and the Privacy Firewall before any optional semantic AI review.

## Product surface

A new **Documents** tab inside each Finalize Room provides:

- package readiness score and document-by-document scores
- automatic classification: General, Contract, Proposal, Application/Submission, Report
- owner override of document type, with Finalization version bump and prior-approval invalidation
- evidence-backed blocker/warning ledger
- resolve, waive, reopen and human-confirm-as-blocker actions
- cross-document Schedule / Exhibit / Appendix / Annex / Attachment presence checks
- package-level currency/entity consistency observations
- privacy-aware AI eligibility state
- package re-analysis and per-document re-analysis
- privacy-minimized JSON document report export
- explicit contract boundary: completeness review, not legal advice

## Deterministic checks

Deterministic review operates on Finalize's internal extracted derivative after the malware gate. It does not require external AI and can identify:

- unresolved placeholders (`TBD`, template markers, blank fields)
- missing referenced schedules/exhibits/appendices/attachments
- signature-readiness cues and blank signature fields
- missing parties/effective date for contract completeness
- scope/pricing/acceptance signals for proposals
- applicant/date/declaration signals for submissions
- findings/conclusion/source structure for reports
- mixed currency notation
- structured package metadata for cross-document comparison

An OPEN deterministic `BLOCKER` is part of the server-side Finalization gate. Warnings are advisory.

## Document parsers

Phase 4 includes local/native extraction for:

- PDF — conservative text-operator/Flate stream extraction
- DOCX — OOXML document/header/footer/comment text
- PPTX — slide XML text
- XLSX — shared strings and worksheet text
- TXT / Markdown / CSV / JSON — plain text

Images and generic ZIP archives remain `LIMITED` until a privacy-aware vision/archive-document adapter is introduced.

## Privacy + AI boundary

Semantic AI review is optional. It only runs when both conditions are true:

1. Phase 3 Privacy Firewall marks the artifact `safe_for_ai=true`.
2. Finalize can load that artifact's `derived/ai-safe.txt` privacy-minimized copy.

The AI adapter never receives `storage_key`, source bytes or `extracted_text_key`. Its prompt treats document text as untrusted data. AI-origin findings are always created as `WARNING`; a human must explicitly promote one to a blocker.

Provider settings are generic OpenAI-compatible JSON chat settings in `.env.example`.

## Version-sensitive completion

Document findings carry the current Finalization artifact version.

- Uploading a new artifact bumps the Finalization version.
- Adding a document re-queues analysis for all READY documents so package references can change from missing to present.
- Changing a document's classification bumps the version because the definition of done changed.
- Old human decisions are superseded instead of silently applying to a newer version.
- Only blockers for the current version can block approval/finalization.
- A READY document whose analysis is still pending also blocks approval until checks complete.

This prevents stale findings or stale approvals from sealing a changed package.

## Proof / exports

Phase 4 extends:

- Finalization Records with document profile, finding, reference and package-observation proof
- handoff manifests with document findings/references/package observations
- privacy-minimized document report exports

The report intentionally excludes source text, evidence snippets, AI-safe derivatives, secrets and guest tokens.

## Database

Run after Phase 3:

`supabase/phase4-migration.sql`

It adds document analysis columns, `document_profiles`, `document_findings`, `document_references`, member read policies, and system Document Finalization templates. Writes remain server/service-role controlled.

## Deliberate boundaries

Phase 4 is not a legal-opinion engine, a document editor, or a generic AI chat product. It answers a narrower question: **what evidence shows this document package is—or is not—ready to be finalized?**
