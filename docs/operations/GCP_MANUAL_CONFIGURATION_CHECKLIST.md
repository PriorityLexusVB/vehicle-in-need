# GCP Manual Configuration Checklist

## Overview

This checklist contains the manual GCP-side configuration steps required to complete the Cloud Build → Cloud Run deployment setup for the `vehicle-in-need` application.

**These steps must be performed by a GCP project administrator** with appropriate IAM permissions.

**Project ID**: `gen-lang-client-0615287333`  
**Primary Region**: `us-west1`  
**Cloud Run Service**: `pre-order-dealer-exchange-tracker`

---

## Prerequisites

- [ ] Access to GCP Console with appropriate permissions
- [ ] Roles required:
  - `roles/cloudbuild.builds.editor` - To edit Cloud Build triggers
  - `roles/iam.securityAdmin` or `roles/resourcemanager.projectIamAdmin` - To manage IAM roles
  - `roles/run.admin` - To verify Cloud Run configuration

---

## 1. Configure Cloud Build Trigger

### 1.1 Update Trigger Substitutions

**Trigger Name**: `vehicle-in-need-deploy`

#### Steps

1. [ ] Navigate to [Cloud Build Triggers](https://console.cloud.google.com/cloud-build/triggers)
2. [ ] Select project: `gen-lang-client-0615287333`
3. [ ] Find trigger: `vehicle-in-need-deploy`
4. [ ] Click **EDIT** (pencil icon)
5. [ ] Scroll to **"Substitution variables"** section
6. [ ] **Remove** any entries with keys:
   - [ ] `SERVICE_URL`
   - [ ] `_SERVICE_URL`
7. [ ] Verify these substitutions exist (add if missing):
   - [ ] `_REGION` = `us-west1`
   - [ ] `_SERVICE` = `pre-order-dealer-exchange-tracker`
8. [ ] Click **SAVE**
9. [ ] Wait for confirmation message

#### Alternative: Using gcloud CLI

```bash
# Export current trigger configuration
gcloud builds triggers describe vehicle-in-need-deploy \
  --project=gen-lang-client-0615287333 \
  --format=json > trigger-config.json

# Edit trigger-config.json:
# - Remove "SERVICE_URL" from substitutions
# - Remove "_SERVICE_URL" from substitutions
# - Ensure "_REGION": "us-west1" exists
# - Ensure "_SERVICE": "pre-order-dealer-exchange-tracker" exists

# Update the trigger
gcloud builds triggers update vehicle-in-need-deploy \
  --project=gen-lang-client-0615287333 \
  --trigger-config=trigger-config.json
```

### 1.2 Verify Trigger Configuration

```bash
# Run the verification script from the repository
cd /path/to/vehicle-in-need
./scripts/verify-cloud-build-config.sh
```

Expected output:

```
✅ No SERVICE_URL in substitutions block (correct)
✅ _REGION: us-west1
✅ _SERVICE: pre-order-dealer-exchange-tracker
🎉 Cloud Build trigger configuration is valid!
```

---

## 2. Verify Service Account Roles

### 2.1 Cloud Build Service Account

**Service Account**: `cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com`

This account is used by Cloud Build to deploy to Cloud Run.

#### Required Roles

1. [ ] `roles/run.admin` - Deploy Cloud Run services
2. [ ] `roles/iam.serviceAccountUser` - Use Cloud Run runtime service account
3. [ ] `roles/artifactregistry.writer` - Push images to Artifact Registry

#### Verify Roles

```bash
# List roles for Cloud Build service account
gcloud projects get-iam-policy gen-lang-client-0615287333 \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com" \
  --format="table(bindings.role)"
```

#### Add Missing Roles (if needed)

```bash
# Add Cloud Run Admin role
gcloud projects add-iam-policy-binding gen-lang-client-0615287333 \
  --member="serviceAccount:cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com" \
  --role="roles/run.admin"

# Add Service Account User role (on the runtime SA)
gcloud iam service-accounts add-iam-policy-binding \
  pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com \
  --member="serviceAccount:cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

# Add Artifact Registry Writer role
gcloud projects add-iam-policy-binding gen-lang-client-0615287333 \
  --member="serviceAccount:cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"
```

### 2.2 Cloud Run Runtime Service Account

**Service Account**: `pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com`

This account is used by the Cloud Run service at runtime.

#### Required Roles

1. [ ] `roles/logging.logWriter` - Write logs to Cloud Logging
2. [ ] `roles/secretmanager.secretAccessor` - Access `vehicle-in-need-gemini` secret

#### Verify Roles

```bash
# List roles for Cloud Run runtime service account
gcloud projects get-iam-policy gen-lang-client-0615287333 \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com" \
  --format="table(bindings.role)"
```

#### Add Missing Roles (if needed)

```bash
# Add Log Writer role
gcloud projects add-iam-policy-binding gen-lang-client-0615287333 \
  --member="serviceAccount:pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com" \
  --role="roles/logging.logWriter"

# Add Secret Accessor role
gcloud projects add-iam-policy-binding gen-lang-client-0615287333 \
  --member="serviceAccount:pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

---

## 3. Test Deployment

### 3.1 Manual Test Build

Run a test build to verify the configuration:

```bash
gcloud builds submit --config=cloudbuild.yaml \
  --project=gen-lang-client-0615287333 \
  --substitutions=_REGION=us-west1,_SERVICE=pre-order-dealer-exchange-tracker,SHORT_SHA=test-$(date +%Y%m%d-%H%M)
```

#### Expected Results

- [ ] Build starts successfully
- [ ] All build steps complete (check-conflicts, build-image, push-image, push-latest, deploy-cloud-run)
- [ ] `verify-css-deployed` step passes:
  - [ ] Fetches service URL dynamically
  - [ ] Retrieves index.html
  - [ ] Finds CSS reference
  - [ ] Verifies CSS is accessible (HTTP 200)
  - [ ] Validates CSS size and content
- [ ] Build completes with success status

#### View Build Logs

1. [ ] Go to [Cloud Build History](https://console.cloud.google.com/cloud-build/builds)
2. [ ] Find your test build
3. [ ] Review each step's logs
4. [ ] Verify `verify-css-deployed` step shows: "🎉 Deployment verification complete - CSS is properly deployed!"

### 3.2 Trigger via GitHub Push

Test the automated trigger:

1. [ ] Create a test commit in the repository:

   ```bash
   echo "# Test deployment" >> TEST.md
   git add TEST.md
   git commit -m "Test: Verify Cloud Build trigger"
   git push origin main
   ```

2. [ ] Monitor the build:
   - [ ] Go to [Cloud Build History](https://console.cloud.google.com/cloud-build/builds)
   - [ ] Find the build triggered by your commit
   - [ ] Verify it completes successfully

3. [ ] Clean up test file:

   ```bash
   git rm TEST.md
   git commit -m "Clean up test file"
   git push origin main
   ```

### 3.3 Verify Deployed Service

After successful deployment:

```bash
# Get the service URL
SERVICE_URL=$(gcloud run services describe pre-order-dealer-exchange-tracker \
  --region=us-west1 \
  --project=gen-lang-client-0615287333 \
  --format='value(status.url)')

echo "Service URL: $SERVICE_URL"

# Test the service
curl -I "$SERVICE_URL"
```

#### Expected Results

- [ ] Service URL is returned
- [ ] HTTP status is 200 OK
- [ ] Application loads correctly in browser
- [ ] CSS is properly applied (no unstyled content)

---

### 4.1 Verify GitHub Workflows

Check that GitHub Actions workflows don't pass SERVICE_URL as a substitution:

```bash
# From repository root
grep -r "substitutions.*SERVICE_URL" .github/workflows/
```

Expected: No matches found (or only in comments/error messages).

**GitHub Workflow Status**: The repository's `.github/workflows/build-and-deploy.yml` correctly uses:

```yaml
--substitutions=SHORT_SHA=${{ github.sha }},_REGION=${{ env.GCP_REGION }},_SERVICE=${{ env.SERVICE_NAME }}
```

✅ No SERVICE_URL in substitutions - this is correct!

**Note**: The workflow correctly retrieves SERVICE_URL as a bash variable during the deployment verification step, not as a substitution.

### 4.2 Review Other Cloud Build Triggers

Check if there are other triggers that might have the SERVICE_URL issue:

```bash
# List all triggers
gcloud builds triggers list --project=gen-lang-client-0615287333

# Check each trigger for SERVICE_URL
gcloud builds triggers describe <trigger-name> \
  --project=gen-lang-client-0615287333 \
  --format="yaml(substitutions)"
```

- [ ] Review each trigger's substitutions
- [ ] Remove `SERVICE_URL` or `_SERVICE_URL` from any other triggers

### 4.2 Verify Artifact Registry Repository

Ensure the Artifact Registry repository exists and is accessible:

```bash
# Verify repository exists
gcloud artifacts repositories describe vehicle-in-need \
  --location=us-west1 \
  --project=gen-lang-client-0615287333
```

Expected: Repository details should be displayed.

### 4.3 Verify Secret Manager Secret

Ensure the runtime secret exists:

```bash
# Verify secret exists
gcloud secrets describe vehicle-in-need-gemini \
  --project=gen-lang-client-0615287333
```

Expected: Secret details should be displayed with at least one version.

---

## 5. Troubleshooting

### Build Fails with "SERVICE_URL" Error

**Error**: `invalid value for 'build.substitutions': key in the template "SERVICE_URL" is not a valid built-in substitution`

**Solution**: Go back to Step 1.1 and ensure SERVICE_URL is removed from all trigger substitutions.

### Service Account Permission Denied

**Error**: `Permission denied` or `403 Forbidden` during deployment

**Solution**:

1. Review Step 2 and verify all required roles are assigned
2. Wait 60 seconds for IAM changes to propagate
3. Retry the build

### CSS Verification Fails

**Error**: `ERROR: No CSS file referenced in index.html` or `ERROR: CSS file returned HTTP 404`

**Potential Causes**:

1. Build process not generating CSS properly
2. Nginx configuration issue
3. CSS assets not copied to dist/ directory

**Solution**:

1. Run build locally: `npm run build`
2. Check dist/ directory for CSS files
3. Verify nginx.conf serves /assets/ correctly
4. Review build logs for CSS generation errors

### Deployment Takes Too Long

If deployment hangs or times out:

1. Check Cloud Run logs for startup errors:

   ```bash
   gcloud run services logs read pre-order-dealer-exchange-tracker \
     --region=us-west1 \
     --project=gen-lang-client-0615287333 \
     --limit=50
   ```

2. Verify the container starts locally:

   ```bash
   docker build -t test-image .
   docker run -p 8080:8080 test-image
   curl http://localhost:8080/health
   ```

---

## 6. Completion Checklist

Once all steps are complete:

- [ ] Cloud Build trigger configured correctly (no SERVICE_URL)
- [ ] Service account roles verified and configured
- [ ] Manual test build succeeds
- [ ] Trigger via GitHub push succeeds
- [ ] Deployed service is accessible and functional
- [ ] CSS verification passes
- [ ] All other triggers reviewed (if applicable)
- [ ] Documentation reviewed and understood

---

## Related Documentation

- [cloudbuild.yaml](./cloudbuild.yaml) - Build configuration (repository-side)
- [CLOUD_BUILD_SERVICE_URL_FIX.md](./CLOUD_BUILD_SERVICE_URL_FIX.md) - Detailed explanation of SERVICE_URL issue
- [QUICK_FIX_CHECKLIST.md](./QUICK_FIX_CHECKLIST.md) - Quick reference guide
- [README.md](./README.md) - Main documentation
- [scripts/verify-cloud-build-config.sh](./scripts/verify-cloud-build-config.sh) - Automated verification script
- [scripts/check-cloudbuild-service-url.sh](./scripts/check-cloudbuild-service-url.sh) - Static analysis guardrail

---

## Support

For issues or questions:

1. Review the [README.md troubleshooting section](./README.md#troubleshooting)
2. Check [Cloud Build documentation](https://cloud.google.com/build/docs)
3. Review build logs in GCP Console
4. Consult the repository maintainers

---

**Last Updated**: 2025-11-18  
**Maintainer**: Repository Owner  
**Status**: Ready for GCP-side configuration
