# IAM Configuration Validation Checklist

This document provides a step-by-step validation checklist for verifying the Cloud Build and Cloud Run IAM configuration changes.

## Prerequisites

Before starting validation, ensure you have:

- [ ] GCP project access: `gen-lang-client-0615287333`
- [ ] Owner or Security Admin role on the project
- [ ] `gcloud` CLI installed and authenticated
- [ ] Access to Cloud Console
- [ ] Access to the GitHub repository `PriorityLexusVB/vehicle-in-need`

## Phase 1: Pre-Deployment Validation

### 1.1 Verify Repository Changes

- [ ] Confirm the PR contains these files:
  - `cloudbuild.yaml` (modified)
  - `scripts/deploy-cloud-run.sh` (modified)
  - `CLOUD_RUN_DEPLOYMENT_RUNBOOK.md` (modified)
  - `scripts/setup-iam-permissions.sh` (new)
  - `IAM_CONFIGURATION_SUMMARY.md` (new)

- [ ] Review `cloudbuild.yaml` changes:
  - [ ] Line 82: Verify `--service-account=pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com` is present
  - [ ] Lines 12-21: Verify updated service account requirements comments

- [ ] Review `scripts/deploy-cloud-run.sh` changes:
  - [ ] Line 209: Verify `--service-account=pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com` is added

### 1.2 Document Current IAM State (Before Changes)

Run these commands to capture the current state:

```bash
# Save Cloud Build SA current permissions
gcloud projects get-iam-policy gen-lang-client-0615287333 \
  --flatten="bindings[].members" \
  --filter="bindings.members:cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com" \
  --format="table(bindings.role)" > /tmp/cloud-build-sa-before.txt

# Save Runtime SA current permissions
gcloud projects get-iam-policy gen-lang-client-0615287333 \
  --flatten="bindings[].members" \
  --filter="bindings.members:pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com" \
  --format="table(bindings.role)" > /tmp/runtime-sa-before.txt

# Save Default Compute SA current permissions
gcloud projects get-iam-policy gen-lang-client-0615287333 \
  --flatten="bindings[].members" \
  --filter="bindings.members:842946218691-compute@developer.gserviceaccount.com" \
  --format="table(bindings.role)" > /tmp/default-compute-sa-before.txt

# Check impersonation permissions
gcloud iam service-accounts get-iam-policy \
  pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com \
  --project=gen-lang-client-0615287333 > /tmp/runtime-sa-iam-policy-before.txt
```

- [ ] Review and save the output files for comparison later

## Phase 2: Apply IAM Configuration

### 2.1 Run IAM Setup Script (Dry-Run)

```bash
cd /path/to/vehicle-in-need
./scripts/setup-iam-permissions.sh
```

- [ ] Review all commands that will be executed
- [ ] Verify no unexpected commands are present
- [ ] Check that the script targets the correct service accounts

### 2.2 Apply IAM Changes

```bash
./scripts/setup-iam-permissions.sh --execute
```

- [ ] Verify each step completes successfully
- [ ] Note any errors or warnings
- [ ] If errors occur, do NOT proceed - review and fix IAM issues first

### 2.3 Verify IAM Changes

Run the verification commands:

```bash
# 1. Verify Cloud Build SA permissions
gcloud projects get-iam-policy gen-lang-client-0615287333 \
  --flatten="bindings[].members" \
  --filter="bindings.members:cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com" \
  --format="table(bindings.role)"
```

**Expected roles:**

- [ ] `roles/run.admin`
- [ ] `roles/artifactregistry.writer`
- [ ] `roles/cloudbuild.builds.editor`

```bash
# 2. Verify Runtime SA permissions
gcloud projects get-iam-policy gen-lang-client-0615287333 \
  --flatten="bindings[].members" \
  --filter="bindings.members:pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com" \
  --format="table(bindings.role)"
```

**Expected roles:**

- [ ] `roles/logging.logWriter`

```bash
# 3. Verify impersonation permission
gcloud iam service-accounts get-iam-policy \
  pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com \
  --project=gen-lang-client-0615287333
```

**Expected output should contain:**

- [ ] Binding with `role: roles/iam.serviceAccountUser`
- [ ] Member: `serviceAccount:cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com`

```bash
# 4. Verify secret access
gcloud secrets get-iam-policy vehicle-in-need-gemini --project=gen-lang-client-0615287333
```

