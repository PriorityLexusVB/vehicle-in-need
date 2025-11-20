# Cloud Build Error Fix Guide

**Error Reference**: Build ID `ba239e76-a1ad-4e30-bf0e-1ca4eb1fa401`
**Project**: `gen-lang-client-0615287333`
**Date**: November 2024

---

## Executive Summary

This guide provides a **definitive solution** to fix Cloud Build errors in this project. The primary cause of Cloud Build failures is **missing or misconfigured IAM permissions** for the service accounts used during build and deployment.

**Time to fix**: ~10 minutes (with proper access)
**Prerequisites**: Owner or Security Admin role on the GCP project

---

## Quick Fix (Step-by-Step)

### Prerequisites Check

Before starting, ensure you have:

1. ✅ Access to Google Cloud Console for project `gen-lang-client-0615287333`
2. ✅ Owner or Security Admin IAM role
3. ✅ `gcloud` CLI installed and authenticated (for command-line approach)

### Option A: Automated Fix (Recommended)

Run the automated IAM setup script that configures all required permissions:

```bash
# Clone the repository (if not already done)
git clone https://github.com/PriorityLexusVB/vehicle-in-need.git
cd vehicle-in-need

# First, do a dry-run to see what will be done
./scripts/setup-iam-permissions.sh

# Then execute the changes
./scripts/setup-iam-permissions.sh --execute
```

The script will:

- ✅ Verify that service accounts exist (create runtime SA if missing)
- ✅ Grant Cloud Run Admin to Cloud Build SA
- ✅ Grant Artifact Registry Writer to Cloud Build SA
- ✅ Grant Service Account User role (the critical `actAs` permission)
- ✅ Grant logging and secret access to runtime SA

### Option B: Manual Fix (GCP Console)

#### Step 1: Navigate to IAM & Admin

1. Go to: <https://console.cloud.google.com/iam-admin/iam?project=gen-lang-client-0615287333>
2. Search for service account: `cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com`

#### Step 2: Grant Permissions to Cloud Build Service Account

Add the following roles to `cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com`:

| Role | Purpose | How to Add |
|------|---------|------------|
| `Cloud Run Admin` | Deploy Cloud Run services | Click pencil icon → Add role → Search "Cloud Run Admin" → Save |
| `Artifact Registry Writer` | Push Docker images | Click pencil icon → Add role → Search "Artifact Registry Writer" → Save |
| `Cloud Build Editor` | Manage build operations | Click pencil icon → Add role → Search "Cloud Build Editor" → Save |

#### Step 3: Grant actAs Permission (CRITICAL)

This is the most critical step that fixes the `PERMISSION_DENIED: Permission 'iam.serviceaccounts.actAs' denied` error:

1. Go to: <https://console.cloud.google.com/iam-admin/serviceaccounts?project=gen-lang-client-0615287333>
2. Find service account: `pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com`
3. Click on the service account email
4. Go to the **PERMISSIONS** tab
5. Click **GRANT ACCESS**
6. In "Add principals", enter: `cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com`
7. In "Select a role", choose: **Service Account User**
8. Click **SAVE**

#### Step 4: Grant Runtime Service Account Permissions

For `pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com`, add these roles at the project level:

| Role | Purpose |
|------|---------|
| `Logs Writer` | Write application logs to Cloud Logging |

For the secret `vehicle-in-need-gemini`:

1. Go to: <https://console.cloud.google.com/security/secret-manager?project=gen-lang-client-0615287333>
2. Click on secret: `vehicle-in-need-gemini`
3. Go to **PERMISSIONS** tab
4. Click **GRANT ACCESS**
5. Add principal: `pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com`
6. Role: **Secret Manager Secret Accessor**
7. Click **SAVE**

### Option C: Command-Line Fix

If you prefer using `gcloud` CLI, run these commands from Cloud Shell or your terminal:

