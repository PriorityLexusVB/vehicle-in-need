<!-- markdownlint-disable MD013 -->
<!-- Long lines intentional for readability, table formatting, and command examples -->

# Deployment Checklist

This document provides a comprehensive checklist for deploying the Vehicle Order Tracker application to production.

## Pre-Build Checklist

- [ ] Pull latest code from `main` branch

  ```bash
  git checkout main
  git pull origin main
  ```

- [ ] Verify working directory is clean (no uncommitted changes)

  ```bash
  git status
  ```

- [ ] Install/update dependencies

  ```bash
  npm ci
  ```

- [ ] Verify environment variables are configured
  - Firebase configuration (if applicable)
  - Any required secrets

- [ ] Run automated tests

  ```bash
  npm test -- --run
  ```

- [ ] Verify all tests pass
  - Unit tests for ProtectedRoute, SettingsPage, VersionBadge
  - All test suites should pass with no failures

## Build Verification

- [ ] Run local build successfully

  ```bash
  npm run build
  ```

- [ ] Verify build artifacts are generated

  ```bash
  ls -la dist/
  ls -la dist/assets/
  ```

- [ ] Check that index.html references hashed assets (not source files)

  ```bash
  grep -E 'assets/.*\-[a-zA-Z0-9_-]{8,}\.(js|css)' dist/index.html
  ```

- [ ] Verify no Tailwind CDN script tag in built index.html

  ```bash
  ! grep -q 'cdn.tailwindcss.com' dist/index.html && echo "✓ No Tailwind CDN" || echo "✗ Tailwind CDN found!"
  ```

- [ ] Confirm favicons are copied to dist

  ```bash
  ls -la dist/favicon.*
  ```

- [ ] Check service worker files are generated

  ```bash
  ls -la dist/sw.js dist/workbox-*.js
  ```

## Docker Build Verification

- [ ] Build Docker image with build args

  ```bash
  docker build \
    --build-arg COMMIT_SHA=$(git rev-parse --short HEAD) \
    --build-arg BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
    -t vehicle-tracker:local-test \
    .
  ```

- [ ] Run container locally to verify

  ```bash
  docker run -p 8080:8080 vehicle-tracker:local-test
  ```

- [ ] Test local container at <http://localhost:8080>
  - [ ] Login works
  - [ ] Manager navigation visible (for manager users)
  - [ ] SettingsPage loads at `/#/admin`
  - [ ] VersionBadge displays in header
  - [ ] No console errors related to module loading or MIME types

- [ ] Stop test container

  ```bash
  docker stop $(docker ps -q --filter ancestor=vehicle-tracker:local-test)
  ```

## Cloud Build & Deploy

- [ ] Verify Cloud Build trigger is configured

  ```bash
  gcloud builds triggers list
  ```

- [ ] Trigger Cloud Build (automatic on push to main, or manual)

  ```bash
  gcloud builds submit --config cloudbuild.yaml
  ```

- [ ] Monitor build progress

  ```bash
  gcloud builds list --limit=1
  gcloud builds log <BUILD_ID> --stream
  ```

- [ ] Verify image was pushed with correct tag

  ```bash
  gcloud container images list-tags gcr.io/${PROJECT_ID}/pre-order-dealer-exchange-tracker --limit=5
  ```

- [ ] Confirm Cloud Run deployment succeeded

  ```bash
  gcloud run services describe pre-order-dealer-exchange-tracker --region=us-west1
  ```

- [ ] Verify 100% traffic to latest revision

  ```bash
  gcloud run services describe pre-order-dealer-exchange-tracker \
    --region=us-west1 \
    --format='value(status.traffic[0].percent)'
  ```

  Expected output: `100`

## Post-Deployment Verification

### Automated Checks

- [ ] Run deployment verification script

  ```bash
  node scripts/verify-deployment.cjs https://pre-order-dealer-exchange-tracker-<hash>.a.run.app
  ```

- [ ] Run deploy parity verification

  ```bash
  npm run verify:parity https://pre-order-dealer-exchange-tracker-<hash>.a.run.app
  ```

  Confirms production matches local repository state

- [ ] Check health endpoint

  ```bash
  curl https://pre-order-dealer-exchange-tracker-<hash>.a.run.app/health
  ```

  Expected: `healthy`

- [ ] Check status endpoint and verify version

  ```bash
  curl https://pre-order-dealer-exchange-tracker-<hash>.a.run.app/api/status | jq
  ```

  Verify `version` matches latest commit SHA

### Manual Smoke Tests

#### Fresh Browser (No Cache)

- [ ] Open production URL in incognito/private window
- [ ] Verify no browser console errors
- [ ] Check Network tab for:
  - [ ] No 404 errors
  - [ ] No module script MIME type errors
  - [ ] All JS/CSS served from `/assets/*` with hashed filenames
  - [ ] index.html served with `Cache-Control: no-cache, no-store`
  - [ ] Hashed assets served with `Cache-Control: public, max-age=31536000, immutable`

