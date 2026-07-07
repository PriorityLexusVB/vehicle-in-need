# GCP Authentication Fix for GitHub Actions

## Problem Summary

The GitHub Actions workflow (`build-and-deploy.yml`) was failing with the following error:

```
google-github-actions/auth failed with: failed to generate Google Cloud federated token for //iam.googleapis.com/***: 
{"error":"invalid_target","error_description":"The target service indicated by the \"audience\" parameters is invalid. 
This might either be because the pool or provider is disabled or deleted or because it doesn't exist."}
```

**Root Cause:** The Workload Identity Pool or Provider configured in the `GCP_WORKLOAD_IDENTITY_PROVIDER` secret either:

- Doesn't exist in GCP
- Has been deleted
- Is disabled
- Was never created

## Solution Implemented

Modified the workflow to support **automatic fallback authentication** with two methods:

### 1. Workload Identity Federation (Primary - Recommended)

- Keyless authentication using OIDC tokens
- More secure (no long-lived credentials)
- Requires: `GCP_WORKLOAD_IDENTITY_PROVIDER` and `GCP_SERVICE_ACCOUNT` secrets

### 2. Service Account Key (Fallback)

- Traditional JSON key-based authentication
- Automatically used if WIF fails or is not configured
- Requires: `GCP_SA_KEY` secret

## Changes Made

### Workflow Changes (`.github/workflows/build-and-deploy.yml`)

1. **Enhanced validation step** - Now checks for both authentication methods
2. **Separate auth steps** - WIF and SA key have separate, conditional steps
3. **Automatic fallback** - If WIF fails, automatically tries SA key
4. **Better error messages** - Clear guidance on what failed and how to fix it
5. **Applied to both jobs** - Both `build` and `deploy` jobs updated

### Documentation Updates (`docs/CI.md`)

1. Updated to describe both authentication methods
2. Added `GCP_SA_KEY` configuration instructions
3. Enhanced troubleshooting section
4. Added authentication flow diagram

## How to Use

### Option A: Fix Workload Identity Federation (Recommended)

If you want to use the more secure WIF method, follow these steps:

1. **Verify the pool and provider exist:**

   ```bash
   gcloud iam workload-identity-pools describe github-pool \
     --location=global \
     --project=YOUR_PROJECT_ID

   gcloud iam workload-identity-pools providers describe github-provider \
     --location=global \
     --workload-identity-pool=github-pool \
     --project=YOUR_PROJECT_ID
   ```

2. **If they don't exist, create them:**

   Follow the complete setup instructions in `docs/CI.md` section:
   "Step-by-Step: Configure Workload Identity Federation in GCP"

### Option B: Use Service Account Key (Quick Fix)

If you need a quick fix or cannot set up WIF, use a service account key:

1. **Create a service account key:**

   ```bash
   gcloud iam service-accounts keys create sa-key.json \
     --iam-account=SERVICE_ACCOUNT_NAME@YOUR_PROJECT_ID.iam.gserviceaccount.com
   ```

2. **Add to GitHub Secrets:**
   - Go to repository Settings → Secrets and variables → Actions
   - Create a new secret named `GCP_SA_KEY`
   - Paste the entire contents of `sa-key.json` (including `{` and `}`)

3. **Delete the local key file:**

   ```bash
   rm sa-key.json
   ```

4. **Next workflow run will automatically use the SA key**

### Option C: Use Both (Recommended)

For maximum reliability, configure both methods:

- WIF will be tried first (more secure)
- SA key will be used as fallback if WIF fails

## Verification

After applying the fix, the workflow will:

1. ✅ Check which authentication methods are available
2. ✅ Try Workload Identity Federation (if configured)
3. ✅ Fall back to Service Account Key (if WIF fails)
4. ✅ Provide clear error messages if all methods fail
5. ✅ Continue with build/deploy if any method succeeds

## Security Considerations

### Workload Identity Federation (Recommended)

- ✅ No long-lived credentials
- ✅ Automatic credential rotation
- ✅ Fine-grained access control
- ✅ No key management required

### Service Account Key (Fallback)

- ⚠️ Long-lived credentials (should be rotated every 90 days)
- ⚠️ Risk of key leakage
- ⚠️ Manual key management required
- ✅ Easier to set up initially

**Recommendation:** Use WIF for production, SA key only as temporary fallback.

## Testing

To test the fix without waiting for a push to main:

1. Go to Actions → Build and Push Container (Cloud Build)
2. Click "Run workflow"
3. Select branch: `copilot/fix-action-job-issues`
4. Leave "deploy" unchecked (unless you want to deploy)
5. Click "Run workflow"

The workflow will:

- ✅ Validate the build configuration
- ✅ Attempt authentication (WIF then SA key)
- ✅ Report which method succeeded
- ✅ Build the container (if auth succeeds)

## Related Files

- `.github/workflows/build-and-deploy.yml` - Workflow with fallback auth
- `docs/CI.md` - Complete authentication setup guide
- `GCP_AUTH_FIX.md` - This file (implementation summary)

## References

- [GitHub Actions Run with Error](https://github.com/PriorityLexusVB/vehicle-in-need/actions/runs/20220255135/job/58040816197#step:4:1)
- [google-github-actions/auth](https://github.com/google-github-actions/auth)
- [GCP Workload Identity Federation](https://cloud.google.com/iam/docs/workload-identity-federation)
