# Cloud Build Configuration Reference

## Overview

This document provides the authoritative reference for configuring the `vehicle-in-need-deploy` Cloud Build trigger for the vehicle-in-need project.

## Substitution Variables

### Valid Substitution Variables

The trigger should be configured with only these substitution variables:

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `_REGION` | Custom | `us-west1` | No | GCP region for Cloud Run deployment |
| `_SERVICE` | Custom | `pre-order-dealer-exchange-tracker` | No | Cloud Run service name |
| `SHORT_SHA` | Built-in | (auto) | No | Automatically provided by Cloud Build triggers |
| `PROJECT_ID` | Built-in | (auto) | No | Automatically provided by Cloud Build |
| `BUILD_ID` | Built-in | (auto) | No | Automatically provided by Cloud Build |

### Custom vs Built-in Substitutions

**Custom substitutions** (user-defined):
- MUST start with underscore (`_`)
- Examples: `_REGION`, `_SERVICE`
- Can have default values in `cloudbuild.yaml`

**Built-in substitutions** (Cloud Build provided):
- Do NOT start with underscore
- Examples: `PROJECT_ID`, `SHORT_SHA`, `BUILD_ID`
- Automatically available in all builds

### What NOT to Add

**DO NOT add** `SERVICE_URL` or `_SERVICE_URL` as substitutions:
- These are NOT Cloud Build substitution variables
- `SERVICE_URL` is a bash variable dynamically computed at runtime
- It's retrieved after deployment using: `gcloud run services describe`

## Trigger Configuration

### Console Configuration Steps

1. Navigate to [Cloud Build Triggers](https://console.cloud.google.com/cloud-build/triggers)
2. Select project: `gen-lang-client-0615287333`
3. Find trigger: `vehicle-in-need-deploy`
4. Click **EDIT**
5. Configure **Substitution variables**:
   - `_REGION`: `us-west1` (optional)
   - `_SERVICE`: `pre-order-dealer-exchange-tracker` (optional)
6. Click **SAVE**

### gcloud Configuration

```bash
gcloud builds triggers update vehicle-in-need-deploy \
  --substitutions _REGION=us-west1,_SERVICE=pre-order-dealer-exchange-tracker
```

## Manual Build Testing

To test the configuration manually:

```bash
gcloud builds submit --config cloudbuild.yaml \
  --substitutions _REGION=us-west1,_SERVICE=pre-order-dealer-exchange-tracker,SHORT_SHA=test-$(date +%Y%m%d-%H%M)
```

## Build Steps Overview

The `cloudbuild.yaml` defines these steps:

1. **check-conflicts**: Verify no merge conflict markers in code
2. **build-image**: Build Docker image with commit SHA and build ID
3. **push-image**: Push tagged image to Artifact Registry
4. **push-latest**: Push `:latest` tag to Artifact Registry
5. **deploy-cloud-run**: Deploy to Cloud Run with environment variables
6. **verify-css-deployed**: Verify CSS files are accessible (includes dynamic `SERVICE_URL` retrieval)

## Service Account Requirements

### Cloud Build Service Account

`cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com` needs:
- `roles/run.admin` - Deploy Cloud Run services
- `roles/iam.serviceAccountUser` - Impersonate runtime service account
- `roles/artifactregistry.writer` - Push container images

### Cloud Run Runtime Service Account

`pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com` needs:
- `roles/logging.logWriter` - Write application logs
- `roles/secretmanager.secretAccessor` - Access Gemini API key secret

## Troubleshooting

### Common Errors

**Error: "invalid value for 'build.substitutions': key in the template 'SERVICE_URL'"**
- **Cause**: `SERVICE_URL` was added as a substitution variable
- **Fix**: Remove `SERVICE_URL` or `_SERVICE_URL` from trigger configuration
- **Details**: See [CLOUD_BUILD_FIX.md](./CLOUD_BUILD_FIX.md)

**Error: Build fails to find service**
- **Cause**: Incorrect `_SERVICE` or `_REGION` values
- **Fix**: Verify service name and region match actual Cloud Run configuration

## Related Documentation

- [cloudbuild.yaml](./cloudbuild.yaml) - Build configuration file
- [CLOUD_BUILD_FIX.md](./CLOUD_BUILD_FIX.md) - Historical trigger fix documentation
- [CLOUD_BUILD_TRIGGER_FIX.md](./CLOUD_BUILD_TRIGGER_FIX.md) - Detailed troubleshooting guide
- [CONTAINER_DEPLOYMENT_GUIDE.md](./CONTAINER_DEPLOYMENT_GUIDE.md) - General deployment guide
- [Cloud Build Substitutions](https://cloud.google.com/build/docs/configuring-builds/substitute-variable-values) - Official GCP docs

## Verification Checklist

After configuring the trigger, verify:

- [ ] Only `_REGION` and `_SERVICE` are in substitution variables (if any)
- [ ] No `SERVICE_URL` or `_SERVICE_URL` in substitutions
- [ ] Trigger connects to correct repository and branch
- [ ] Service account has necessary permissions
- [ ] Manual test build completes successfully
- [ ] CSS verification step passes (confirms service is accessible)