#### Manager User Flow

- [ ] Login with manager account (e.g., <rob.brasco@priorityautomotive.com>)
- [ ] Verify manager badge shows in header: `(Manager)` and `[isManager: true]`
- [ ] Verify VersionBadge visible in header with format `v<short-sha>`
- [ ] Verify pill navigation shows:
  - [ ] "Dashboard" pill
  - [ ] "User Management" pill with gear icon
- [ ] Verify gear icon button in top-right
- [ ] Click "User Management" pill → navigates to `/#/admin`
- [ ] Verify SettingsPage displays with user list and role toggles
- [ ] Verify cannot toggle own manager role (toggle disabled)
- [ ] Click "Dashboard" pill → navigates back to `/#/`
- [ ] Verify dashboard displays orders and statistics

#### Non-Manager User Flow

- [ ] Login with non-manager test account
- [ ] Verify NO manager badge in header
- [ ] Verify NO pill navigation
- [ ] Verify NO gear icon
- [ ] Attempt direct navigation to `/#/admin`
- [ ] Verify redirected back to `/#/`
- [ ] Verify "Submit a New Vehicle Request" heading visible
- [ ] Verify order form is always visible
- [ ] Verify "Your Orders" section visible below form
- [ ] Create a test order
- [ ] Verify order appears in "Your Orders" section
- [ ] Verify NO status change controls visible in order card
- [ ] Verify NO delete button visible in order card

#### Order Visibility Testing

- [ ] **Manager can see all orders**
  - Login as manager
  - Create an order
  - Note the order details
  - Logout

- [ ] **Non-manager sees only their orders**
  - Login as non-manager user (different from manager)
  - Verify the manager's order is NOT visible
  - Create an order as non-manager
  - Verify only the non-manager's order is visible

- [ ] **Order ownership verification**
  - Check Firestore for a recently created order
  - Verify `createdByUid` field is populated
  - Verify `createdByEmail` field is populated
  - Verify `createdAt` timestamp is present

- [ ] **Firestore index verification**
  - Navigate to Firestore Database → Indexes in Firebase Console
  - Verify composite index exists:
    - Collection: `orders`
    - Fields: `createdByUid` (Ascending), `createdAt` (Descending)
  - If missing, create the index following README instructions

#### Service Worker & Updates

- [ ] After deployment, refresh page (Ctrl/Cmd + R)
- [ ] If service worker is registered, verify update prompt appears (if new version detected)
- [ ] Check browser console for service worker logs:
  - [ ] "Performing one-time cleanup..." (on first load after deployment)
  - [ ] "Unregistered legacy service worker..." (if old SW existed)
- [ ] Verify localStorage has key `sw_cleanup_v1_done = true`

### Observability Checks

- [ ] Check browser console logs on page load
  - [ ] Version information logged (commit SHA + build time)
  - [ ] No uncaught MutationObserver errors
  - [ ] No "STALE_BUNDLE_DETECTED" errors

- [ ] Verify favicon loads correctly (both .ico and .svg)

  ```bash
  curl -I https://pre-order-dealer-exchange-tracker-<hash>.a.run.app/favicon.ico
  curl -I https://pre-order-dealer-exchange-tracker-<hash>.a.run.app/favicon.svg
  ```

  Both should return `200 OK`

- [ ] Confirm no Tailwind CDN usage

  ```bash
  curl -s https://pre-order-dealer-exchange-tracker-<hash>.a.run.app/ | grep -q 'cdn.tailwindcss.com' && echo "✗ CDN found" || echo "✓ No CDN"
  ```

### Cloud Run Monitoring

- [ ] Check Cloud Run logs for any errors

  ```bash
  gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=pre-order-dealer-exchange-tracker" --limit=50 --format=json
  ```

- [ ] Verify no elevated error rates in Cloud Run metrics
- [ ] Check request latency is within acceptable range (< 500ms for most requests)

### Admin/Role Verification

After deployment, verify that role management is working correctly:

#### Manager Role Verification

- [ ] **Check Firestore for managers**

  ```bash
  # View users collection in Firebase Console
  # Verify at least one user has isManager: true
  ```

- [ ] **Run seeder script dry-run**

  ```bash
  pnpm run seed:managers:dry-run -- --emails manager@priorityautomotive.com
  ```

  Expected output should show:

  ```text
  === Seed Managers ===
  Mode   :  DRY-RUN (no writes)
  Results:
  - manager@priorityautomotive.com: noop uid=xxx
  Summary:
    noop: 1
  No changes required.
  ```

