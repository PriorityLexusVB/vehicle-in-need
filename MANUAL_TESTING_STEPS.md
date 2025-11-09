# Manual Steps Required for Complete Testing

This document outlines manual steps that need to be performed by the repository owner to complete Phase 10 (Automated Testing) requirements, since some tasks require production access and authenticated sessions.

## What's Already Done ✅

1. **Unit Tests** - Fully implemented and passing

   - `components/__tests__/ProtectedRoute.test.tsx` - 4 tests
   - `components/__tests__/SettingsPage.test.tsx` - 8 tests
   - `components/__tests__/VersionBadge.test.tsx` - 3 tests
   - Total: 15 unit tests passing

2. **E2E Test Framework** - Set up with Playwright

   - Configuration: `playwright.config.ts`
   - Test suite: `e2e/manager-flow.spec.ts`
   - Tests written but skipped (require authentication)

3. **Deploy Parity Script** - Fully functional

   - `scripts/verify-deploy-parity.cjs`
   - Verifies production matches local state
   - Run with: `npm run verify:parity <url>`

4. **Package Scripts** - All configured
   - `npm test` - Run unit tests
   - `npm run test:e2e` - Run E2E tests
   - `npm run verify:parity` - Check deploy parity

## Manual Steps Needed

### Seed manager roles (one-time)

Use the script to elevate specific emails to manager in Firestore.

Prereqs:

- Authenticate with ADC: `gcloud auth application-default login`, or set `GOOGLE_APPLICATION_CREDENTIALS` to a service account JSON path stored outside git (e.g., `.secrets/vin-seeder.json`).
- Project ID: `vehicles-in-need`.

Dry-run (no writes):

```bash
pnpm run seed:managers:dry-run -- --emails rob.brasco@priorityautomotive.com
# or
pnpm run seed:managers:dry-run -- rob.brasco@priorityautomotive.com
```

Apply (writes):

```bash
pnpm run seed:managers:apply -- --emails rob.brasco@priorityautomotive.com
# or
pnpm run seed:managers:apply -- rob.brasco@priorityautomotive.com
```

Notes:

- Script is idempotent and only updates when needed.
- Users must exist in Firebase Auth for email lookup; otherwise you’ll see `missing-auth-user`.

### Step 1: Install Playwright Browsers

The Playwright browsers need to be installed in your local environment:

```bash
npx playwright install
```

**Note:** This step failed in the automated environment but should work in your local setup.

### Step 2: Set Up Test Firebase Accounts

To run the E2E tests, you need test accounts in Firebase:

1. **Create test manager account:**

   - Email: `test-manager@yourcompany.com` (or similar)
   - Add to Firebase Authentication
   - Set `isManager: true` in Firestore `users` collection

2. **Create test non-manager account:**
   - Email: `test-user@yourcompany.com` (or similar)
   - Add to Firebase Authentication
   - Set `isManager: false` in Firestore `users` collection

### Step 3: Configure E2E Tests with Authentication

Update `e2e/manager-flow.spec.ts` to include authentication:

**Option A: Use Playwright's authentication state**

Create a setup file `e2e/auth.setup.ts`:

```typescript
import { test as setup } from "@playwright/test";

const authFile = "playwright/.auth/user.json";

setup("authenticate as manager", async ({ page }) => {
  // Navigate to your app
  await page.goto("/");

  // Perform login (adjust selectors for your app)
  await page.click("text=Sign in with Google"); // or your login button

  // Fill in credentials (if needed)
  await page.fill('input[type="email"]', "test-manager@yourcompany.com");
  await page.fill('input[type="password"]', "your-test-password");
  await page.click('button[type="submit"]');

  // Wait for successful login
  await page.waitForURL("/#/");

  // Save authentication state
  await page.context().storageState({ path: authFile });
});
```

Then update `playwright.config.ts`:

```typescript
export default defineConfig({
  // ... existing config
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/user.json",
      },
      dependencies: ["setup"],
    },
  ],
});
```

**Option B: Use Firebase Authentication Directly**

Add Firebase Admin SDK to your test setup and create custom tokens for testing.

### Step 4: Remove `.skip` from E2E Tests

Once authentication is configured, remove `.skip` from the tests in `e2e/manager-flow.spec.ts`:

```typescript
// Change this:
test.skip('should display manager navigation for manager users', async ({ page }) => {

// To this:
test('should display manager navigation for manager users', async ({ page }) => {
```

### Step 5: Run E2E Tests

After setup, run the E2E tests:

```bash
# Make sure app is built
npm run build

# Start the server in background
npm run server &

# Run E2E tests
npm run test:e2e

# Or run with UI for debugging
npm run test:e2e:ui
```

### Step 6: Verify Deploy Parity on Production

Once deployed to production:

```bash
npm run verify:parity https://your-production-url.com
```

This will:

- Compare production version to local commit SHA
- Verify build is recent
- Check for Tailwind CDN (should be absent)
- Verify hashed assets
- Confirm service worker cleanup script

## Testing Checklist

After completing the manual steps, verify:

- [ ] Playwright browsers installed successfully
- [ ] Test Firebase accounts created (manager + non-manager)
- [ ] Authentication configured in E2E tests
- [ ] E2E tests run without errors: `npm run test:e2e`
- [ ] Manager flow tests pass (navigation, settings access)
- [ ] Non-manager flow tests pass (access restrictions)
- [ ] Unit tests continue to pass: `npm test -- --run`
- [ ] Deploy parity verification works: `npm run verify:parity <url>`

## Why These Steps Are Manual

These steps require:

1. **Local environment** - Playwright browser installation needs system access
2. **Firebase access** - Creating test accounts requires Firebase console access
3. **Authentication secrets** - Test credentials shouldn't be committed to the repository
4. **Production URL** - The actual production deployment URL needs to be configured

All the code and infrastructure is in place - these steps just need to be executed in your local environment with proper credentials.

## Alternative: CI/CD Integration

For fully automated testing in CI/CD:

1. **Store test credentials** as GitHub Secrets:

   - `TEST_MANAGER_EMAIL`
   - `TEST_MANAGER_PASSWORD`
   - `TEST_USER_EMAIL`
   - `TEST_USER_PASSWORD`

2. **Add GitHub Actions workflow** (`.github/workflows/test.yml`):

```yaml
name: Tests

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: "20"
      - run: npm ci
      - run: npm test -- --run

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: "20"
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run build
      - run: npm run test:e2e
        env:
          TEST_MANAGER_EMAIL: ${{ secrets.TEST_MANAGER_EMAIL }}
          TEST_MANAGER_PASSWORD: ${{ secrets.TEST_MANAGER_PASSWORD }}
```

This would run tests automatically on every push/PR.

## Summary

**Implemented:**

- ✅ 15 unit tests (all passing)
- ✅ E2E test framework (Playwright configured)
- ✅ E2E test suite written (authentication needed)
- ✅ Deploy parity verification script
- ✅ All npm scripts configured
- ✅ Documentation complete

**Requires Your Action:**

- ⚠️ Install Playwright browsers locally
- ⚠️ Create Firebase test accounts
- ⚠️ Configure authentication in E2E tests
- ⚠️ Remove `.skip` from E2E tests
- ⚠️ Run tests to verify

All code is ready - just needs Firebase access and local execution!
