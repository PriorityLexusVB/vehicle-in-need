# Cloud Build SERVICE_URL Substitution Error - Complete Fix Guide

## Problem

Cloud Build trigger `vehicle-in-need-deploy` is failing with:

```
invalid value for 'build.substitutions': key in the template "SERVICE_URL" 
is not a valid built-in substitution
```

## Why This Happens

**`SERVICE_URL` is NOT a Cloud Build substitution variable.**

It is a bash variable that is dynamically retrieved at runtime within the `verify-css-deployed` build step:

```bash
# This happens INSIDE the build, not as a substitution
SERVICE_URL=$(gcloud run services describe ${_SERVICE} \
  --region=${_REGION} \
  --format='value(status.url)')
```

### Cloud Build Substitution Rules

Cloud Build substitutions must be:

1. **Built-in variables** (no underscore prefix):
   - `PROJECT_ID` - GCP project ID
   - `SHORT_SHA` - Short commit SHA (7 chars)
   - `BUILD_ID` - Unique build identifier
   - `COMMIT_SHA` - Full commit SHA
   - `BRANCH_NAME` - Git branch name
   - `TAG_NAME` - Git tag name
   - `REPO_NAME` - Repository name

2. **Custom variables** (MUST start with underscore):
   - `_REGION` - Deployment region (e.g., us-west1)
   - `_SERVICE` - Service name (e.g., pre-order-dealer-exchange-tracker)
   - Any other custom variable you define

**`SERVICE_URL` does not fit either category**, so it cannot be a substitution.

### Why SERVICE_URL Can't Be a Substitution

1. **It doesn't exist yet** - The service URL is only known AFTER the Cloud Run deployment completes
2. **It's dynamic** - Each deployment might result in a different URL
3. **It's retrieved, not configured** - We fetch it using `gcloud run services describe`

The build steps execute in order:

1. Build container image
2. Push to Artifact Registry
3. Deploy to Cloud Run → Service URL is created/updated
4. Verify deployment → Retrieve SERVICE_URL dynamically (as a bash variable)

## The Fix

### Option 1: Using Google Cloud Console (Recommended)

1. **Navigate to Cloud Build Triggers**
   - Go to: <https://console.cloud.google.com/cloud-build/triggers>
   - Select project: `gen-lang-client-0615287333`

2. **Find and Edit the Trigger**
   - Find trigger: `vehicle-in-need-deploy`
   - Click the **EDIT** button (pencil icon)

3. **Update Substitution Variables**
   - Scroll to the **"Substitution variables"** section
   - **Remove** any entry with key `SERVICE_URL` or `_SERVICE_URL`
   - Verify only these substitutions exist (if any):
     - `_REGION`: `us-west1`
     - `_SERVICE`: `pre-order-dealer-exchange-tracker`

4. **Save Changes**
   - Click **SAVE** at the bottom
   - Wait for confirmation message

5. **Verify the Fix**
   - Run the verification script:

     ```bash
     ./scripts/verify-cloud-build-config.sh
     ```

### Option 2: Using gcloud CLI

```bash
# Get current trigger configuration
gcloud builds triggers describe vehicle-in-need-deploy \
  --project=gen-lang-client-0615287333 \
  --format=json > trigger-config.json

# Edit trigger-config.json to remove SERVICE_URL from substitutions
# Then update the trigger:
gcloud builds triggers update vehicle-in-need-deploy \
  --project=gen-lang-client-0615287333 \
  --trigger-config=trigger-config.json
```

### Option 3: Update Trigger Configuration (YAML)

If you have the trigger defined in a YAML file:

```yaml
# CORRECT - No SERVICE_URL
substitutions:
  _REGION: us-west1
  _SERVICE: pre-order-dealer-exchange-tracker

# WRONG - Remove this
# substitutions:
#   SERVICE_URL: https://...  # ❌ Don't include this
#   _SERVICE_URL: https://... # ❌ Don't include this either
```

## Verification

### Step 1: Run Verification Script

The repository includes an automated verification script:

