# Stabilization Checklist for Firestore Rules and Cloud Build

This document provides a reusable template for performing comprehensive stabilization passes on the `vehicle-in-need` repository. It incorporates lessons learned from previous stabilization efforts (PRs #89, #91, #92, #99, etc.).

## Purpose

Use this checklist when:

- CI/CD pipelines are failing
- Firestore security rules tests are failing
- Cloud Build deployments are failing
- After major refactoring or dependency updates
- When restoring repository to a "guaranteed green state"

## Pre-Stabilization Assessment

### 1. Gather Context

- [ ] Review recent PRs and commits since last known good state
- [ ] Check GitHub Actions workflow runs for patterns in failures
- [ ] Review Cloud Build trigger history in GCP Console
- [ ] Identify what changed (dependencies, rules, code, config)
- [ ] Document current failure symptoms with error messages

### 2. Verify Local Development Environment

```bash
# Check Node version (should be >= 20.0.0)
node --version

# Check npm version (should be >= 10.0.0)
npm --version

# Clean install dependencies
rm -rf node_modules package-lock.json
npm install

# Verify Firebase CLI is available
firebase --version
```

## Phase 1: Build and Lint Verification

### Basic Quality Gates

- [ ] **Linting passes**

  ```bash
  npm run lint
  ```

  - If fails: Run `npm run lint:fix` and review changes
  - Check eslint.config.js for any outdated rules

- [ ] **Build succeeds**

  ```bash
  npm run build
  ```

  - Verify dist/ folder is created
  - Check build output for warnings
  - Verify CSS is properly included in build

- [ ] **Markdown linting passes**

  ```bash
  npm run lint:md
  ```

## Phase 2: Firestore Security Rules

### Test Execution

- [ ] **Run Firestore rules tests**

  ```bash
  npm run test:rules
  ```

### Common Firestore Rules Issues

#### Null Safety Issues

- [ ] Check for undefined property access without null checks
- [ ] Verify `resource.data` and `request.resource.data` existence checks
- [ ] Ensure `request.auth` and `request.auth.token` null safety

**Pattern to check:**

```javascript
// BAD
resource.data.field

// GOOD
resource != null && ('field' in resource.data) && resource.data.field
```

#### Circular Dependencies with get()

- [ ] Minimize use of `get()` in rules
- [ ] Consider using custom claims instead of Firestore lookups
- [ ] Document any remaining `get()` usage with justification

**Recommended pattern:**

```javascript
// Instead of: get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isManager
// Use: request.auth.token.isManager (custom claim)
```

#### Field Validation

- [ ] Verify required fields are checked in create rules
- [ ] Ensure immutable fields cannot be changed in update rules
- [ ] Check that field types are validated (e.g., `isBool()`, `isString()`)

#### Test Coverage

- [ ] All collections have create/read/update/delete tests
- [ ] Both positive and negative test cases exist
- [ ] Manager vs non-manager role differentiation tested
- [ ] Document any expected test failures with justification

### Expected Test Results

**Target:** 100% pass rate (42/42 tests for current schema)

**Known Architectural Limitations (may cause occasional flakiness):**

- Manager reading other users via client-side queries (requires server-side)
- Emulator timing issues with complex get() chains

**Action if tests fail:**

1. Identify which collection/operation is failing
2. Review the specific rule and test
3. Fix rule or test (never weaken security just to pass tests)
4. Re-run tests to verify fix
5. Document any remaining known limitations

## Phase 3: Cloud Build Configuration

### Verification Steps

- [ ] **Review cloudbuild.yaml**
  - All substitution variables start with `_` (custom) or are built-ins
  - No invalid variables like `SERVICE_URL` without underscore
  - All steps have proper dependencies (waitFor)
  - Service account permissions documented

- [ ] **Check substitutions block**

  ```yaml
  substitutions:
    _REGION: us-west1
    _SERVICE: pre-order-dealer-exchange-tracker
    # Built-ins: PROJECT_ID, SHORT_SHA, BUILD_ID
  ```

- [ ] **Verify trigger configuration** (in GCP Console)
  - Go to Cloud Build → Triggers
  - Edit `vehicle-in-need-deploy` trigger
  - Verify only valid substitutions are configured
  - Remove any `SERVICE_URL` or invalid variables

### Common Cloud Build Issues

#### Invalid Substitutions

**Error:** `invalid value for 'build.substitutions': key in the template "SERVICE_URL" is not a valid built-in substitution`

**Fix:**

- Custom substitutions MUST start with `_`
- Remove `SERVICE_URL` from trigger if present
- Use `_SERVICE_URL` if needed, or compute dynamically in script

#### CSS Verification Failures

**Error:** CSS file not accessible or contains no Tailwind classes

**Check:**

- [ ] Build includes CSS file in dist/assets/
- [ ] index.html references CSS file correctly
- [ ] CSS contains Tailwind utility classes
- [ ] Nginx serves static assets correctly

#### Service Account Permissions

- [ ] Cloud Build service account has `roles/run.admin`
- [ ] Cloud Build service account has `roles/iam.serviceAccountUser`
- [ ] Runtime service account has `roles/secretmanager.secretAccessor`

### Build Test (Local)

- [ ] **Test build configuration locally**

  ```bash
  # Validate YAML syntax
  cat cloudbuild.yaml | grep -E '<<<|===|>>>' || echo "No conflicts"
  
  # Check for conflict markers
  git diff --check
  
  # Review substitutions
  grep -A 10 "substitutions:" cloudbuild.yaml
  ```

## Phase 4: CI/CD Pipeline Verification

### GitHub Actions Workflows

- [ ] **Check .github/workflows/ci.yml**
  - All jobs passing
  - Dependencies installed correctly
  - Tests run successfully
  - No secrets exposed in logs

- [ ] **Check specific workflows**
  - gemini-review.yml (if present)
  - ci-pnpm.yml (if using pnpm)
  - deploy workflows

### Common CI Issues

#### Dependency Installation

- [ ] Verify package-lock.json is committed
- [ ] Check for peer dependency warnings
- [ ] Ensure correct Node version in CI (match .nvmrc)

#### Test Failures in CI but not Local

- [ ] Check for environment-specific issues
- [ ] Verify Firebase emulator starts correctly
- [ ] Look for timing/concurrency issues
- [ ] Check if tests run in correct order

#### Secrets and Credentials

- [ ] GitHub secrets configured correctly
- [ ] Service account keys not committed
- [ ] API keys in Secret Manager, not code

## Phase 5: Custom Claims Migration (Recommended)

### Why Custom Claims?

- **Performance:** No database reads in security rules
- **Security:** Claims are signed by Firebase Auth
- **Reliability:** Eliminates circular dependency issues
- **Simplicity:** Cleaner rules, fewer get() calls

### Migration Steps

- [ ] **Create helper script for setting claims**

  ```javascript
  // scripts/set-manager-custom-claims.mjs
  await admin.auth().setCustomUserClaims(uid, { isManager: true });
  ```

- [ ] **Update Firestore rules to use claims**

  ```javascript
  // Before:
  get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isManager == true
  
  // After:
  request.auth.token.isManager == true
  ```

- [ ] **Keep Firestore field for audit/UI**
  - Both custom claim AND Firestore field can coexist
  - Rules use claim for authorization
  - UI uses Firestore field for display

- [ ] **Set claims for production managers**

  ```bash
  node scripts/set-manager-custom-claims.mjs \
    --project vehicles-in-need \
    --dry-run \
    --sync-from-firestore
  ```

## Phase 6: Documentation Updates

### Required Documentation

- [ ] **STABILIZATION_COMPLETE.md** - Current status report
  - Date of stabilization
  - Test results (pass/fail counts)
  - Known limitations
  - Next steps

- [ ] **CLOUD_BUILD_CONFIGURATION.md** - Deployment reference
  - Trigger setup instructions
  - Substitution variables
  - Service account requirements
  - Troubleshooting guide

- [ ] **FIRESTORE_RULES_CUSTOM_CLAIMS.md** - Security model
  - Custom claims vs Firestore fields
  - Migration path
  - Code examples

- [ ] **README.md updates**
  - Reflect current build/test status
  - Update badges if present
  - Document any new requirements

## Phase 7: Deployment Verification

### Pre-Deployment Checklist

- [ ] All tests passing locally
- [ ] All CI workflows passing
- [ ] Build produces valid artifacts
- [ ] Security scan (CodeQL) passes
- [ ] No hardcoded secrets or credentials

### Deployment Steps

1. **Deploy Firestore Rules**

   ```bash
   firebase deploy --only firestore:rules --project vehicles-in-need
   ```

2. **Deploy Firestore Indexes**

   ```bash
   firebase deploy --only firestore:indexes --project vehicles-in-need
   ```

3. **Build and Deploy Application**

   ```bash
   gcloud builds submit --config cloudbuild.yaml \
     --substitutions _REGION=us-west1,_SERVICE=pre-order-dealer-exchange-tracker
   ```

4. **Verify Deployment**
   - [ ] Check Cloud Run service is running
   - [ ] Test application URL loads
   - [ ] Verify CSS and assets load correctly
   - [ ] Test authentication flow
   - [ ] Test manager and non-manager access

### Post-Deployment Verification

- [ ] Monitor Cloud Run logs for errors
- [ ] Check Firestore for proper data access
- [ ] Test with real user accounts
- [ ] Verify no security rule violations in logs

## Phase 8: Regression Analysis (If Needed)

### When to Use

Use this section if stabilization fails or when trying to identify what broke:

### Git History Analysis

```bash
# Find last known good commit
git log --oneline --graph --all -20

# Compare current state to last known good
git diff <good-commit> HEAD -- firestore.rules
git diff <good-commit> HEAD -- cloudbuild.yaml
git diff <good-commit> HEAD -- tests/firestore-rules/

# Check specific file history
git log -p -- firestore.rules
```

### PR Analysis

- [ ] List recent merged PRs
- [ ] Identify which PR introduced regression
- [ ] Review PR diff and comments
- [ ] Check if PR had failing CI that was merged anyway

### Test History

```bash
# Run tests at specific commit
git checkout <commit-sha>
npm install
npm run test:rules

# Document results and continue bisecting
```

## Success Criteria

**Repository is stable when:**

- ✅ All linters pass (code and markdown)
- ✅ Build completes successfully
- ✅ 100% of Firestore rules tests pass (or known limitations documented)
- ✅ All CI workflows pass
- ✅ Cloud Build configuration is valid
- ✅ Deployment to Cloud Run succeeds
- ✅ Application functions correctly in production
- ✅ No security vulnerabilities detected
- ✅ Documentation is up to date

## Troubleshooting Guide

### "Property is undefined" in Firestore Rules

**Symptom:** `Property isManager is undefined on object`

**Causes:**

- Accessing field without checking existence
- Using `get()` on non-existent document
- Missing null checks

**Solution:**

```javascript
// Always check existence first
('isManager' in request.auth.token) && request.auth.token.isManager == true
```

### "No merge base" Git Errors

**Symptom:** `fatal: origin/main...HEAD: no merge base`

**Solution:**

- Use `fetch-depth: 0` in checkout action
- Use commit SHAs instead of branch refs for diff

### Firestore Emulator Hangs

**Symptom:** Tests hang during `firebase emulators:exec`

**Solution:**

- Kill any existing emulator processes
- Clear emulator data: `rm -rf ~/.config/firebase/emulators/`
- Restart with explicit ports
- Check for port conflicts

### Cloud Build Timeout

**Symptom:** Build times out after 10 minutes

**Solution:**

- Increase timeout in cloudbuild.yaml: `timeout: 1200s`
- Check for hanging processes in build steps
- Optimize build steps (caching, parallel execution)

## Reference Links

### Internal Documentation

- STABILIZATION_COMPLETE.md - Last stabilization report
- FIRESTORE_RULES_STATUS.md - Rules implementation details
- CLOUD_BUILD_TRIGGER_FIX.md - Trigger configuration guide
- OPERATOR_DEPLOYMENT_GUIDE.md - Production deployment steps

### External Resources

- [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)
- [Cloud Build Substitutions](https://cloud.google.com/build/docs/configuring-builds/substitute-variable-values)
- [Firebase Custom Claims](https://firebase.google.com/docs/auth/admin/custom-claims)
- [Cloud Run Deployment](https://cloud.google.com/run/docs/deploying)

## Revision History

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2025-11-18 | 1.0 | Initial checklist based on PRs #89-#99 | Copilot Agent |

## Notes

- This checklist should be updated after each major stabilization effort
- Document any new patterns or issues discovered
- Keep this as a living document that evolves with the project
- Can be used as a template for other Firebase/Cloud Run projects
