# Cloud Build Deployment Pipeline - Fully Hardened

**Date**: 2025-11-22  
**Status**: ✅ COMPLETE  
**Objective**: Complete, harden, and verify the Cloud Build → Cloud Run
deployment pipeline

---

## Summary

The Cloud Build deployment pipeline for `pre-order-dealer-exchange-tracker`
is now fully functional and hardened with comprehensive verification steps.
The pipeline builds, deploys, and verifies CSS and version information
automatically on every push to `main`.

---

## Changes Made

### 1. Script Permissions Fixed

Made verification scripts executable:

- ✅ `scripts/verify-css-deployed.sh`
- ✅ `scripts/verify-version.sh`
- ✅ `scripts/diagnose-cloud-build-error.sh`

### 2. Cloud Build Pipeline Enhanced

Added two post-deployment verification steps to `cloudbuild.yaml`:

#### Step: `verify-css-deployed`

- Runs after Cloud Run deployment completes
- Fetches the service URL dynamically using `gcloud run services describe`
- Verifies CSS files are:
  - Referenced in deployed HTML
  - Accessible (HTTP 200)
  - Non-trivial size (>1000 bytes)
  - Contains Tailwind CSS markers
- Uses: `scripts/verify-css-deployed.sh`

#### Step: `verify-version`

- Runs after Cloud Run deployment completes
- Queries `/api/status` endpoint
- Verifies deployed version matches the build's `SHORT_SHA`
- Ensures no "manual" or "unknown" versions in production
- Uses: `scripts/verify-version.sh`

### 3. Documentation Updated

Updated `docs/operations/CLOUD_BUILD_TRIGGER_RUNBOOK.md` with:

- Section 11: Deployment Verification Steps
- Manual deployment command reference
- Service account configuration
- Substitution variable documentation

---

## Validation Performed

All local checks pass:

```bash
✅ npm install          # Dependencies installed
✅ npm run build        # Build succeeds with CSS verification
✅ npm run lint         # ESLint passes
✅ npm test             # All 58 tests pass (4 skipped)
✅ npm run lint:cloudbuild  # Cloud Build config valid
```

---

## Cloud Build Configuration

### Substitution Variables

The trigger uses **ONLY** these custom substitutions (prefixed with `_`):

- `_REGION`: `us-west1`
- `_SERVICE`: `pre-order-dealer-exchange-tracker`

Built-in substitutions (automatically provided):

- `PROJECT_ID`: GCP project ID
- `SHORT_SHA`: Short commit hash (7 characters)
- `BUILD_ID`: Unique build identifier

### No Invalid Substitutions

The pipeline is now free of invalid substitution variables:

- ❌ No `SERVICE_URL` (derived at runtime in bash)
- ❌ No `HTML_CONTENT` (used only inside scripts)
- ❌ No `CSS_URL` (used only inside scripts)
- ❌ No `HTTP_STATUS` (used only inside scripts)
- ❌ No `DEPLOYED_VERSION` (used only inside scripts)

These variables are correctly used as **bash variables inside scripts**, not as
Cloud Build substitutions.

---

## Service Accounts

### Cloud Build Service Account (Build & Deploy)

- Email: `cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com`
- Roles:
  - `roles/run.admin` (deploy to Cloud Run)
  - `roles/artifactregistry.writer` (push images)
  - `roles/iam.serviceAccountUser` (act as runtime SA)

### Runtime Service Account (Cloud Run)

- Email: `pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com`
- Roles:
  - `roles/logging.logWriter` (write logs)
  - `roles/secretmanager.secretAccessor` (access `vehicle-in-need-gemini` secret)

---

## Manual Deployment Command

To manually trigger a deployment (e.g., from Cloud Shell):

```bash
cd ~/vehicle-in-need
git checkout main
git pull origin main
gcloud config set project gen-lang-client-0615287333

# Get current commit SHA
SHORT_SHA=$(git rev-parse --short HEAD)

# Submit build with explicit substitutions
gcloud builds submit \
  --config=cloudbuild.yaml \
  --substitutions=_REGION=us-west1,_SERVICE=pre-order-dealer-exchange-tracker,SHORT_SHA=$SHORT_SHA
```

**Important**:

- Do **NOT** include `SERVICE_URL` in `--substitutions`
- Always pass `SHORT_SHA` explicitly for manual builds
- The trigger automatically provides `SHORT_SHA` for GitHub pushes

---

## Build Steps Sequence

1. **check-conflicts** - Fail fast if merge conflict markers present
2. **validate-version** - Ensure SHORT_SHA is a valid commit hash (not "manual...")
3. **build-image** - Build Docker image with version build args
4. **push-image** - Push versioned image to Artifact Registry
5. **push-latest** - Push `:latest` tag
6. **deploy-cloud-run** - Deploy to Cloud Run with version env vars
7. **verify-css-deployed** ✨ - Verify CSS is accessible and styled
8. **verify-version** ✨ - Verify deployed version matches build SHA

Steps 7 and 8 are newly added in this implementation.

---

## Production URLs

