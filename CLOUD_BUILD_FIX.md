# Cloud Build Trigger Fix

## Issue

The Cloud Build trigger `vehicle-in-need-deploy` is failing with the following error:

```
invalid value for 'build.substitutions': key in the template "SERVICE_URL" 
is not a valid built-in substitution
```

## Root Cause

The trigger defines a substitution variable named `SERVICE_URL`, but Google Cloud Build requires:

- User-defined substitutions to start with an underscore (`_`)
- Built-in substitutions to match documented names (e.g., `PROJECT_ID`, `SHORT_SHA`)

`SERVICE_URL` doesn't match either pattern, causing the build to fail before any steps run.

## Solution

The `cloudbuild.yaml` file now supports `_SERVICE_URL` as an optional custom substitution variable. You have two options:

### Option 1: Remove the Substitution (Simplest)

The service URL is automatically detected during the build process. Simply remove `SERVICE_URL` from the trigger configuration.

**Action**: Remove the `SERVICE_URL` substitution from the trigger configuration in Cloud Console.

### Option 2: Rename to Use Custom Substitution (If Override Needed)

If you need to override the service URL (e.g., for testing against a specific environment):

**Action**: Rename `SERVICE_URL` to `_SERVICE_URL` in the trigger configuration.

The build will use the provided `_SERVICE_URL` value, or auto-detect it if left empty.

## Steps to Fix (Console)

1. Navigate to: [Google Cloud Console → Cloud Build → Triggers](https://console.cloud.google.com/cloud-build/triggers)
2. Select project: `Vehicle-In-Need` (or your project name)
3. Find trigger: `vehicle-in-need-deploy`
4. Click **EDIT**
5. Scroll to **Substitution variables** section
6. Find the `SERVICE_URL` entry
7. Either:
   - Click the delete/remove icon to remove it (simplest), OR
   - Change the key from `SERVICE_URL` to `_SERVICE_URL` (if you need to override)
8. Click **SAVE**

## Verification

After making the change, trigger a build manually to verify it starts successfully:

```bash
gcloud builds submit --config cloudbuild.yaml \
  --substitutions _REGION=us-west1,_SERVICE=pre-order-dealer-exchange-tracker,SHORT_SHA=test-$(date +%Y%m%d-%H%M)
```

Or with custom service URL:

```bash
gcloud builds submit --config cloudbuild.yaml \
  --substitutions _REGION=us-west1,_SERVICE=pre-order-dealer-exchange-tracker,SHORT_SHA=test-$(date +%Y%m%d-%H%M),_SERVICE_URL=https://your-service.run.app
```

The build should proceed past the initial validation and begin executing steps.

## Related Files

- `cloudbuild.yaml` - The Cloud Build configuration file (now supports `_SERVICE_URL`)
- This document - `CLOUD_BUILD_FIX.md`

## References

- [Cloud Build Substitutions Documentation](https://cloud.google.com/build/docs/configuring-builds/substitute-variable-values)
- [Built-in Substitutions List](https://cloud.google.com/build/docs/configuring-builds/substitute-variable-values#using_default_substitutions)
