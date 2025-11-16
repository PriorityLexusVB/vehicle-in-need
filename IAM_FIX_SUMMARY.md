# Cloud Run IAM Permissions Fix - Implementation Summary

## Problem Statement

Cloud Build deployment for `pre-order-dealer-exchange-tracker` was failing with:

```
ERROR: (gcloud.run.deploy) PERMISSION_DENIED: Permission 'iam.serviceaccounts.actAs' denied 
on service account pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com 
(or it may not exist). 

This command is authenticated as cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com 
which is the active account specified by the [core/account] property.
```

## Root Cause

The Cloud Build service account (`cloud-build-deployer@...`) lacked the `roles/iam.serviceAccountUser` permission on the runtime service account (`pre-order-dealer-exchange-860@...`), preventing it from deploying Cloud Run services that use the runtime SA.

## Solution Overview

The fix involves granting proper IAM permissions to allow the Cloud Build service account to:
1. Deploy Cloud Run services (`roles/run.admin`)
2. Impersonate the runtime service account during deployment (`roles/iam.serviceAccountUser`)

The runtime service account needs permissions to:
1. Write logs to Cloud Logging (`roles/logging.logWriter`)
2. Access the Gemini API secret at runtime (`roles/secretmanager.secretAccessor`)

## Changes Made

### 1. Documentation Added

**New Files**:
- `IAM_FIX_EXECUTION_GUIDE.md` - Comprehensive step-by-step guide for applying IAM permissions
- `QUICK_IAM_FIX.md` - TL;DR quick reference with essential commands
- This file - Summary for issue/PR comments

**Enhanced Files**:
- `scripts/setup-iam-permissions.sh` - Added service account existence verification
  - New Step 0: Verify service accounts exist
  - Auto-creates runtime SA if missing
  - Better error messages and validation

### 2. IAM Permissions Required

The following IAM bindings must be applied in GCP (requires network access):

#### Cloud Build Service Account Permissions

**Service Account**: `cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com`

**Project-Level Roles**:
- `roles/run.admin` - Deploy and manage Cloud Run services
- `roles/artifactregistry.writer` - Push Docker images (likely already exists)
- `roles/cloudbuild.builds.editor` - Manage Cloud Build jobs (likely already exists)

**Service Account-Level Binding**:
- `roles/iam.serviceAccountUser` on `pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com`
  - **This is the critical permission that fixes the `actAs` error**

#### Runtime Service Account Permissions

**Service Account**: `pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com`

**Project-Level Roles**:
- `roles/logging.logWriter` - Write logs to Cloud Logging

**Secret-Level Bindings**:
- `roles/secretmanager.secretAccessor` on `vehicle-in-need-gemini` secret - Access API key at runtime

### 3. Configuration Files

**No changes required** - The `cloudbuild.yaml` file already has the correct configuration:
- Line 82: `--service-account=pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com`
- Image path: `us-west1-docker.pkg.dev/gen-lang-client-0615287333/vehicle-in-need/pre-order-dealer-exchange-tracker:${SHORT_SHA}`
- Region: `us-west1`
- Secrets: `--update-secrets=API_KEY=vehicle-in-need-gemini:latest`

## Execution Instructions

The IAM permissions must be applied from an environment with GCP network access (Cloud Shell or local terminal with gcloud authenticated).

### Quick Method (Automated Script)

```bash
# Clone repository
git clone https://github.com/PriorityLexusVB/vehicle-in-need.git
cd vehicle-in-need

# Review what will be done (dry-run)
./scripts/setup-iam-permissions.sh

# Apply IAM permissions
./scripts/setup-iam-permissions.sh --execute
```

### Manual Method (Individual Commands)

See `QUICK_IAM_FIX.md` for copy-paste commands or `IAM_FIX_EXECUTION_GUIDE.md` for detailed step-by-step instructions.

**Critical command** (fixes the actAs error):
```bash
gcloud iam service-accounts add-iam-policy-binding \
  pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com \
  --member="serviceAccount:cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser" \
  --project="gen-lang-client-0615287333"
```

## Testing the Fix

After applying IAM permissions, test the deployment:

### Option 1: Trigger via GitHub Actions
1. Push to `main` branch or re-run existing workflow
2. Monitor at: https://github.com/PriorityLexusVB/vehicle-in-need/actions

### Option 2: Manual Cloud Build Submission
```bash
cd /path/to/vehicle-in-need
gcloud builds submit --config cloudbuild.yaml \
  --substitutions SHORT_SHA=test-$(date +%Y%m%d-%H%M) \
  --project=gen-lang-client-0615287333
```

