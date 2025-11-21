# Cloud Build Trigger Fix

## Issue

The Cloud Build trigger `vehicle-in-need-deploy` was failing with the following error:

```
invalid value for 'build.substitutions': key in the template "SERVICE_URL" 
is not a valid built-in substitution
```

## Root Cause

The error occurred because `SERVICE_URL` was incorrectly configured as a Cloud Build substitution variable in the trigger configuration. However:

1. **Cloud Build substitutions** must either:
   - Be built-in variables (e.g., `PROJECT_ID`, `SHORT_SHA`, `BUILD_ID`), OR
   - Start with an underscore (`_`) for custom variables (e.g., `_REGION`, `_SERVICE`)

2. **`SERVICE_URL` is NOT a substitution** - it's a bash variable dynamically generated at runtime within the `verify-css-deployed` step:

   ```bash
   SERVICE_URL=$(gcloud run services describe ${_SERVICE} \
     --region=${_REGION} \
     --format='value(status.url)')
   ```

## Solution

### Repository Changes (COMPLETED)

The repository configuration has been updated:

1. **cloudbuild.yaml** uses only valid substitutions:

   ```yaml
   substitutions:
     _REGION: us-west1
     _SERVICE: pre-order-dealer-exchange-tracker
   ```

2. The `SERVICE_URL` is correctly used as a bash variable (no underscore, not a substitution) that is dynamically retrieved after deployment.

3. Documentation has been updated with clear inline comments explaining substitution requirements.

### Cloud Build Trigger Configuration (ACTION REQUIRED)

The Cloud Build trigger in Google Cloud Console must be configured with only these substitution variables:

#### Valid Substitutions for Trigger

Configure these in the trigger's "Substitution variables" section:

| Variable | Value | Required | Notes |
|----------|-------|----------|-------|
| `_REGION` | `us-west1` | Optional | Defaults to `us-west1` if not set |
| `_SERVICE` | `pre-order-dealer-exchange-tracker` | Optional | Defaults to service name if not set |

**DO NOT add** `SERVICE_URL` or `_SERVICE_URL` - these are not substitution variables.

#### Steps to Fix (Console)

1. Navigate to: [Google Cloud Console → Cloud Build → Triggers](https://console.cloud.google.com/cloud-build/triggers)
2. Select project: `gen-lang-client-0615287333` (or your project)
3. Find trigger: `vehicle-in-need-deploy`
4. Click **EDIT**
5. Scroll to **Substitution variables** section
6. **Remove** any entry with key `SERVICE_URL` or `_SERVICE_URL` if present
7. Ensure only `_REGION` and `_SERVICE` are defined (or leave empty to use defaults)
8. Click **SAVE**

## Verification

After making the change, trigger a build manually to verify:

```bash
gcloud builds submit --config cloudbuild.yaml \
  --substitutions _REGION=us-west1,_SERVICE=pre-order-dealer-exchange-tracker,SHORT_SHA=test-$(date +%Y%m%d-%H%M)
```

The build should proceed successfully without substitution errors.

## Technical Details

- **Custom substitution variables** must start with underscore (`_`)
- **Built-in variables** (like `SHORT_SHA`, `PROJECT_ID`, `BUILD_ID`) don't need underscores
- **Bash variables** used within build steps are NOT substitutions and should never be configured in the trigger
- The `SERVICE_URL` is determined dynamically after the Cloud Run deployment completes

## Related Files

- `cloudbuild.yaml` - Cloud Build configuration (UPDATED)
- `CLOUD_BUILD_TRIGGER_FIX.md` - Detailed trigger configuration guide
- `CONTAINER_DEPLOYMENT_GUIDE.md` - General deployment documentation

## References

- [Cloud Build Substitutions Documentation](https://cloud.google.com/build/docs/configuring-builds/substitute-variable-values)
- [Built-in Substitutions List](https://cloud.google.com/build/docs/configuring-builds/substitute-variable-values#using_default_substitutions)