**Expected output should contain:**

- [ ] Runtime SA with `roles/secretmanager.secretAccessor`

## Phase 3: Update Cloud Build Trigger

### 3.1 Verify Trigger Configuration

1. Navigate to: [Cloud Build Triggers](https://console.cloud.google.com/cloud-build/triggers?project=gen-lang-client-0615287333)
2. Find the `vehicle-in-need-deploy` trigger
3. Click "Edit"

Verify:

- [ ] **Repository:** `PriorityLexusVB/vehicle-in-need` (GitHub)
- [ ] **Branch:** Configured to trigger on appropriate branch (e.g., `main` or `^copilot/.*`)
- [ ] **Build configuration:** `cloudbuild.yaml`
- [ ] **Service account:** `cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com`
- [ ] No inline YAML overrides present

- [ ] If any settings are incorrect, update them and save

## Phase 4: Test Deployment

### 4.1 Merge the PR

- [ ] Ensure all checks pass on the PR
- [ ] Get code review approval
- [ ] Merge the PR to the target branch

### 4.2 Trigger a Test Build

Option A: Automatic trigger (if configured)

- [ ] The merge should automatically trigger the Cloud Build

Option B: Manual trigger

```bash
cd /path/to/vehicle-in-need
git checkout main  # or appropriate branch
git pull

# Trigger a build
gcloud builds submit \
  --config cloudbuild.yaml \
  --substitutions SHORT_SHA=$(git rev-parse --short=7 HEAD),_REGION=us-west1,_SERVICE=pre-order-dealer-exchange-tracker
```

### 4.3 Monitor the Build

1. Go to: [Cloud Build History](https://console.cloud.google.com/cloud-build/builds?project=gen-lang-client-0615287333)
2. Find the latest build for `vehicle-in-need-deploy`

Monitor each step:

- [ ] **Step 1: check-conflicts** - Should pass (no merge conflicts)
- [ ] **Step 2: build-image** - Should build the Docker image successfully
- [ ] **Step 3: push-image** - Should push the image to Artifact Registry
- [ ] **Step 4: push-latest** - Should update the `latest` tag
- [ ] **Step 5: deploy-cloud-run** - Should deploy to Cloud Run **without** `iam.serviceaccounts.actAs` error

**Critical Success Criteria:**

- [ ] Build completes with `SUCCESS` status
- [ ] No `PERMISSION_DENIED` errors in step 5
- [ ] No `iam.serviceaccounts.actAs` errors

### 4.4 Capture Build Logs

```bash
# Get the build ID from the Cloud Build console
export BUILD_ID=<build-id-from-console>

# Download logs
gcloud builds log $BUILD_ID --project=gen-lang-client-0615287333 > /tmp/build-log.txt
```

- [ ] Review logs for any warnings or errors
- [ ] Confirm the deploy step includes `--service-account=pre-order-dealer-exchange-860@...`

## Phase 5: Verify Cloud Run Service

### 5.1 Check Service Configuration

```bash
gcloud run services describe pre-order-dealer-exchange-tracker \
  --region=us-west1 \
  --project=gen-lang-client-0615287333 \
  --format=yaml > /tmp/cloud-run-service.yaml
```

Review the output file and verify:

- [ ] `spec.template.spec.serviceAccountName: pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com`
- [ ] Latest image is deployed
- [ ] Environment variables are correct
- [ ] Secrets are mounted correctly

### 5.2 Test Service Health

```bash
# Get service URL
export SERVICE_URL=$(gcloud run services describe pre-order-dealer-exchange-tracker \
  --region=us-west1 \
  --project=gen-lang-client-0615287333 \
  --format='value(status.url)')

# Test health endpoint
curl -v $SERVICE_URL/health
```

**Expected:**

- [ ] HTTP 200 OK response
- [ ] Valid health check response

### 5.3 Test Application Functionality

1. Open the service URL in a browser
2. Verify core functionality:
   - [ ] Application loads without errors
   - [ ] Can authenticate (if required)
   - [ ] Can view orders (if user has access)
   - [ ] API endpoints respond correctly

### 5.4 Check Service Logs

```bash
gcloud run services logs read pre-order-dealer-exchange-tracker \
  --region=us-west1 \
  --project=gen-lang-client-0615287333 \
  --limit=50
```

Verify:

- [ ] No permission errors related to secrets
- [ ] No IAM errors
- [ ] Application starts successfully
- [ ] No unexpected errors

## Phase 6: Validate IAM Security

### 6.1 Verify Least Privilege

Confirm that service accounts have only the necessary permissions:

```bash
# Cloud Build SA should NOT have these roles:
# - roles/editor
# - roles/owner
# - Direct secret access (secrets are handled by Cloud Run)

# Runtime SA should NOT have these roles:
# - roles/editor
# - roles/owner
# - roles/run.admin
# - roles/iam.serviceAccountUser

# Verify by listing all project roles:
gcloud projects get-iam-policy gen-lang-client-0615287333 \
  --flatten="bindings[].members" \
  --filter="bindings.members:*@gen-lang-client-0615287333.iam.gserviceaccount.com" \
  --format="table(bindings.members,bindings.role)"
```

- [ ] Cloud Build SA has only: run.admin, artifactregistry.writer, cloudbuild.builds.editor
- [ ] Runtime SA has only: logging.logWriter (+ secret access at secret level)
- [ ] No service account has Editor or Owner roles

### 6.2 Review Default Compute SA (Optional)

⚠️ **CAUTION:** Only proceed if you're certain no other services use this SA.

```bash
# Check if default compute SA is still being used elsewhere
gcloud run services list \
  --project=gen-lang-client-0615287333 \
  --format="table(metadata.name,spec.template.spec.serviceAccountName)"
```

- [ ] Verify that `pre-order-dealer-exchange-tracker` uses `pre-order-dealer-exchange-860@...`
- [ ] Check if any other services use `842946218691-compute@...`
- [ ] If no services use the default compute SA, consider de-privileging it (per IAM_CONFIGURATION_SUMMARY.md)

## Phase 7: Documentation and Handoff

### 7.1 Update Documentation

- [ ] Confirm all documentation is up to date:
  - [ ] `cloudbuild.yaml` comments
  - [ ] `CLOUD_RUN_DEPLOYMENT_RUNBOOK.md`
  - [ ] `IAM_CONFIGURATION_SUMMARY.md`
  - [ ] `scripts/setup-iam-permissions.sh` help text

### 7.2 Create Summary Report

Create a summary document with:

- [ ] Before/after IAM bindings comparison
- [ ] Screenshot or text of successful Cloud Build run
- [ ] Confirmation that deployment error is resolved
- [ ] Any remaining warnings or items for future review

### 7.3 Optional: De-privilege Default Compute SA

⚠️ **IMPORTANT:** Only do this if Phase 6.2 confirms it's not used by other services.

```bash
# Review current bindings
gcloud projects get-iam-policy gen-lang-client-0615287333 \
  --flatten="bindings[].members" \
  --filter="bindings.members:842946218691-compute@developer.gserviceaccount.com"

# Remove unnecessary roles (example - adjust as needed):
# gcloud projects remove-iam-policy-binding gen-lang-client-0615287333 \
#   --member="serviceAccount:842946218691-compute@developer.gserviceaccount.com" \
#   --role="roles/editor"
```

## Rollback Plan (If Needed)

If the deployment fails or causes issues:

### Option 1: Revert Code Changes

```bash
git revert <commit-sha>
git push
```

### Option 2: Restore Previous IAM Bindings

Use the "before" snapshots saved in Phase 1.2 to restore previous IAM configuration.

### Option 3: Emergency Deploy with Old Configuration

Temporarily deploy without the service account flag:

```bash
gcloud run deploy pre-order-dealer-exchange-tracker \
  --image=us-west1-docker.pkg.dev/gen-lang-client-0615287333/vehicle-in-need/pre-order-dealer-exchange-tracker:latest \
  --region=us-west1 \
  --allow-unauthenticated
```

## Validation Complete

When all checklist items are complete and verified:

- [ ] All IAM permissions are correctly configured
- [ ] Cloud Build deploys successfully without permission errors
- [ ] Cloud Run service is running with the correct runtime SA
- [ ] Application functionality is verified
- [ ] Security audit confirms least privilege access
- [ ] Documentation is complete and accurate

**Sign-off:**

- Tester Name: ________________
- Date: ________________
- Build ID: ________________
- Deployment Status: ☐ Success  ☐ Failed  ☐ Partial
- Notes: ________________________________________________
