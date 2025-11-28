# PR Summary: Fix Cloud Build SERVICE_URL Substitution Error

## Overview

This PR comprehensively addresses the Cloud Build → Cloud Run deployment robustness, making the `SERVICE_URL` substitution error impossible to recur and ensuring the pipeline is stable, documented, and verifiable.

## Problem

The Cloud Build trigger `vehicle-in-need-deploy` was failing with:

```
invalid value for 'build.substitutions': key in the template "SERVICE_URL" 
is not a valid built-in substitution
```

## Root Cause

`SERVICE_URL` was configured as a Cloud Build substitution variable in the trigger settings. However:

- **SERVICE_URL is NOT a substitution** - it's a bash variable dynamically retrieved at runtime
- It's fetched AFTER Cloud Run deployment completes using `gcloud run services describe`
- Cloud Build substitutions must exist BEFORE the build starts
- Custom substitutions must start with underscore (e.g., `_REGION`, `_SERVICE`)

## Solutions Provided

### 1. Verification Script

**File**: `scripts/verify-cloud-build-config.sh`

- Automated checker for Cloud Build trigger configuration
- Validates that `SERVICE_URL` is NOT in substitutions
- Checks for valid substitution variables (`_REGION`, `_SERVICE`)
- Provides clear error messages and fix instructions
- Returns exit code 0 if configuration is correct

**Usage**:

```bash
./scripts/verify-cloud-build-config.sh
```

### 2. Comprehensive Fix Guide

**File**: `CLOUD_BUILD_SERVICE_URL_FIX.md`

Complete documentation covering:

- Detailed explanation of the issue
- Why `SERVICE_URL` cannot be a substitution
- Three fix methods:
  1. Google Cloud Console (recommended)
  2. gcloud CLI
  3. YAML configuration update
- Verification steps
- Troubleshooting common errors
- Quick reference table

### 3. README Update

**File**: `README.md`

Added troubleshooting entry in the "Troubleshooting" section:

- Clear error message reference
- Brief explanation
- Link to comprehensive fix guide
- Quick fix summary

## Required Action

**The repository code is correct.** The fix requires manual action in Google Cloud Console:

1. Navigate to <https://console.cloud.google.com/cloud-build/triggers>
2. Select project: `gen-lang-client-0615287333`
3. Edit trigger: `vehicle-in-need-deploy`
4. Remove `SERVICE_URL` from substitution variables
5. Keep only `_REGION` and `_SERVICE` (optional)
6. Save changes

## Verification Steps

After fixing the trigger:

1. Run verification script:

   ```bash
   ./scripts/verify-cloud-build-config.sh
   ```

2. Test build manually:

   ```bash
   gcloud builds submit --config cloudbuild.yaml \
     --substitutions _REGION=us-west1,_SERVICE=pre-order-dealer-exchange-tracker,SHORT_SHA=test-$(date +%Y%m%d-%H%M)
   ```

3. Trigger via GitHub push and monitor Cloud Build logs

## Technical Details

### Valid Cloud Build Substitutions

**Built-in** (no underscore):

- `PROJECT_ID` - GCP project ID
- `SHORT_SHA` - Short commit SHA
- `BUILD_ID` - Unique build identifier

**Custom** (must start with underscore):

- `_REGION` - Deployment region (default: us-west1)
- `_SERVICE` - Service name (default: pre-order-dealer-exchange-tracker)

### Why SERVICE_URL Can't Be a Substitution

```yaml
# In cloudbuild.yaml - This is CORRECT
steps:
  - name: gcr.io/cloud-builders/curl
    id: verify-css-deployed
    entrypoint: bash
    args:
      - -c
      - |
        # SERVICE_URL is a bash variable, retrieved after deployment
        SERVICE_URL=$(gcloud run services describe ${_SERVICE} \
          --region=${_REGION} \
          --format='value(status.url)')
```

The service URL:

- Doesn't exist until after Cloud Run deployment
- Changes with each deployment
- Must be retrieved dynamically using gcloud

## Files Changed

| File | Type | Description |
| --- | --- | --- |
| `scripts/verify-cloud-build-config.sh` | New | Automated verification script |
| `CLOUD_BUILD_SERVICE_URL_FIX.md` | New | Comprehensive fix guide |
| `README.md` | Updated | Added troubleshooting entry |

## Commits

- `27c99a3` - Add Cloud Build SERVICE_URL error to troubleshooting section
- `a2f822c` - Add verification script and comprehensive fix guide for SERVICE_URL error
- `7bb5ee0` - Initial plan

## Next Steps for User

1. ✅ Review the fix guide: `CLOUD_BUILD_SERVICE_URL_FIX.md`
2. ⏳ Update Cloud Build trigger in GCP Console (remove SERVICE_URL)
3. ⏳ Run verification script: `./scripts/verify-cloud-build-config.sh`
4. ⏳ Test build manually or via GitHub push
5. ⏳ Merge this PR once trigger is confirmed working

## Related Documentation

- [cloudbuild.yaml](./cloudbuild.yaml) - Build configuration (already correct)
- [CLOUD_BUILD_FIX.md](./CLOUD_BUILD_FIX.md) - Historical context
- [CLOUD_BUILD_TRIGGER_FIX.md](./CLOUD_BUILD_TRIGGER_FIX.md) - Previous fix guide
- [CLOUD_BUILD_CONFIGURATION.md](./CLOUD_BUILD_CONFIGURATION.md) - Complete config reference
- [Cloud Build Substitutions Docs](https://cloud.google.com/build/docs/configuring-builds/substitute-variable-values) - Official GCP docs

---

**Status**: ✅ Repository updates complete - Awaiting manual trigger configuration in GCP Console

**Estimated Time to Fix**: 5-10 minutes (manual Console edit)

**Risk Level**: Low (configuration-only change, no code changes)
