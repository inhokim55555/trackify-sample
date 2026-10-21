# Trackify Sample Repo

A standalone portfolio sample adapted from application source at revision `ed238dfd1def45be3bf16c1e5d997a5ea2f96009`. This repository starts with a fresh history and contains no production database or credentials.

Creator campaigns, collections and video metrics with an embedded local database. Social metrics and mailbox connections are simulated. All seeded people, addresses and campaign records are fictional.

## Run locally

1. Install Node.js 24, then download and extract this repository.
2. Open a terminal in this folder and run `npm ci`. This installation needs internet access.
3. Run `npm run build`.
4. Run `npm start` (or double-click `START SAMPLE.cmd` after the first build), then open http://127.0.0.1:4294/. Press Ctrl+C in the terminal to stop.

Run `npm test` for the included security regression checks.

## Sample boundaries

Use only fictional information. The app intentionally has a local sample identity instead of production sign-in. Do not deploy it publicly as a hosted service or enter real customer information. The launcher binds to your computer only, uses fixed local database addresses and rejects external service calls. These controls are application safeguards, not an operating-system sandbox.

Local database state lives in ignored `sample-state/`; TaskTrack browser edits remain in browser storage. The repository excludes dependencies, generated builds, runtime state, environment files and original Git history.

## Security review

See [SECURITY-UPDATE.md](SECURITY-UPDATE.md) for the dependency remediation and verification. The full dependency audit now reports zero known vulnerabilities, including development dependencies. Run `npm run audit:security` to check current advisories.

[SECURITY-REVIEW.md](SECURITY-REVIEW.md) preserves the original review and its scope limitations; its nine deferred dependency entries were subsequently resolved by this update. An audit does not guarantee absence of vulnerabilities.

The styling engine requires a modern browser: Chrome 111+, Safari 16.4+, or Firefox 128+.