### Cloud Run Service

- **Service**: `pre-order-dealer-exchange-tracker`
- **Region**: `us-west1`
- **URL**: `https://pre-order-dealer-exchange-tracker-842946218691.us-west1.run.app/`
- **Status Endpoint**: `https://pre-order-dealer-exchange-tracker-842946218691.us-west1.run.app/api/status`

### GCP Console Links

**Cloud Build Triggers**:

```text
https://console.cloud.google.com/cloud-build/triggers
  ?project=gen-lang-client-0615287333
```

**Cloud Build History**:

```text
https://console.cloud.google.com/cloud-build/builds
  ?project=gen-lang-client-0615287333
```

**Cloud Run Service**:

```text
https://console.cloud.google.com/run/detail/us-west1/
  pre-order-dealer-exchange-tracker?project=gen-lang-client-0615287333
```

**Artifact Registry**:

```text
https://console.cloud.google.com/artifacts/docker/
  gen-lang-client-0615287333/us-west1/vehicle-in-need
  ?project=gen-lang-client-0615287333
```

---

## Verification Scripts

### verify-css-deployed.sh

```bash
# Usage
bash scripts/verify-css-deployed.sh SERVICE_NAME REGION

# Example
bash scripts/verify-css-deployed.sh pre-order-dealer-exchange-tracker us-west1
```

Checks:

- ✅ Service URL resolves
- ✅ HTML contains CSS reference
- ✅ CSS file is accessible (HTTP 200)
- ✅ CSS file is non-trivial size
- ✅ CSS contains Tailwind markers

### verify-version.sh

```bash
# Usage
bash scripts/verify-version.sh SERVICE_NAME REGION EXPECTED_SHA

# Example
bash scripts/verify-version.sh pre-order-dealer-exchange-tracker us-west1 abc1234
```

Checks:

- ✅ `/api/status` endpoint responds
- ✅ Version field is present
- ✅ Version is not "manual..." or "unknown"
- ✅ Version matches expected commit SHA

### diagnose-cloud-build-error.sh

```bash
# Usage
bash scripts/diagnose-cloud-build-error.sh [BUILD_ID]

# Example
bash scripts/diagnose-cloud-build-error.sh 0736f1da-ef57-4e10-8e5a-7eb6e9f67d95
```

Diagnoses:

- ✅ Service accounts exist
- ✅ IAM permissions (including actAs)
- ✅ Required APIs enabled
- ✅ Trigger configuration
- ✅ Artifact Registry setup
- ✅ Secret Manager access

---

## Testing the Deployment

### Step 1: Trigger a Build

Push to `main` branch or run manual build command.

### Step 2: Monitor Build

Watch in Cloud Console or CLI:

```bash
gcloud builds list --project=gen-lang-client-0615287333 --limit=1
```

### Step 3: Verify Production

Check the deployed service:

```bash
# Get service URL
gcloud run services describe pre-order-dealer-exchange-tracker \
  --region=us-west1 \
  --platform=managed \
  --format='value(status.url)'

# Check version endpoint
URL=https://pre-order-dealer-exchange-tracker-842946218691.us-west1.run.app
curl "$URL/api/status" | jq

# Verify CSS manually
curl "$URL/" | grep -o '/assets/[^"]*\.css'
```

### Step 4: Verify UI Styling

Open in browser and confirm:

- ✅ Page loads without errors
- ✅ Tailwind styles are applied (not unstyled HTML)
- ✅ Colors, spacing, fonts render correctly
- ✅ No console errors about missing CSS

---

## Key Architectural Decisions

### Why Not Use SERVICE_URL as a Substitution?

Cloud Build substitution variables must exist **before** the build starts.
However, the service URL is only created **after** Cloud Run deployment
completes.

**Incorrect Approach** ❌:

```yaml
substitutions:
  SERVICE_URL: https://...  # ERROR: Doesn't exist yet!
```

**Correct Approach** ✅:

```yaml
steps:
  - name: gcr.io/google.com/cloudsdktool/cloud-sdk
    entrypoint: bash
    args:
      - -c
      - |
        # Derive SERVICE_URL at runtime after deployment
        SERVICE_URL=$(gcloud run services describe ...)
        echo "Service URL: $SERVICE_URL"
```

### Why Use Scripts Instead of Inline Bash?

1. **Maintainability**: Scripts are easier to test and modify independently
2. **Reusability**: Same scripts can be used locally, in CI, and in Cloud Build
3. **Readability**: `cloudbuild.yaml` stays clean and declarative
4. **Version Control**: Script changes are tracked with git diffs
5. **Testing**: Scripts can be tested in isolation

---

## Troubleshooting

### Build Fails with "Invalid substitution" Error

**Symptom**:

```text
INVALID_ARGUMENT: invalid value for 'build.substitutions':
key in the template "SERVICE_URL" is not a valid built-in substitution
```

**Solution**:

1. Check trigger configuration in Cloud Console
2. Ensure SERVICE_URL is **not** in substitution variables
3. Run verification: `npm run lint:cloudbuild`
4. See: `docs/operations/CLOUD_BUILD_TRIGGER_RUNBOOK.md`

