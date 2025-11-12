# Deployment Stabilization Verification Guide

This guide provides step-by-step commands to verify the deployment stabilization work for the Vehicle Order Tracker application.

## Prerequisites

- Google Cloud SDK (`gcloud`) installed and authenticated
- Docker installed (for local testing)
- Access to the `gen-lang-client-0615287333` project
- Appropriate IAM permissions for Cloud Build, Cloud Run, and Secret Manager

## 1. Verify Local Repository

### Check for Merge Conflict Markers

```bash
cd /path/to/vehicle-in-need
grep -r '<<<<<<< \|=======$\|>>>>>>> ' --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --include="*.html" --exclude-dir=node_modules .
```

**Expected Result:** No output (no markers found)

### Check for Client-Side API Keys

```bash
grep -r "VITE_GEMINI_API_KEY\|AIza" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --include="*.html" --exclude-dir=node_modules --exclude-dir=dist .
```

**Expected Result:** No matches found (or only VITE_APP_COMMIT_SHA and VITE_APP_BUILD_TIME which are version info, not secrets)

## 2. Local Build Verification

### Install Dependencies

```bash
npm ci
```

**Expected Result:** Dependencies installed successfully, no errors

### Run Prebuild Check

```bash
npm run prebuild
```

**Expected Result:** `✓ No conflict markers detected`

### Build Application

```bash
npm run build
```

**Expected Result:** Build completes successfully, creates `dist/` directory

### Verify No Secrets in Build Output

```bash
grep -r "AIza\|VITE_GEMINI_API_KEY" dist/
```

**Expected Result:** No matches found

## 3. Docker Build (Local - Expected to Fail on Alpine)

**Note:** Due to a known npm bug in Alpine Linux, local Docker builds may fail. This is documented in `DOCKER_BUILD_NOTES.md` and `Dockerfile`. The build works correctly in Google Cloud Build.

```bash
docker build -t local-test-image --build-arg COMMIT_SHA=test-build --build-arg BUILD_TIME=local-verification .
```

**Expected Result:** Build may fail locally with "Exit handler never called!" error. This is expected. Skip to Cloud Build verification.

## 4. Cloud Build Verification

### Set Project

```bash
gcloud config set project gen-lang-client-0615287333
```

### Option A: Trigger Existing Cloud Build Trigger

```bash
gcloud builds triggers run vehicle-in-need-deploy \
  --branch=feat/deploy-stabilization-finalize \
  --project=gen-lang-client-0615287333
```

### Option B: Manual Cloud Build Submit

```bash
gcloud builds submit \
  --config=cloudbuild.yaml \
  --project=gen-lang-client-0615287333 \
  .
```

**Expected Result:** 
- Build completes successfully
- Conflict marker check passes
- Docker image builds without errors
- Image pushed to Artifact Registry
- Cloud Run service deployed

### Monitor Build

```bash
# Get the build ID from the trigger/submit output, then:
gcloud builds log <BUILD_ID> --project=gen-lang-client-0615287333 --stream
```

### Check Build Status

```bash
gcloud builds list \
  --project=gen-lang-client-0615287333 \
  --limit=5 \
  --format="table(id,status,createTime,duration)"
```

**Expected Result:** Most recent build shows `SUCCESS` status

## 5. Artifact Registry Verification

### List Docker Images

```bash
gcloud artifacts docker images list \
  us-west1-docker.pkg.dev/gen-lang-client-0615287333/vehicle-in-need \
  --project=gen-lang-client-0615287333 \
  --format='table(image,tags,updateTime)'
```

**Expected Result:** 
- Image with `latest` tag
- Image with short SHA tag (e.g., `abc1234`)
- Recent update time

## 6. Cloud Run Service Verification

### Check Service Configuration

```bash
gcloud run services describe pre-order-dealer-exchange-tracker \
  --region=us-west1 \
  --project=gen-lang-client-0615287333 \
  --format=json > /tmp/service-config.json
```

### Verify Secret Injection

```bash
gcloud run services describe pre-order-dealer-exchange-tracker \
  --region=us-west1 \
  --project=gen-lang-client-0615287333 \
  --format='json(spec.template.spec.containers[0].env)' | jq '.spec.template.spec.containers[0].env[] | select(.name == "API_KEY")'
```

**Expected Result:** Output should show `valueFrom.secretKeyRef` with:
```json
{
  "name": "API_KEY",
  "valueFrom": {
    "secretKeyRef": {
      "key": "latest",
      "name": "vehicle-in-need-gemini"
    }
  }
}
```

**Important:** The value should NOT be a plaintext string. It must be a `secretKeyRef`.

### Get Service URL

