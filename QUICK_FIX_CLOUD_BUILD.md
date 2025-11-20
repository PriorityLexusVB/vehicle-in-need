# Cloud Build Error Fix - Quick Start

**Error Reference**: Build ba239e76-a1ad-4e30-bf0e-1ca4eb1fa401
**Status**: ✅ Fix Guide Ready - Requires GCP Console Access

---

## What Was Done

This PR provides comprehensive tools and documentation to fix Cloud Build errors in the `vehicle-in-need` project once and for all.

### Files Created

1. **CLOUD_BUILD_ERROR_FIX.md** - Complete step-by-step fix guide
2. **scripts/diagnose-cloud-build-error.sh** - Automated diagnosis tool
3. **README.md** - Added troubleshooting section for IAM errors

## Files Enhanced

1. **package.json** - Added npm scripts:
   - `npm run cloudbuild:diagnose` - Diagnose Cloud Build errors
   - `npm run cloudbuild:setup-iam` - Automated IAM permission setup

---

## Root Cause

The Cloud Build error is caused by **missing IAM permissions** for service accounts. Specifically:

1. ❌ **Missing actAs permission** - Cloud Build SA cannot impersonate Runtime SA
2. ❌ **Missing Cloud Run Admin** - Cannot deploy Cloud Run services
3. ❌ **Missing Artifact Registry Writer** - Cannot push Docker images

---

## How to Fix (Choose One)

### Option 1: Automated Fix (Fastest) ⭐

```bash
# Diagnose the issue first
npm run cloudbuild:diagnose

# Apply the fix
npm run cloudbuild:setup-iam -- --execute
```

### Option 2: Manual Fix (GCP Console)

See **CLOUD_BUILD_ERROR_FIX.md** → Section "Option B: Manual Fix"

### Option 3: Command-Line Fix (gcloud CLI)

See **CLOUD_BUILD_ERROR_FIX.md** → Section "Option C: Command-Line Fix"

---

## Quick Command Reference

```bash
# Diagnose the current state (recommended first step)
npm run cloudbuild:diagnose

# Diagnose a specific build
npm run cloudbuild:diagnose ba239e76-a1ad-4e30-bf0e-1ca4eb1fa401

# Preview IAM changes (dry-run)
npm run cloudbuild:setup-iam

# Apply IAM changes
npm run cloudbuild:setup-iam -- --execute

# Verify Cloud Build configuration
npm run lint:cloudbuild

# List all Cloud Build triggers
npm run cloudbuild:list-triggers

# Verify a specific trigger configuration
npm run cloudbuild:verify-trigger
```

---

## Prerequisites

To apply the fix, you need:

- ✅ Access to GCP Console for project `gen-lang-client-0615287333`
- ✅ **Owner** or **Security Admin** IAM role
- ✅ `gcloud` CLI installed and authenticated

---

## Critical Permission Fix

The most common error is the **actAs permission**. Fix it with:

```bash
gcloud iam service-accounts add-iam-policy-binding \
  pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com \
  --member="serviceAccount:cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser" \
  --project="gen-lang-client-0615287333"
```

---

## Verification

After applying the fix:

1. **Wait 1-2 minutes** for IAM changes to propagate
2. **Verify permissions**:

   ```bash
   npm run cloudbuild:diagnose
   ```

3. **Test deployment**:

   ```bash
   git commit --allow-empty -m "test: verify Cloud Build fix"
   git push origin main
   ```

4. **Monitor build**: <https://console.cloud.google.com/cloud-build/builds?project=gen-lang-client-0615287333>

Expected result: All build steps should succeed, including Cloud Run deployment.

---

## Documentation Index

| Document | Purpose |
|----------|---------|
| [CLOUD_BUILD_ERROR_FIX.md](./CLOUD_BUILD_ERROR_FIX.md) | **START HERE** - Complete fix guide with multiple approaches |
| [scripts/diagnose-cloud-build-error.sh](./scripts/diagnose-cloud-build-error.sh) | Automated diagnosis tool |
| [scripts/setup-iam-permissions.sh](./scripts/setup-iam-permissions.sh) | Automated IAM permission setup |
| [docs/archive/QUICK_IAM_FIX.md](./docs/archive/QUICK_IAM_FIX.md) | Quick IAM fix commands |
| [docs/operations/CLOUD_BUILD_TRIGGER_RUNBOOK.md](./docs/operations/CLOUD_BUILD_TRIGGER_RUNBOOK.md) | Trigger configuration guide |

---

## Next Steps

1. **Read**: [CLOUD_BUILD_ERROR_FIX.md](./CLOUD_BUILD_ERROR_FIX.md)
2. **Diagnose**: Run `npm run cloudbuild:diagnose`
3. **Fix**: Choose one of the fix options (automated, manual, or CLI)
4. **Verify**: Run `npm run cloudbuild:diagnose` again
5. **Test**: Push to main and monitor the build

---

## Support

If you need additional access or encounter issues:

- Check the diagnosis output for specific missing permissions
- Review the comprehensive guide: [CLOUD_BUILD_ERROR_FIX.md](./CLOUD_BUILD_ERROR_FIX.md)
- Ensure you have Owner or Security Admin role on the GCP project

---

**Created**: November 2024
**Last Updated**: November 2024
