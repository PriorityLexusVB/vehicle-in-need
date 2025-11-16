# Cloud Build IAM Fix - Implementation Summary

## Executive Summary

This implementation fixes the Cloud Build deployment failure by explicitly specifying the runtime service account in Cloud Run deployment commands. This resolves the `PERMISSION_DENIED: Permission 'iam.serviceaccounts.actAs' denied` error that was preventing successful deployments.

## Problem Statement

**Error Message:**
```
PERMISSION_DENIED: Permission 'iam.serviceaccounts.actAs' denied on service account 
842946218691-compute@developer.gserviceaccount.com ... authenticated as 
cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com
```

**Root Cause:**
- The `cloudbuild.yaml` deploy step did not specify a `--service-account` flag
- Cloud Run defaulted to using the default compute engine service account
- The Cloud Build deployer SA did not have permission to impersonate the default compute SA
- This created a permission error during deployment

## Solution Overview

The fix involves two components:

### 1. Code Changes (Minimal)
- Add `--service-account=pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com` to Cloud Run deploy commands
- Update in both `cloudbuild.yaml` and `scripts/deploy-cloud-run.sh`

### 2. IAM Configuration (Required by GCP Admin)
- Grant Cloud Build SA permission to impersonate the runtime SA
- Ensure runtime SA has necessary runtime permissions
- Follow least-privilege security model

## Files Changed

### Modified Files
1. **cloudbuild.yaml** (+1 line, comments updated)
   - Line 82: Added `--service-account` flag
   - Lines 12-21: Updated service account documentation

2. **scripts/deploy-cloud-run.sh** (+1 line)
   - Line 209: Added `--service-account` flag

3. **CLOUD_RUN_DEPLOYMENT_RUNBOOK.md** (major update)
   - Rewrote IAM section with comprehensive documentation
   - Added automated setup instructions
   - Updated all deployment examples

### New Files Created
4. **scripts/setup-iam-permissions.sh** (247 lines)
   - Automated IAM configuration script
   - Dry-run mode by default
   - Grants all required permissions
   - Includes verification commands

5. **IAM_CONFIGURATION_SUMMARY.md** (270 lines)
   - Comprehensive IAM documentation
   - Service account roles and purposes
   - Configuration commands
   - Troubleshooting guide

6. **IAM_VALIDATION_CHECKLIST.md** (420 lines)
   - Step-by-step validation process
   - Pre/post deployment checks
   - Security audit steps
   - Rollback procedures

## Service Accounts

### Cloud Build Service Account (Deployer)
**Email:** `cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com`

**Purpose:** Build images and deploy to Cloud Run

**Required Roles:**
- `roles/run.admin` - Deploy Cloud Run services
- `roles/artifactregistry.writer` - Push Docker images
- `roles/cloudbuild.builds.editor` - Manage builds
- `roles/iam.serviceAccountUser` (on runtime SA) - Impersonate runtime SA

### Cloud Run Runtime Service Account
**Email:** `pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com`

**Purpose:** Cloud Run service runtime identity

**Required Roles:**
- `roles/logging.logWriter` - Write application logs
- `roles/secretmanager.secretAccessor` (on secret) - Access API keys

### Default Compute Engine Service Account (Deprecated)
**Email:** `842946218691-compute@developer.gserviceaccount.com`

**Status:** Should NOT be used for this Cloud Run service

**Action:** De-privilege after verifying no other services depend on it

## Implementation Steps

### For Developers (Code Changes) ✅ COMPLETE
1. ✅ Update `cloudbuild.yaml` with `--service-account` flag
2. ✅ Update `scripts/deploy-cloud-run.sh` with `--service-account` flag
3. ✅ Create IAM setup automation script
4. ✅ Document IAM configuration requirements
5. ✅ Create validation checklist
6. ✅ Commit and push changes to PR

### For GCP Administrator (IAM Configuration) ⏳ REQUIRED

#### Step 1: Review the IAM Setup Script
```bash
cd /path/to/vehicle-in-need
./scripts/setup-iam-permissions.sh
```
Review all commands that will be executed.

#### Step 2: Apply IAM Configuration
```bash
./scripts/setup-iam-permissions.sh --execute
```
This grants all required permissions.

#### Step 3: Verify Configuration
```bash
# Verify Cloud Build SA permissions
gcloud projects get-iam-policy gen-lang-client-0615287333 \
  --flatten="bindings[].members" \
  --filter="bindings.members:cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com" \
  --format="table(bindings.role)"

# Should show: run.admin, artifactregistry.writer, cloudbuild.builds.editor

# Verify impersonation permission
gcloud iam service-accounts get-iam-policy \
  pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com \
  --project=gen-lang-client-0615287333

# Should show: cloud-build-deployer SA with iam.serviceAccountUser role
```

#### Step 4: Update Cloud Build Trigger (If Needed)
1. Go to: Cloud Console → Cloud Build → Triggers
2. Find: `vehicle-in-need-deploy` trigger
3. Verify:
   - Service Account: `cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com`
   - Config File: `cloudbuild.yaml`
   - No inline YAML overrides

#### Step 5: Test Deployment
1. Merge the PR
2. Trigger Cloud Build (automatic or manual)
3. Monitor build progress
4. Verify step 5 (deploy-cloud-run) completes successfully
5. Confirm no `iam.serviceaccounts.actAs` errors

