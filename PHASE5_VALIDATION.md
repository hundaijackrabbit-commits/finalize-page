# Phase 5 validation notes

Validation performed in the build environment:

- Node syntax checks run for non-JSX Phase 5 server modules and route handlers.
- Relative import resolution checked across the project.
- Phase 5 migration reviewed for tenant scoping and RLS boundaries.
- Integration secret table intentionally has no member-read policy.
- External event table intentionally has no member-read policy; UI uses minimized `external_evidence` only.
- GitHub/Stripe HMAC verification logic smoke-tested with generated signatures.
- Event normalization smoke-tested for GitHub workflow success, Stripe payment success/refund, and Vercel ready/failed states.
- Binding match behavior smoke-tested.
- ZIP archive integrity checked after packaging.

Environment limitation: a full `npm install && npm run build` may require normal registry access and configured external services. Run the production build locally/CI after installing dependencies.