```bash
./scripts/verify-cloud-build-config.sh
```

Expected output:

```
✅ Found trigger: vehicle-in-need-deploy
✅ No SERVICE_URL in substitutions (correct)
✅ _REGION: us-west1
✅ _SERVICE: pre-order-dealer-exchange-tracker
🎉 Cloud Build trigger configuration is valid!
```

### Step 2: Run Static Analysis Check

The repository also includes a static guardrail to prevent SERVICE_URL regression:

```bash
npm run lint:cloudbuild
# or directly:
./scripts/check-cloudbuild-service-url.sh
```

This check runs automatically in CI to prevent SERVICE_URL from ever being added incorrectly.

### Step 3: Test Build Manually

```bash
gcloud builds submit --config cloudbuild.yaml \
  --substitutions _REGION=us-west1,_SERVICE=pre-order-dealer-exchange-tracker,SHORT_SHA=test-$(date +%Y%m%d-%H%M)
```

The build should:

1. ✅ Pass all build steps
2. ✅ Deploy to Cloud Run successfully
3. ✅ Retrieve `SERVICE_URL` dynamically in the `verify-css-deployed` step
4. ✅ Complete CSS verification

### Step 4: Trigger Build via GitHub

Push a commit to the `main` branch and verify the trigger runs successfully.

## Understanding the Code

### In cloudbuild.yaml (CORRECT)

```yaml
substitutions:
  # Custom substitutions (must start with underscore):
  _REGION: us-west1
  _SERVICE: pre-order-dealer-exchange-tracker
  # Built-in substitutions (automatically provided):
  # - PROJECT_ID, SHORT_SHA, BUILD_ID
  #
  # ⚠️ CRITICAL: SERVICE_URL is NOT a substitution!
  # - Never add SERVICE_URL or _SERVICE_URL here
  # - It's retrieved dynamically at runtime as a bash variable

steps:
  # ... build steps ...
  
  - name: gcr.io/cloud-builders/curl
    id: verify-css-deployed
    entrypoint: bash
    args:
      - -c
      - |
        # SERVICE_URL is a bash variable, NOT a substitution
        # It's retrieved AFTER deployment completes
        SERVICE_URL=$(gcloud run services describe ${_SERVICE} \
          --region=${_REGION} \
          --format='value(status.url)')
        
        echo "Service URL: $SERVICE_URL"
        # ... rest of verification ...
```

### Canonical Deployment Flows

#### 1. CI/CD via Cloud Build Trigger (Recommended)

**Setup**:

- Trigger name: `vehicle-in-need-deploy`
- Connected to GitHub repository
- Triggered on push to `main` branch
- Uses `cloudbuild.yaml` from repository

**Configuration**:

```yaml
# In Cloud Build trigger settings:
substitutions:
  _REGION: us-west1
  _SERVICE: pre-order-dealer-exchange-tracker
# Note: SHORT_SHA, PROJECT_ID, BUILD_ID are auto-provided
# ⚠️ DO NOT add SERVICE_URL here!
```

**Deployment Flow**:

1. Push commit to main branch
2. Cloud Build trigger activates automatically
3. Executes steps from `cloudbuild.yaml`
4. SERVICE_URL is retrieved dynamically in `verify-css-deployed` step
5. Deployment verified and complete

#### 2. Manual Deployment via gcloud CLI

For testing or emergency deployments:

```bash
gcloud builds submit \
  --config=cloudbuild.yaml \
  --project=gen-lang-client-0615287333 \
  --substitutions=_REGION=us-west1,_SERVICE=pre-order-dealer-exchange-tracker,SHORT_SHA=manual-$(date +%Y%m%d-%H%M)
```

**Important**:

- Include `_REGION` and `_SERVICE` in substitutions
- Include `SHORT_SHA` for image tagging
- DO NOT include `SERVICE_URL` in substitutions
- SERVICE_URL is retrieved automatically during the build

## Troubleshooting

### Error: "Trigger not found"

```bash
# List all triggers
gcloud builds triggers list --project=gen-lang-client-0615287333
```

### Error: "Permission denied"

