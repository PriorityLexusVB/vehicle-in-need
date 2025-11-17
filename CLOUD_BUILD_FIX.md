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

This is a **console-only fix** - no repository changes are needed.

### Option 1: Remove the Substitution (Recommended)

The `SERVICE_URL` substitution appears to be unused. In `cloudbuild.yaml` line 98, the SERVICE_URL is retrieved dynamically during the build:

```yaml
SERVICE_URL=$(gcloud run services describe ${_SERVICE} \
  --region=${_REGION} \
  --format='value(status.url)')
```

**Action**: Remove the `SERVICE_URL` substitution from the trigger configuration in Cloud Console.

### Option 2: Rename the Substitution

If the substitution is needed for some other purpose:

**Action**: Rename `SERVICE_URL` to `_SERVICE_URL` in the trigger configuration.

If you rename it, also update any references in `cloudbuild.yaml` to use `${_SERVICE_URL}` instead.

## Steps to Fix (Console)

1. Navigate to: [Google Cloud Console → Cloud Build → Triggers](https://console.cloud.google.com/cloud-build/triggers)
2. Select project: `Vehicle-In-Need` (or your project name)
3. Find trigger: `vehicle-in-need-deploy`
4. Click **EDIT**
5. Scroll to **Substitution variables** section
6. Find the `SERVICE_URL` entry
7. Either:
   - Click the delete/remove icon to remove it (recommended), OR
   - Change the key from `SERVICE_URL` to `_SERVICE_URL`
8. Click **SAVE**

## Verification

After making the change, trigger a build manually to verify it starts successfully:

```bash
gcloud builds submit --config cloudbuild.yaml \
  --substitutions _REGION=us-west1,_SERVICE=pre-order-dealer-exchange-tracker,SHORT_SHA=test-$(date +%Y%m%d-%H%M)
```

The build should proceed past the initial validation and begin executing steps.

## Related Files

- `cloudbuild.yaml` - The Cloud Build configuration file
- This document - `CLOUD_BUILD_FIX.md`

## References

- [Cloud Build Substitutions Documentation](https://cloud.google.com/build/docs/configuring-builds/substitute-variable-values)
- [Built-in Substitutions List](https://cloud.google.com/build/docs/configuring-builds/substitute-variable-values#using_default_substitutions)