#### Step 6: Validate Cloud Run Service
```bash
# Check service uses correct SA
gcloud run services describe pre-order-dealer-exchange-tracker \
  --region=us-west1 \
  --project=gen-lang-client-0615287333 \
  --format="value(spec.template.spec.serviceAccountName)"

# Should output: pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com

# Test service health
curl $(gcloud run services describe pre-order-dealer-exchange-tracker \
  --region=us-west1 --project=gen-lang-client-0615287333 \
  --format='value(status.url)')/health
```

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ GitHub Repository: PriorityLexusVB/vehicle-in-need          │
│ Branch: main (or feature branch)                            │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ Push/Merge
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ Cloud Build Trigger: vehicle-in-need-deploy                 │
│ Service Account: cloud-build-deployer@...                   │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ Executes cloudbuild.yaml
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ Cloud Build Steps:                                           │
│ 1. check-conflicts ✓                                         │
│ 2. build-image ✓                                             │
│ 3. push-image ✓                                              │
│ 4. push-latest ✓                                             │
│ 5. deploy-cloud-run ✓ (with --service-account flag)         │
│                                                              │
│ Key: Step 5 now includes:                                    │
│   --service-account=pre-order-dealer-exchange-860@...       │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ Deploys to
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ Cloud Run Service: pre-order-dealer-exchange-tracker        │
│ Runtime SA: pre-order-dealer-exchange-860@...               │
│                                                              │
│ Permissions:                                                 │
│ - logging.logWriter → Cloud Logging                          │
│ - secretmanager.secretAccessor → vehicle-in-need-gemini     │
└─────────────────────────────────────────────────────────────┘
```

## Before vs After Comparison

### Before (Failing)
```yaml
# cloudbuild.yaml - Step 5
args:
  - run
  - deploy
  - ${_SERVICE}
  - --image=...
  - --region=${_REGION}
  - --platform=managed
  - --allow-unauthenticated
  # ❌ No --service-account flag
  # Cloud Run defaults to: 842946218691-compute@developer.gserviceaccount.com
  # Cloud Build SA has no permission to act as this account
  # Result: PERMISSION_DENIED error
```

### After (Fixed)
```yaml
# cloudbuild.yaml - Step 5
args:
  - run
  - deploy
  - ${_SERVICE}
  - --image=...
  - --region=${_REGION}
  - --platform=managed
  - --allow-unauthenticated
  - --service-account=pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com
  # ✅ Explicit service account specified
  # Cloud Build SA has iam.serviceAccountUser permission on this account
  # Result: Successful deployment
```

## Security Benefits

1. **Least Privilege Access**
   - Each service account has only minimum required permissions
   - No Editor or Owner roles granted
   - Specific role assignments for specific purposes

2. **Separation of Concerns**
   - Build/deploy operations: Cloud Build SA
   - Runtime operations: Runtime SA
   - Clear boundaries between deployment and runtime

3. **Audit Trail**
   - All Cloud Build actions logged with deployer SA identity
   - All runtime actions logged with runtime SA identity
   - Easy to trace actions to specific service accounts

4. **Defense in Depth**
   - Multiple layers of access control
   - Explicit permission grants (no implicit defaults)
   - Principle of least privilege enforced

## Testing Checklist

Follow `IAM_VALIDATION_CHECKLIST.md` for comprehensive testing. Key items:

- [ ] IAM permissions applied via setup script
- [ ] Cloud Build trigger configured correctly
- [ ] Test deployment triggered and monitored
- [ ] Deployment completes without permission errors
- [ ] Cloud Run service uses correct runtime SA
- [ ] Service health check passes
- [ ] Application functionality verified
- [ ] Security audit confirms least privilege
- [ ] Documentation reviewed and accurate

## Rollback Plan

If issues occur:

### Option 1: Revert Code
```bash
git revert <commit-sha>
git push
```

### Option 2: Restore Previous IAM
Use pre-change IAM snapshots to restore previous configuration.

### Option 3: Emergency Deploy
```bash
gcloud run deploy pre-order-dealer-exchange-tracker \
  --image=us-west1-docker.pkg.dev/.../latest \
  --region=us-west1 \
  --allow-unauthenticated
```

## Success Criteria

✅ This implementation is successful when:

1. Cloud Build deploys without `iam.serviceaccounts.actAs` errors
2. Cloud Run service runs with the dedicated runtime SA
3. All IAM permissions follow least-privilege model
4. Service health checks pass
5. Application functionality is verified
6. Documentation is complete and accurate

## Documentation

| Document | Purpose | Audience |
|----------|---------|----------|
| `IAM_CONFIGURATION_SUMMARY.md` | Comprehensive IAM guide | GCP Admins, DevOps |
| `IAM_VALIDATION_CHECKLIST.md` | Testing procedures | QA, DevOps |
| `CLOUD_RUN_DEPLOYMENT_RUNBOOK.md` | Deployment guide | Developers, DevOps |
| `scripts/setup-iam-permissions.sh` | Automated setup | GCP Admins |
| This file (`IMPLEMENTATION_SUMMARY.md`) | High-level overview | All stakeholders |

## Contact & Support

For questions or issues:
1. Review `IAM_CONFIGURATION_SUMMARY.md` for detailed documentation
2. Check `IAM_VALIDATION_CHECKLIST.md` for testing guidance
3. Contact the DevOps team or repository maintainers
4. Refer to GCP documentation for Cloud Build and Cloud Run

## References

- [Cloud Run IAM Best Practices](https://cloud.google.com/run/docs/securing/service-identity)
- [Cloud Build Service Accounts](https://cloud.google.com/build/docs/securing-builds/configure-access-to-resources)
- [Principle of Least Privilege](https://cloud.google.com/iam/docs/using-iam-securely#least_privilege)
- [Service Account Impersonation](https://cloud.google.com/iam/docs/impersonating-service-accounts)

---

**Implementation Date:** 2025-11-16  
**Status:** Code changes complete, IAM configuration required  
**Next Action:** GCP Administrator to run `scripts/setup-iam-permissions.sh --execute`
