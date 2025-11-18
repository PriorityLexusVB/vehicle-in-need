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

### Repository Changes (COMPLETED)

The repository has been updated to use the proper custom substitution `_SERVICE_URL`:

1. **cloudbuild.yaml** now includes `_SERVICE_URL` in the substitutions block with a default value:
   ```yaml
   substitutions:
     _REGION: us-west1
     _SERVICE: pre-order-dealer-exchange-tracker
     _SERVICE_URL: https://pre-order-dealer-exchange-tracker-842946218691.us-west1.run.app
   ```

2. The documentation in `cloudbuild.yaml` has been updated to show the correct usage of `_SERVICE_URL`.

### Cloud Build Trigger Configuration (ACTION REQUIRED)

The Cloud Build trigger in Google Cloud Console must be updated to use `_SERVICE_URL` instead of `SERVICE_URL`.

#### Steps to Fix (Console)

1. Navigate to: [Google Cloud Console → Cloud Build → Triggers](https://console.cloud.google.com/cloud-build/triggers)
2. Select project: `Vehicle-In-Need` (or your project name)
3. Find trigger: `vehicle-in-need-deploy`
4. Click **EDIT**
5. Scroll to **Substitution variables** section
6. Find the `SERVICE_URL` entry
7. Change the key from `SERVICE_URL` to `_SERVICE_URL`
8. Set the value to: `https://pre-order-dealer-exchange-tracker-842946218691.us-west1.run.app`
9. Click **SAVE**

**Note:** If the `SERVICE_URL` substitution is not actually used in your trigger configuration, you can remove it instead. The Cloud Build configuration now dynamically retrieves the service URL after deployment, so a static substitution may not be necessary unless you have specific needs.

## Verification

After making the change, trigger a build manually to verify it starts successfully:

```bash
gcloud builds submit --config cloudbuild.yaml \
  --substitutions _REGION=us-west1,_SERVICE=pre-order-dealer-exchange-tracker,SHORT_SHA=test-$(date +%Y%m%d-%H%M),_SERVICE_URL=https://pre-order-dealer-exchange-tracker-842946218691.us-west1.run.app
```

The build should proceed past the initial validation and begin executing steps.

## Related Files

- `cloudbuild.yaml` - The Cloud Build configuration file (UPDATED)
- This document - `CLOUD_BUILD_FIX.md` (UPDATED)

## References

- [Cloud Build Substitutions Documentation](https://cloud.google.com/build/docs/configuring-builds/substitute-variable-values)
- [Built-in Substitutions List](https://cloud.google.com/build/docs/configuring-builds/substitute-variable-values#using_default_substitutions)