- [ ] **Login as seeded manager**
  - [ ] Verify "(Manager)" badge appears in header
  - [ ] Verify pill navigation visible (Dashboard + User Management)
  - [ ] Verify settings gear icon visible in top-right
  - [ ] Navigate to `/#/admin` → user management page loads
  - [ ] Verify user list displays with role toggle switches
  - [ ] Verify cannot toggle own manager role (disabled)

- [ ] **Login as non-manager (if test account exists)**
  - [ ] Verify NO "(Manager)" badge in header
  - [ ] Verify NO pill navigation
  - [ ] Verify NO settings gear icon
  - [ ] Verify only order form visible (no order list or stats)
  - [ ] Attempt to navigate to `/#/admin` → verify redirect to `/#/`

#### Zero-Manager Warning Banner

- [ ] **Simulate zero-manager scenario (in test environment only)**
  - Set all users to `isManager: false` temporarily
  - Login as non-manager
  - Verify yellow warning banner appears:

    ```text
    ⚠️ No managers detected. Please contact an administrator...
    ```

  - Click dismiss button → verify banner disappears
  - Restore at least one manager role

#### Role Elevation Logging

- [ ] **Check browser console for elevation events**
  - Add a new email to `MANAGER_EMAILS` in `constants.ts`
  - Login with that user (first time)
  - Check console for: `[ROLE-ELEVATION] email@domain.com upgraded (was false)`
  - Subsequent logins should NOT show elevation log (already a manager)

#### Role Persistence

- [ ] **Verify role changes persist**
  - Manager demotes User A via Settings page
  - User A logs out and back in
  - Verify User A still has non-manager status (change persisted)
  - Manager promotes User A back via Settings page
  - User A logs out and back in
  - Verify User A has manager status again

#### Domain Restriction

- [ ] **Verify domain enforcement**
  - Attempt login with <non-@priorityautomotive.com> email
  - Verify access denied with alert message
  - User should be immediately signed out

#### Documentation Verification

