# Contributing

## Branches and reviews

- Create a focused branch from the default branch.
- Keep commits small and explain user-visible or engineering-rule changes.
- Open a pull request with test evidence and screenshots for UI changes.
- Require one peer review before merging.

## Before opening a pull request

1. Run `npm test` when Node.js is available.
2. Open `tests/browser-test.html` and confirm every test is green.
3. Serve the project locally and exercise the affected workflow.
4. Confirm no new external runtime dependency was added without an offline fallback.

Do not commit credentials, generated build output, or user-local browser data.