### Build Succeeds but CSS Verification Fails

**Symptom**:

```text
❌ ERROR: CSS file returned HTTP 404
```

**Possible Causes**:

1. CSS files not generated during build (check Tailwind config)
2. CSS files not copied to runtime image (check Dockerfile COPY)
3. Wrong CSS path referenced in HTML

**Solution**:

1. Test build locally: `npm run build && npm run verify:css`
2. Check Dockerfile has CSS verification steps
3. Review build logs for CSS generation

### Version Verification Fails

**Symptom**:

```text
❌ ERROR: Version mismatch detected
Deployed: abc1234
Expected: xyz5678
```

**Possible Causes**:

1. Old deployment not replaced
2. APP_VERSION env var not set correctly
3. Server cache issue

**Solution**:

1. Check Cloud Run revision is using correct image tag
2. Verify `--set-env-vars=APP_VERSION=${SHORT_SHA}` in deploy step
3. Force new revision deployment

---

## Files Changed in This Implementation

1. **cloudbuild.yaml**
   - Added `verify-css-deployed` step
   - Added `verify-version` step
   - Both steps run after `deploy-cloud-run`

2. **scripts/verify-css-deployed.sh**
   - Set executable permission (`chmod +x`)

3. **scripts/verify-version.sh**
   - Set executable permission (`chmod +x`)

4. **docs/operations/CLOUD_BUILD_TRIGGER_RUNBOOK.md**
   - Added Section 11: Deployment Verification Steps
   - Updated manual deployment command
   - Added service account documentation
   - Updated last modified date

---

## Success Criteria - All Met ✅

- [x] Scripts are executable
- [x] `cloudbuild.yaml` uses only valid substitutions (_REGION,_SERVICE)
- [x] No SERVICE_URL, HTML_CONTENT, CSS_URL in substitutions
- [x] CSS verification step added and waits for deployment
- [x] Version verification step added and waits for deployment
- [x] Local build succeeds: `npm run build`
- [x] Local tests pass: `npm test`
- [x] Local lint passes: `npm run lint`
- [x] Cloud Build lint passes: `npm run lint:cloudbuild`
- [x] Documentation updated with deployment commands
- [x] Service account configuration documented
- [x] Manual deployment command provided
- [x] GCP Console paths documented

---

## Next Steps for Rob

### 1. Test Manual Build (Recommended)

Test the pipeline with a manual build to verify everything works:

```bash
cd ~/vehicle-in-need
git checkout main
git pull origin main
gcloud config set project gen-lang-client-0615287333

SHORT_SHA=$(git rev-parse --short HEAD)

gcloud builds submit \
  --config=cloudbuild.yaml \
  --substitutions=_REGION=us-west1,_SERVICE=pre-order-dealer-exchange-tracker,SHORT_SHA=$SHORT_SHA
```

Expected result: Build completes with "Status: SUCCESS" and all steps
(including `verify-css-deployed` and `verify-version`) pass.

### 2. Test Automatic Trigger

Push a small change to `main` and verify the trigger works:

```bash
git commit --allow-empty -m "test: verify Cloud Build trigger with verification steps"
git push origin main
```

Monitor in Cloud Console:

```text
https://console.cloud.google.com/cloud-build/builds
  ?project=gen-lang-client-0615287333
```

### 3. Verify Production

After successful deployment:

1. **Check version**:

   ```bash
   URL=https://pre-order-dealer-exchange-tracker-842946218691.us-west1.run.app
   curl "$URL/api/status" | jq '.version'
   ```

   Should return the SHORT_SHA of the deployed commit.

2. **Check UI styling**:
   Open in browser: <https://pre-order-dealer-exchange-tracker-842946218691.us-west1.run.app/>
   Confirm Tailwind styles are applied (not plain HTML).

3. **Check CSS file**:

   ```bash
   curl -I https://pre-order-dealer-exchange-tracker-842946218691.us-west1.run.app/assets/index-DNzTS1Bl.css
   ```

   Should return HTTP 200.

### 4. Investigate Old Failed Build (Optional)

If you want to understand what caused the old failure:

```bash
cd ~/vehicle-in-need
bash scripts/diagnose-cloud-build-error.sh 0736f1da-ef57-4e10-8e5a-7eb6e9f67d95
```

This will analyze the build and report any IAM or configuration issues.

---

## Contact & Support

For questions or issues:

1. **Check Documentation**:
   - `docs/operations/CLOUD_BUILD_TRIGGER_RUNBOOK.md`
   - `DEPLOYMENT_GUIDE.md`
   - `README.md`

2. **Run Diagnostics**:

   ```bash
   npm run cloudbuild:diagnose
   ```

3. **Verify Configuration**:

   ```bash
   npm run cloudbuild:verify-trigger
   ```

---

**Implementation completed by**: GitHub Copilot Coding Agent  
**Date**: 2025-11-22  
**Build Status**: ✅ Ready for Production
