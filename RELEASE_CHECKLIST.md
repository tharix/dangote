# Release checklist

Use this checklist before publishing a production change.

## Local validation

- [ ] Work from a focused branch or pull request.
- [ ] Run `npm test`.
- [ ] Run `npm run check`.
- [ ] Open `tests/browser-test.html` and confirm every test passes.
- [ ] Manually exercise the affected workflow in a local static server.
- [ ] Confirm no credentials, generated files, or external runtime dependencies were added.

## Review and merge

- [ ] Update the relevant documentation and tests.
- [ ] Obtain the required CODEOWNER review.
- [ ] Confirm the quality workflow is green.
- [ ] Confirm the deployment workflow is green.
- [ ] Merge only after the pull request checks pass.

## Production verification

- [ ] Open the GitHub Pages URL after deployment.
- [ ] Check the browser console for errors.
- [ ] Verify offline behavior when the network is unavailable.
- [ ] Record the release commit in the team change log.