You need these IAM roles:

- `roles/cloudbuild.builds.editor` - To edit triggers
- `roles/cloudbuild.builds.viewer` - To view trigger configuration

### Build Still Fails

1. Check the build logs in Cloud Console
2. Verify the trigger is using the latest `cloudbuild.yaml` from your repository
3. Ensure the trigger is connected to the correct repository and branch
4. Check that all required service accounts have necessary permissions

## Related Documentation

- [cloudbuild.yaml](./cloudbuild.yaml) - Build configuration
- [GCP_MANUAL_CONFIGURATION_CHECKLIST.md](./GCP_MANUAL_CONFIGURATION_CHECKLIST.md) - Complete GCP configuration guide with IAM roles
- [QUICK_FIX_CHECKLIST.md](./QUICK_FIX_CHECKLIST.md) - Quick reference checklist
- [scripts/verify-cloud-build-config.sh](./scripts/verify-cloud-build-config.sh) - Automated verification script
- [scripts/check-cloudbuild-service-url.sh](./scripts/check-cloudbuild-service-url.sh) - Static guardrail (runs in CI)
- [CLOUD_BUILD_FIX.md](./CLOUD_BUILD_FIX.md) - Historical context
- [CLOUD_BUILD_TRIGGER_FIX.md](./CLOUD_BUILD_TRIGGER_FIX.md) - Original fix guide
- [CLOUD_BUILD_CONFIGURATION.md](./CLOUD_BUILD_CONFIGURATION.md) - Complete configuration reference
- [Cloud Build Substitutions Docs](https://cloud.google.com/build/docs/configuring-builds/substitute-variable-values) - Official GCP docs

## Prevention: Static Guardrails

To prevent SERVICE_URL from ever being misused as a substitution again, this repository includes:

### 1. Static Analysis Script

**Script**: `scripts/check-cloudbuild-service-url.sh`

Automatically checks:

- ✅ cloudbuild.yaml has no SERVICE_URL in substitutions block
- ✅ No shell scripts use `--substitutions=SERVICE_URL`
- ✅ cloudbuild.yaml is valid YAML

**Run locally**:

```bash
npm run lint:cloudbuild
# or directly:
./scripts/check-cloudbuild-service-url.sh
```

### 2. Automated CI Check

This check runs automatically in GitHub Actions on every PR to prevent regression.

See `.github/workflows/ci.yml` for the integration.

## Required IAM Roles

### Cloud Build Service Account

**Account**: `cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com`

Required roles:

- `roles/run.admin` - Deploy Cloud Run services
- `roles/iam.serviceAccountUser` - Use Cloud Run runtime service account
- `roles/artifactregistry.writer` - Push images to Artifact Registry

### Cloud Run Runtime Service Account

**Account**: `pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com`

Required roles:

- `roles/logging.logWriter` - Write logs to Cloud Logging
- `roles/secretmanager.secretAccessor` - Access `vehicle-in-need-gemini` secret

See [GCP_MANUAL_CONFIGURATION_CHECKLIST.md](./GCP_MANUAL_CONFIGURATION_CHECKLIST.md) for complete IAM setup instructions.

## Quick Reference

### Valid Substitutions for Trigger

| Variable | Value | Optional | Notes |
| --- | --- | --- | --- |
| `_REGION` | `us-west1` | Yes | Deployment region |
| `_SERVICE` | `pre-order-dealer-exchange-tracker` | Yes | Cloud Run service name |
| `SHORT_SHA` | (auto) | N/A | Built-in, auto-provided |
| `PROJECT_ID` | (auto) | N/A | Built-in, auto-provided |
| `BUILD_ID` | (auto) | N/A | Built-in, auto-provided |

### What NOT to Include

- ❌ `SERVICE_URL` - This is a bash variable, not a substitution
- ❌ `_SERVICE_URL` - Still wrong, even with underscore
- ❌ Any URL or value that doesn't exist before the build starts

---

**Status**: Ready for manual trigger configuration update in GCP Console

**Last Updated**: 2025-11-18
