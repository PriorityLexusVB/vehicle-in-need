# Cloud Build Trigger Configuration Fix

## Issue

The Cloud Build trigger `vehicle-in-need-deploy` fails with an error about an invalid substitution key `SERVICE_URL`.

## Root Cause

`SERVICE_URL` is NOT a Cloud Build substitution variable. It is a bash variable used within the deployment verification script in `cloudbuild.yaml`.

The `cloudbuild.yaml` file correctly uses `SERVICE_URL` as a bash variable:

```bash
SERVICE_URL=$(gcloud run services describe ${_SERVICE} \
  --region=${_REGION} \
  --format='value(status.url)')
```

## Solution

If you're configuring a Cloud Build trigger, **do NOT** include `SERVICE_URL` in the substitution variables.

### Valid Substitution Variables

Only these substitution variables should be configured in the trigger:

1. **`_REGION`** (optional, defaults to `us-west1`)
   - Example: `us-west1`, `us-central1`, etc.

2. **`_SERVICE`** (optional, defaults to `pre-order-dealer-exchange-tracker`)
   - Example: `pre-order-dealer-exchange-tracker`

3. **`SHORT_SHA`** (automatically provided by Cloud Build for triggers)
   - This is a built-in variable, no configuration needed

### Example Trigger Configuration

**Correct:**

```yaml
substitutions:
  _REGION: us-west1
  _SERVICE: pre-order-dealer-exchange-tracker
```

**Incorrect:**

```yaml
substitutions:
  _REGION: us-west1
  _SERVICE: pre-order-dealer-exchange-tracker
  SERVICE_URL: https://...  # ❌ WRONG - Remove this
```

## How to Fix the Trigger

1. Go to Google Cloud Console
2. Navigate to Cloud Build > Triggers
3. Find the `vehicle-in-need-deploy` trigger
4. Click Edit
5. In the "Substitution variables" section, ensure only `_REGION` and `_SERVICE` are defined
6. **Remove** `SERVICE_URL` if it exists
7. Save the trigger

## Technical Details

- Cloud Build substitution variables must start with underscore (`_`) for custom variables
- Built-in variables (like `SHORT_SHA`, `PROJECT_ID`, `BUILD_ID`) don't need underscores
- `SERVICE_URL` is dynamically generated at runtime within the bash script and should never be a substitution variable

## Verification

After fixing the trigger, test it by:

```bash
gcloud builds submit --config cloudbuild.yaml \
  --substitutions _REGION=us-west1,_SERVICE=pre-order-dealer-exchange-tracker,SHORT_SHA=test-$(date +%Y%m%d)
```

The build should complete successfully without errors about `SERVICE_URL`.
