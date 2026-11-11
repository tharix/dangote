# Release checklist

Use this checklist before publishing a production change.

## Local validation

- [ ] Work from a focused branch or pull request.
- [ ] Run `npm test`.
- [ ] Run `npm run check`.
- [ ] Run `npm run test:browser` and confirm every browser integration test passes.
- [ ] Manually exercise the affected workflow in a local static server.
- [ ] Export and restore a backup with sample data, including an empty project list.
- [ ] Generate the unified engineering PDF and inspect its sections and circuit page.
- [ ] Confirm the standards-review record round-trips with project saves/revisions and reports without claiming app-verified compliance.
- [ ] Treat the project owner's 2026-11-11 standards review as self-reported; record exact controlled editions, Nigerian adoption/legal basis, reviewer authorization/scope, and calculation-by-calculation evidence before any compliance claim or formula change.
- [ ] Resolve the missing IEC 60364-6 edition, incomplete surge-protection reference, load-diversity basis, and motor-design basis against the applicable Nigerian requirements.
- [ ] Confirm no electrical sizing formula is described as standards-compliant without documented qualified review.
- [ ] Check keyboard focus, reduced-motion behavior, and mobile layout.
- [ ] Confirm no credentials, generated files, or external runtime dependencies were added.

## Review and merge

- [ ] Update the relevant documentation and tests.
- [ ] Obtain the required CODEOWNER review.
- [ ] Confirm the quality workflow is green.
- [ ] Confirm the deployment workflow is green.
- [ ] If cloud features are enabled, apply and verify the Supabase schema/RLS on a test project first.
- [ ] Merge only after the pull request checks pass.

## Production verification

- [ ] Open the GitHub Pages URL after deployment.
- [ ] Check the browser console for errors.
- [ ] Verify offline behavior when the network is unavailable.
- [ ] Record the release commit in the team change log.