### Expected Result

All Cloud Build steps should succeed:
1. ✅ Check for conflict markers
2. ✅ Build Docker image
3. ✅ Push image to Artifact Registry (SHORT_SHA and latest tags)
4. ✅ **Deploy to Cloud Run** (previously failed, now succeeds)

## Verification

After successful deployment:

```bash
# Verify service account is correctly set
gcloud run services describe pre-order-dealer-exchange-tracker \
  --region=us-west1 \
  --project=gen-lang-client-0615287333 \
  --format="table(metadata.name,status.url,spec.template.spec.serviceAccountName)"

# Test health endpoint
SERVICE_URL=$(gcloud run services describe pre-order-dealer-exchange-tracker \
  --region=us-west1 \
  --project=gen-lang-client-0615287333 \
  --format='value(status.url)')

curl -f "$SERVICE_URL/health"
# Expected: healthy

# Test status API
curl -s "$SERVICE_URL/api/status" | jq '.'
# Expected: JSON with status, version, geminiEnabled, etc.
```

## Security Considerations

This implementation follows the **principle of least privilege**:

1. **Separation of Concerns**:
   - Cloud Build SA: Only deployment permissions (no runtime access)
   - Runtime SA: Only runtime permissions (no deployment access)
   - Default compute SA: Not used (should be de-privileged separately)

2. **Minimal Permissions**:
   - Cloud Build SA can only impersonate the specific runtime SA (not all SAs)
   - Runtime SA can only access the specific secret it needs
   - No Editor or Owner roles granted

3. **Audit Trail**:
   - All deployment actions logged with Cloud Build SA identity
   - All runtime actions logged with Runtime SA identity

## Files Changed

### New Files
- `IAM_FIX_EXECUTION_GUIDE.md` - Comprehensive execution guide
- `QUICK_IAM_FIX.md` - Quick reference commands
- `IAM_FIX_SUMMARY.md` - This summary document

### Modified Files
- `scripts/setup-iam-permissions.sh` - Enhanced with SA existence verification

### Unchanged Files (Already Correct)
- `cloudbuild.yaml` - Already specifies runtime SA correctly
- `.github/workflows/build-and-deploy.yml` - Already correct
- `IAM_CONFIGURATION_SUMMARY.md` - Already documents the required permissions
- `CLOUD_RUN_DEPLOYMENT_RUNBOOK.md` - Already has deployment instructions

## Next Steps

1. **Apply IAM Permissions**: Execute the setup script or run manual commands from Cloud Shell
2. **Test Deployment**: Trigger a build to verify the fix works
3. **Monitor**: Watch for successful deployments in Cloud Build console
4. **Optional Cleanup**: Review and de-privilege default compute SA if desired (see `IAM_CONFIGURATION_SUMMARY.md`)

## Related Documentation

- **Quick Start**: [QUICK_IAM_FIX.md](./QUICK_IAM_FIX.md) - 5-minute fix
- **Detailed Guide**: [IAM_FIX_EXECUTION_GUIDE.md](./IAM_FIX_EXECUTION_GUIDE.md) - Complete walkthrough
- **IAM Architecture**: [IAM_CONFIGURATION_SUMMARY.md](./IAM_CONFIGURATION_SUMMARY.md) - Full IAM design
- **Deployment**: [CLOUD_RUN_DEPLOYMENT_RUNBOOK.md](./CLOUD_RUN_DEPLOYMENT_RUNBOOK.md) - Deployment procedures
- **Automated Setup**: [scripts/setup-iam-permissions.sh](./scripts/setup-iam-permissions.sh) - IAM setup script

## Constraints Respected

✅ No existing IAM bindings removed (additive changes only)  
✅ No application code changed  
✅ No environment variables modified  
✅ All commands scoped to project `gen-lang-client-0615287333`  
✅ Maintains compatibility with existing successful deployments  
✅ Follows principle of least privilege  

## Deliverables

✅ **Verified IAM Bindings Documentation** - Documented in multiple guides  
✅ **Updated cloudbuild.yaml** - Already correct, no changes needed  
✅ **Setup Scripts** - Enhanced `setup-iam-permissions.sh` with validation  
✅ **Execution Guides** - Three levels of documentation (quick, detailed, summary)  
✅ **Written Summary** - This document for PR/issue comments  

---

**Status**: ✅ Documentation complete and ready for execution  
**Action Required**: Apply IAM permissions from a networked GCP environment (Cloud Shell recommended)  
**Time Required**: ~5 minutes to apply, 1-2 minutes for propagation, 5-10 minutes to test deployment