```bash
SERVICE_URL=$(gcloud run services describe pre-order-dealer-exchange-tracker \
  --region=us-west1 \
  --project=gen-lang-client-0615287333 \
  --format='value(status.url)')
echo "Service URL: $SERVICE_URL"
```

### Test Health Endpoint

```bash
curl -sf "${SERVICE_URL}/health"
```

**Expected Result:** `healthy` response with HTTP 200 status

### Test API Status Endpoint

```bash
curl -sf "${SERVICE_URL}/api/status" | jq '.'
```

**Expected Result:** JSON response with service status, version info, and `geminiEnabled: true`

## 7. Secret Manager Verification

### Check Secret Exists

```bash
gcloud secrets describe vehicle-in-need-gemini \
  --project=gen-lang-client-0615287333
```

**Expected Result:** Secret metadata displayed, showing creation time and versions

### List Secret Versions

```bash
gcloud secrets versions list vehicle-in-need-gemini \
  --project=gen-lang-client-0615287333 \
  --format="table(name,state,createTime)"
```

**Expected Result:** At least one version in `ENABLED` state

## 8. Security Verification

### Verify Service Account Permissions

```bash
gcloud run services describe pre-order-dealer-exchange-tracker \
  --region=us-west1 \
  --project=gen-lang-client-0615287333 \
  --format='value(spec.template.spec.serviceAccountName)'
```

### Check IAM Permissions

```bash
# Get the service account from previous command, then:
gcloud projects get-iam-policy gen-lang-client-0615287333 \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:<SERVICE_ACCOUNT_EMAIL>" \
  --format="table(bindings.role)"
```

**Expected Roles:**
- `roles/secretmanager.secretAccessor` (to access secrets)
- `roles/aiplatform.user` (to use Vertex AI)

## 9. Functional Testing

### Test AI Email Generation (Requires Authentication)

```bash
# Get an auth token (if using authentication)
TOKEN=$(gcloud auth print-identity-token)

# Test the AI endpoint
curl -X POST "${SERVICE_URL}/api/generate-email" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "order": {
      "id": "test-123",
      "customerName": "John Doe",
      "model": "RX 350",
      "year": "2025",
      "status": "Factory Order",
      "salesperson": "Jane Smith",
      "depositAmount": 5000,
      "msrp": 50000
    }
  }'
```

**Expected Result:** JSON response with `success: true` and generated email content

## 10. Comprehensive Verification Report

After running all commands, create a summary report with:

1. ✅ No merge conflict markers in repository
2. ✅ No client-side API keys (VITE_GEMINI_API_KEY) in source or build
3. ✅ Local build succeeds
4. ✅ Cloud Build succeeds
5. ✅ Docker image pushed to Artifact Registry
6. ✅ Cloud Run service uses secretKeyRef (not plaintext)
7. ✅ Health endpoint returns 200
8. ✅ Secret exists in Secret Manager
9. ✅ Service account has proper IAM roles
10. ✅ AI email generation endpoint works

## Troubleshooting

### Build Fails with "Exit handler never called!"

**Solution:** This is expected locally with Alpine Linux. Use Cloud Build instead:
```bash
gcloud builds submit --config=cloudbuild.yaml
```

### Health Check Fails

**Possible Causes:**
- Service not fully deployed
- Incorrect region
- Network/firewall issues

**Solution:** Check service logs:
```bash
gcloud run services logs read pre-order-dealer-exchange-tracker \
  --region=us-west1 \
  --project=gen-lang-client-0615287333 \
  --limit=50
```

### AI Endpoint Returns 503

**Possible Causes:**
- Vertex AI not initialized
- Missing IAM permissions
- Invalid secret

**Solution:** Check service logs and verify IAM permissions

## Automated Guards

The following automated guards are in place to prevent issues:

1. **prebuild script** (`package.json`): Checks for conflict markers before every build
2. **Cloud Build guard** (`cloudbuild.yaml`): First step checks for conflict markers
3. **Dockerfile prebuild** (`Dockerfile`): Runs prebuild check during Docker build
4. **Secret injection** (`cloudbuild.yaml`): Uses `--update-secrets` flag for secure secret handling

## Next Steps After Verification

1. Document all verification results in the PR description
2. Include screenshots/command outputs proving:
   - Successful build
   - Health check passing
   - Secret properly configured
3. Merge PR to `main` after review
4. Monitor production deployment

## References

- [DEV_NOTES.md](./docs/DEV_NOTES.md) - Secret management and local development
- [DOCKER_BUILD_NOTES.md](./DOCKER_BUILD_NOTES.md) - Docker build troubleshooting
- [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md) - Deployment procedures