- [ ] Review [docs/role-ui-examples.md](./docs/role-ui-examples.md) for UI state examples
- [ ] Review [MANUAL_TESTING_STEPS.md](./MANUAL_TESTING_STEPS.md#service-account-key-rotation) for key rotation procedures
- [ ] Confirm README security section is up-to-date

## Rollback Procedure

If deployment verification fails:

1. **Identify previous working revision**

   ```bash
   gcloud run revisions list --service=pre-order-dealer-exchange-tracker --region=us-west1
   ```

2. **Roll back traffic to previous revision**

   ```bash
   gcloud run services update-traffic pre-order-dealer-exchange-tracker \
     --region=us-west1 \
     --to-revisions=<PREVIOUS_REVISION_NAME>=100
   ```

3. **Verify rollback successful**

   ```bash
   curl https://pre-order-dealer-exchange-tracker-<hash>.a.run.app/api/status | jq '.version'
   ```

4. **Investigate failure**
   - Review build logs
   - Compare dist/ contents between builds
   - Check for differences in cloudbuild.yaml or Dockerfile
   - Verify environment variables and build args

5. **Document issue and create bug report**

## Troubleshooting Common Issues

### Issue: "Tailwind CDN script still present in production"

- **Cause:** Old build cached or CDN script in source index.html
- **Fix:**
  1. Verify source `index.html` has no `<script src="https://cdn.tailwindcss.com">`
  2. Clear build cache: `rm -rf dist/ node_modules/.vite`
  3. Rebuild: `npm run build`
  4. Redeploy

### Issue: "Module script MIME type errors"

- **Cause:** Server returning HTML instead of JS for asset requests (404 fallback)
- **Fix:**
  1. Verify assets exist in dist/assets/ with hashed names
  2. Check Docker COPY command includes dist/ directory
  3. Verify Express static file serving configured correctly
  4. Ensure no route conflicts with /assets/* paths

### Issue: "VersionBadge not displaying or shows 'unknown'"

- **Cause:** Build args not passed to Docker build or environment variables not injected
- **Fix:**
  1. Verify cloudbuild.yaml passes `COMMIT_SHA=${SHORT_SHA}` and `BUILD_TIME=${BUILD_ID}`
  2. Check Dockerfile ARG declarations and ENV exports
  3. Confirm vite.config.ts exposes via `import.meta.env`

### Issue: "Manager navigation not visible"

- **Cause:** User role not set correctly in Firestore
- **Fix:**
  1. Check Firestore `users` collection
  2. Verify manager user document has `isManager: true`
  3. Clear browser storage and re-login

### Issue: "Service worker serving stale assets"

- **Cause:** Old service worker still active
- **Fix:**
  1. Open DevTools → Application → Service Workers
  2. Click "Unregister" on all workers
  3. Hard refresh (Ctrl/Cmd + Shift + R)
  4. Verify localStorage has `sw_cleanup_v1_done = true`

## Post-Mortem Template

If a deployment issue occurs, document it using this template:

```markdown
## Deployment Issue: [Date]

**Incident Summary:**
[Brief description of what went wrong]

**Timeline:**
- [HH:MM] Deployment triggered
- [HH:MM] Issue detected
- [HH:MM] Rollback initiated
- [HH:MM] Service restored

**Root Cause:**
[Technical explanation of the cause]

**Resolution:**
[Steps taken to resolve]

**Preventive Measures:**
[Changes to process/code to prevent recurrence]

**Action Items:**
- [ ] [Specific action with owner]
```

## Release Notes Template

For each deployment, consider creating a release note:

```markdown
## Release: v[SHORT_SHA] - [Date]

**Deployed to:** Production
**Build Time:** [ISO timestamp]
**Commit:** [full SHA]

**Changes:**
- [Feature/fix description]
- [Feature/fix description]

**Verification:**
- [x] Health check passed
- [x] Version matches commit SHA
- [x] All smoke tests passed
- [x] No console errors
- [x] Manager navigation functional

**Rollback Plan:**
Previous revision: [revision-name]
```

## Useful Commands Reference

```bash
# Get current Cloud Run revision
gcloud run services describe pre-order-dealer-exchange-tracker \
  --region=us-west1 \
  --format='value(status.latestCreatedRevisionName)'

# Get current traffic distribution
gcloud run services describe pre-order-dealer-exchange-tracker \
  --region=us-west1 \
  --format='table(status.traffic.revisionName,status.traffic.percent)'

# Stream logs in real-time
gcloud logging tail "resource.type=cloud_run_revision" --format=json

# Delete old revisions (keep last 5)
gcloud run revisions list --service=pre-order-dealer-exchange-tracker --region=us-west1 --format='value(name)' | tail -n +6 | xargs -I {} gcloud run revisions delete {} --region=us-west1 --quiet

# Check build history
gcloud builds list --limit=10 --format='table(id,status,createTime,duration,images)'

# Force rebuild without cache
gcloud builds submit --config cloudbuild.yaml --no-cache
```

## Security Checklist

- [ ] No API keys or secrets in client-side code
- [ ] Service account has minimum required IAM roles
- [ ] CORS configured appropriately (not allowing all origins in production)
- [ ] Content Security Policy headers considered
- [ ] Firebase security rules reviewed and up-to-date
- [ ] Dependencies scanned for vulnerabilities (`npm audit`)
- [ ] Environment variables properly scoped and secured
- [ ] HTTPS enforced for all traffic (Cloud Run default)

## Post-Deployment Admin Verification

After deployment, perform comprehensive verification of admin and role management features:

### Manager Account Verification

1. **Run seeder in dry-run mode** to verify manager roles:

   ```bash
   pnpm run seed:managers:dry-run -- --emails manager@priorityautomotive.com
   ```

2. **Login as manager account** and verify:
   - Manager navigation pill is visible (Dashboard | User Management)
   - Settings gear icon appears in header
   - Can access `/#/admin` route
   - Can view User Management page
   - Can toggle other users' manager status

3. **Check console logs** for role elevation:
   - Look for `[ROLE-ELEVATION]` log entries during first-time manager login
   - Verify format: `[ROLE-ELEVATION] email={email} uid={uid} elevated=true`
   - Confirm no duplicate elevation logs on subsequent logins

### Non-Manager Verification

1. **Login as non-manager account** and verify:
   - No manager navigation pill visible
   - No settings gear icon in header
   - Cannot access `/#/admin` (redirects to dashboard)
   - Can still create and view own orders

### Zero-Manager Warning

1. **If no managers exist in system**:
   - Non-managers should see yellow warning banner
   - Banner message: "No managers detected. Please contact an administrator..."
   - Banner is dismissible via close button
   - Managers do not see this warning

2. **Verify warning disappears** once at least one manager exists

### Firestore Data Verification

1. **Check Firestore Console**:
   - Navigate to Firebase Console → Firestore → `users` collection
   - Verify `isManager: true` for expected users
   - Confirm no orphaned or incorrect role data

2. **Verify role persistence**:
   - Change a user's role via User Management page
   - Logout and login again
   - Confirm role change persisted

## Performance Checklist

- [ ] Lighthouse score > 90 for Performance
- [ ] Time to Interactive < 3 seconds
- [ ] Largest Contentful Paint < 2.5 seconds
- [ ] Cumulative Layout Shift < 0.1
- [ ] Assets properly cached (immutable for hashed, no-cache for HTML)
- [ ] Images optimized (if any added in future)
- [ ] Service worker not caching index.html indefinitely

---

**Last Updated:** [Date]
**Maintained By:** DevOps / Engineering Team
