# Post-merge verification checklist

This document explains how to verify Firestore rules and manager access after merges to `main`.

Why: Firestore rules changes only take effect when deployed. Merged fixes for manager access and CI stability must be validated in staging/production so real manager users (who may only have `isManager: true` in `/users/{uid}`) can use manager views without permission errors.

## What the included workflow does

- Runs lint and the full test suite on `main` after merges.
- Runs Playwright E2E tests if Playwright config is present.
- Optionally performs simple HTTP smoke checks against a staging URL when `STAGING_URL` and `TEST_MANAGER_TOKEN` secrets are provided.

## How to run locally

- Run unit/tests: `npm ci && npm test`
- Run Firestore emulator for rules tests:
  - `npx firebase emulators:start --only firestore`
  - In another shell, run the rules tests: `npm run test:rules` or `npx vitest run tests/firestore-rules`

## Manual verification steps after deploying rules to staging/production

1. Deploy firestore.rules to the target environment (staging).
2. Confirm the deployment succeeded: `firebase deploy --only firestore:rules --project your-staging-project`.
3. As a real manager user (one who has `/users/{uid}.isManager == true` but no custom claims), attempt to load manager views that list users and orders.
4. Check browser console and server logs (Cloud Run) for `FirebaseError: Missing or insufficient permissions`.
5. If permission errors occur:
   - Verify the deployed rules match the repo: `firebase deploy --only firestore:rules` and inspect the rules source in the deployed project.
   - Verify the manager user document exists and has `isManager: true` at `/users/{uid}`.

## Optional: configure GitHub Actions secrets

- STAGING_URL: URL for staging app (e.g., `https://staging.example.com`)
- TEST_MANAGER_TOKEN: a short-lived test manager token or Bearer token for an endpoint that can verify manager-only access (optional). The workflow will skip manager verification if this is not present.

### Token security best practices

- Use short-lived tokens that expire within hours or days
- Generate tokens specifically for CI testing, not production admin tokens
- Rotate tokens regularly and immediately if compromised
- Consider using GitHub Actions OIDC for token generation if your identity provider supports it
- Never commit tokens to source control

## Troubleshooting

- If Playwright fails due to port conflicts, check that `playwright.config.ts` has `reuseExistingServer: true` or adjust CI to reuse a server.
- Use the uploaded workflow artifacts (test logs & reports) to see failing tests.