```bash
# Set the project
gcloud config set project gen-lang-client-0615287333

# 1. Grant Cloud Run Admin to Cloud Build SA
gcloud projects add-iam-policy-binding gen-lang-client-0615287333 \
  --member="serviceAccount:cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com" \
  --role="roles/run.admin"

# 2. Grant Artifact Registry Writer to Cloud Build SA
gcloud projects add-iam-policy-binding gen-lang-client-0615287333 \
  --member="serviceAccount:cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

# 3. Grant Cloud Build Editor to Cloud Build SA
gcloud projects add-iam-policy-binding gen-lang-client-0615287333 \
  --member="serviceAccount:cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com" \
  --role="roles/cloudbuild.builds.editor"

# 4. Grant actAs permission (CRITICAL - fixes the main error)
gcloud iam service-accounts add-iam-policy-binding \
  pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com \
  --member="serviceAccount:cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser" \
  --project="gen-lang-client-0615287333"

# 5. Grant Logs Writer to Runtime SA
gcloud projects add-iam-policy-binding gen-lang-client-0615287333 \
  --member="serviceAccount:pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com" \
  --role="roles/logging.logWriter"

# 6. Grant Secret Manager access to Runtime SA
gcloud secrets add-iam-policy-binding vehicle-in-need-gemini \
  --member="serviceAccount:pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --project="gen-lang-client-0615287333"
```

---

## Verification

After applying the fixes, verify that permissions are correctly configured:

### 1. Verify Cloud Build SA Permissions

```bash
gcloud projects get-iam-policy gen-lang-client-0615287333 \
  --flatten='bindings[].members' \
  --filter='bindings.members:cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com' \
  --format='table(bindings.role)'
```

**Expected output should include**:

- `roles/run.admin`
- `roles/artifactregistry.writer`
- `roles/cloudbuild.builds.editor`

### 2. Verify actAs Permission (Most Important)

```bash
gcloud iam service-accounts get-iam-policy \
  pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com \
  --project="gen-lang-client-0615287333"
```

**Expected output should show**:

```yaml
bindings:
- members:
  - serviceAccount:cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com
  role: roles/iam.serviceAccountUser
```

### 3. Verify Runtime SA Permissions

```bash
gcloud projects get-iam-policy gen-lang-client-0615287333 \
  --flatten='bindings[].members' \
  --filter='bindings.members:pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com' \
  --format='table(bindings.role)'
```

**Expected output should include**:

- `roles/logging.logWriter`

### 4. Verify Secret Access

```bash
gcloud secrets get-iam-policy vehicle-in-need-gemini \
  --project="gen-lang-client-0615287333"
```

**Expected output should show**:

```yaml
bindings:
- members:
  - serviceAccount:pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com
  role: roles/secretmanager.secretAccessor
```

---

## Test the Fix

After applying permissions, test the deployment:

### Option 1: Trigger via GitHub Push

```bash
# Make a trivial change and push to main
git commit --allow-empty -m "test: verify Cloud Build permissions fix"
git push origin main
```

Then monitor the build at:
<https://console.cloud.google.com/cloud-build/builds?project=gen-lang-client-0615287333>

### Option 2: Manual Cloud Build Submit

```bash
cd /path/to/vehicle-in-need
SHORT_SHA=$(git rev-parse --short HEAD)

gcloud builds submit \
  --config cloudbuild.yaml \
  --substitutions=_REGION=us-west1,_SERVICE=pre-order-dealer-exchange-tracker,SHORT_SHA=$SHORT_SHA \
  --project=gen-lang-client-0615287333
```

### Expected Success Output

The build should proceed through all steps successfully:

```
✓ Check for conflict markers
✓ Validate version
✓ Build Docker image
✓ Push image to Artifact Registry (with tag: SHORT_SHA)
✓ Push latest tag
✓ Deploy to Cloud Run  ← Should succeed now with proper permissions
✓ Verify CSS deployed
✓ Verify version
```

---

## Common Issues and Solutions

### Issue 1: "Service account not found"

**Symptom**: Error saying `pre-order-dealer-exchange-860@...` doesn't exist

**Solution**: Create the runtime service account:

```bash
gcloud iam service-accounts create pre-order-dealer-exchange-860 \
  --project=gen-lang-client-0615287333 \
  --display-name="Pre-order Dealer Exchange Runtime" \
  --description="Runtime service account for Cloud Run service"
```

### Issue 2: "Permission denied" when running gcloud commands

**Symptom**: Cannot run `gcloud` IAM commands

**Solution**:

1. Verify you're authenticated: `gcloud auth list`
2. Ensure you have Owner or Security Admin role
3. Request access from project administrator if needed

### Issue 3: Changes not taking effect

**Symptom**: Build still fails after applying permissions

**Solution**:

1. **Wait 1-2 minutes** for IAM changes to propagate
2. Verify all permissions were applied using the verification commands above
3. Check that you applied permissions to the correct service accounts (watch for typos)
4. Review the actual Cloud Build error log for specific permission issues

### Issue 4: Different error after fixing permissions

**Symptom**: Build fails with a different error message

**Solution**:

1. Check the Cloud Build logs for the specific error
2. Common secondary issues:
   - **Artifact Registry repository doesn't exist**: Create it or verify the name
   - **Secret doesn't exist**: Create `vehicle-in-need-gemini` secret
   - **Cloud Run service name mismatch**: Verify `_SERVICE` substitution matches actual service
3. Review the [Cloud Build Trigger Runbook](docs/operations/CLOUD_BUILD_TRIGGER_RUNBOOK.md) for other common issues

---

## Architecture Overview

### Service Accounts Used

```
┌─────────────────────────────────────────────────────────────┐
│  Cloud Build Service Account                                 │
│  cloud-build-deployer@gen-lang-client-0615287333...         │
│                                                               │
│  Permissions:                                                 │
│  ✓ roles/run.admin (deploy Cloud Run)                       │
│  ✓ roles/artifactregistry.writer (push images)              │
│  ✓ roles/cloudbuild.builds.editor (manage builds)           │
│  ✓ roles/iam.serviceAccountUser on runtime SA (actAs)       │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ uses actAs to deploy as
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Cloud Run Runtime Service Account                           │
│  pre-order-dealer-exchange-860@gen-lang-client-0615287333... │
│                                                               │
│  Permissions:                                                 │
│  ✓ roles/logging.logWriter (write logs)                     │
│  ✓ roles/secretmanager.secretAccessor (access secrets)      │
└─────────────────────────────────────────────────────────────┘
```

### Why These Permissions Are Required

1. **Cloud Run Admin**: Allows Cloud Build to create/update Cloud Run services
2. **Artifact Registry Writer**: Allows Cloud Build to push Docker images
3. **Cloud Build Editor**: Allows Cloud Build to manage its own build resources
4. **Service Account User (actAs)**: **Critical** - Allows Cloud Build to deploy Cloud Run services with the runtime service account. Without this, you get the `iam.serviceaccounts.actAs` permission denied error.
5. **Logs Writer**: Allows the Cloud Run service to write application logs
6. **Secret Manager Secret Accessor**: Allows the Cloud Run service to access API keys and other secrets at runtime

---

## Prevention: Automated Checks

This repository includes automated checks to prevent configuration issues:

### CI/CD Checks

Every PR runs:

```bash
npm run lint:cloudbuild
```

This verifies:

- ✅ No SERVICE_URL in Cloud Build substitutions
- ✅ Valid YAML syntax
- ✅ No conflict markers in source code

### Local Development

Before committing, run:

```bash
npm run lint
npm run lint:cloudbuild
npm test
```

---

## Related Documentation

- [IAM Quick Fix Guide](docs/archive/QUICK_IAM_FIX.md) - Shorter version focused on the actAs permission
- [Cloud Build Trigger Runbook](docs/operations/CLOUD_BUILD_TRIGGER_RUNBOOK.md) - Trigger configuration troubleshooting
- [IAM Setup Script](scripts/setup-iam-permissions.sh) - Automated permission setup
- [Deployment Guide](DEPLOYMENT_GUIDE.md) - Complete deployment procedures

---

## Support

If you continue to experience issues after following this guide:

1. **Check the actual error message** in Cloud Build logs:
   - <https://console.cloud.google.com/cloud-build/builds?project=gen-lang-client-0615287333>
   - Look for specific permission or resource errors

2. **Run the verification commands** in the "Verification" section above to ensure all permissions are correctly configured

3. **Review IAM bindings** in the GCP Console to confirm service accounts have the required roles

4. **Wait 1-2 minutes** after making IAM changes before retrying the build (IAM changes can take time to propagate)

5. **Check for API enablement**: Ensure these APIs are enabled:

   ```bash
   gcloud services list --project=gen-lang-client-0615287333 | grep -E "(run|artifactregistry|cloudbuild|secretmanager)"
   ```

---

**Last Updated**: November 2024
**Project**: gen-lang-client-0615287333
**Service**: pre-order-dealer-exchange-tracker
**Region**: us-west1
