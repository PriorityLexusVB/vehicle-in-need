# Quick Start: Fix GitHub Actions Build Failure

This is a **TL;DR** guide to fix the failing GitHub Actions workflow. For complete details, see `GCP_AUTH_FIX.md`.

## Problem

GitHub Actions workflow failing with:
```
invalid_target: The target service indicated by the "audience" parameters is invalid.
```

**Why?** The Workload Identity Pool/Provider doesn't exist or is disabled in your GCP project.

## Quick Fix (5 minutes)

### Option 1: Use Service Account Key (Fastest)

1. **Create a service account key:**
   ```bash
   gcloud iam service-accounts keys create sa-key.json \
     --iam-account=YOUR_SERVICE_ACCOUNT@YOUR_PROJECT.iam.gserviceaccount.com
   ```

2. **Add to GitHub:**
   - Go to: Repository → Settings → Secrets and variables → Actions
   - Click "New repository secret"
   - Name: `GCP_SA_KEY`
   - Value: Paste the **entire contents** of `sa-key.json`
   - Click "Add secret"

3. **Clean up:**
   ```bash
   rm sa-key.json  # Delete local file immediately
   ```

4. **Test:**
   - Go to Actions → Build and Push Container → Run workflow
   - The workflow should now succeed ✅

**Done!** The workflow will automatically use the SA key when WIF fails.

---

### Option 2: Fix Workload Identity Federation (Recommended)

If you want to use the more secure WIF method:

1. **Check if pool exists:**
   ```bash
   gcloud iam workload-identity-pools list --location=global
   ```

2. **If not found, create it:**
   Follow the complete setup in `docs/CI.md` section:
   "Step-by-Step: Configure Workload Identity Federation in GCP"

3. **Update the GitHub secret:**
   - Get the provider resource name
   - Update `GCP_WORKLOAD_IDENTITY_PROVIDER` secret
   - Test the workflow

---

## What Changed

The workflow now:
- ✅ Tries Workload Identity Federation first
- ✅ Falls back to Service Account Key if WIF fails
- ✅ Provides clear error messages
- ✅ Continues building instead of failing

## Verification

After applying the fix, look for these messages in the workflow logs:

**Success with WIF:**
```
✅ Authenticated using Workload Identity Federation
```

**Success with SA Key (fallback):**
```
✅ Authenticated using Service Account Key
```

## Security Notes

- **SA keys should be rotated every 90 days**
- **WIF is more secure** (no long-lived credentials)
- **Use Option 1 for quick fix, then migrate to Option 2**

## Need Help?

1. **Full documentation:** See `GCP_AUTH_FIX.md`
2. **Testing guide:** See `TESTING_GCP_AUTH_FIX.md`
3. **Configuration details:** See `docs/CI.md`

## Files Modified

- `.github/workflows/build-and-deploy.yml` - Workflow with fallback logic
- `docs/CI.md` - Updated authentication guide
- `GCP_AUTH_FIX.md` - Complete fix documentation
- `TESTING_GCP_AUTH_FIX.md` - Testing scenarios
- `QUICK_START_GCP_FIX.md` - This file

## Summary

**One command fix:**
```bash
# Create key + add to GitHub secrets as GCP_SA_KEY
gcloud iam service-accounts keys create sa-key.json --iam-account=YOUR_SA@YOUR_PROJECT.iam.gserviceaccount.com
```

**That's it!** The workflow will automatically use it as fallback.
