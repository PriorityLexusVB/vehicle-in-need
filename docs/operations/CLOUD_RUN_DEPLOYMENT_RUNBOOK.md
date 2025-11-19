# Cloud Run Deployment Runbook

**Service:** pre-order-dealer-exchange-tracker  
**Region:** us-west1  
**Registry:** us-west1-docker.pkg.dev

---

## ⚠️ CRITICAL: DO NOT USE `gcloud run deploy --source`

**This service MUST be deployed using pre-built Docker images.**

Using `gcloud run deploy --source` creates corrupted images with invalid OCI
metadata (mismatched manifest layers and config diff_ids), causing deployment
failures.

**ALWAYS use the process documented below.**

---

## Prerequisites

1. **GCP Authentication**

   ```bash
   gcloud auth login
   gcloud config set project gen-lang-client-0615287333
   ```

2. **Verify Permissions**
   - You need `roles/cloudbuild.builds.editor` to submit builds
   - You need `roles/run.admin` to deploy Cloud Run services

3. **Required Tools**
   - gcloud CLI (latest version)
   - git

---

## Service Account Setup and Permissions

This project uses a **least-privilege IAM architecture** with dedicated service accounts:

The Cloud Build service account needs proper permissions to deploy to Cloud Run
and access secrets.

**Service Account Email:**

```text
<PROJECT_NUMBER>@cloudbuild.gserviceaccount.com
```

For project `gen-lang-client-0615287333`, find your project number:

```bash
# Grant Log Writer (for Cloud Logging)
gcloud projects add-iam-policy-binding gen-lang-client-0615287333 \
  --member="serviceAccount:pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com" \
  --role="roles/logging.logWriter"

# Grant Secret Manager Secret Accessor (for runtime secrets)
gcloud secrets add-iam-policy-binding vehicle-in-need-gemini \
  --member="serviceAccount:pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --project=gen-lang-client-0615287333
```

**Note:** Add additional roles based on your application needs (e.g., Firestore, Pub/Sub).

1. **Cloud Run Admin** - to deploy services:

   ```bash
   gcloud projects add-iam-policy-binding gen-lang-client-0615287333 \
     --member="serviceAccount:<PROJECT_NUMBER>@cloudbuild.gserviceaccount.com" \
     --role="roles/run.admin"
   ```

2. **Service Account User** - to deploy as the runtime service account:

   ```bash
   gcloud iam service-accounts add-iam-policy-binding \
     <PROJECT_NUMBER>-compute@developer.gserviceaccount.com \
     --member="serviceAccount:<PROJECT_NUMBER>@cloudbuild.gserviceaccount.com" \
     --role="roles/iam.serviceAccountUser"
   ```

3. **Secret Manager Secret Accessor** - to access API keys:

   ```bash
   gcloud secrets add-iam-policy-binding vehicle-in-need-gemini \
     --member="serviceAccount:<PROJECT_NUMBER>@cloudbuild.gserviceaccount.com" \
     --role="roles/secretmanager.secretAccessor"
   ```

**Verification:**

```bash
# First, check current roles
gcloud projects get-iam-policy gen-lang-client-0615287333 \
  --flatten="bindings[].members" \
  --filter="bindings.members:842946218691-compute@developer.gserviceaccount.com"

# Remove overly broad roles (if present)
# WARNING: Only run these if you're certain no other services depend on these roles
# gcloud projects remove-iam-policy-binding gen-lang-client-0615287333 \
#   --member="serviceAccount:842946218691-compute@developer.gserviceaccount.com" \
#   --role="roles/editor"
# 
# gcloud projects remove-iam-policy-binding gen-lang-client-0615287333 \
#   --member="serviceAccount:842946218691-compute@developer.gserviceaccount.com" \
#   --role="roles/run.admin"
```

### Verification

1. **Secret Manager Secret Accessor** - to access secrets at runtime:

   ```bash
   gcloud secrets add-iam-policy-binding vehicle-in-need-gemini \
     --member="serviceAccount:<PROJECT_NUMBER>-compute@developer.\

gserviceaccount.com" \
     --role="roles/secretmanager.secretAccessor"

   ```

**Note:** This permission was likely already granted during initial service
setup. Verify with:

```bash
# Check Cloud Build SA permissions
gcloud projects get-iam-policy gen-lang-client-0615287333 \
  --flatten="bindings[].members" \
  --filter="bindings.members:cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com" \
  --format="table(bindings.role)"

# Check Runtime SA permissions
gcloud projects get-iam-policy gen-lang-client-0615287333 \
  --flatten="bindings[].members" \
  --filter="bindings.members:pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com" \
  --format="table(bindings.role)"

# Verify impersonation permission
gcloud iam service-accounts get-iam-policy \
  pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com \
  --project=gen-lang-client-0615287333

# Check secret access
gcloud secrets get-iam-policy vehicle-in-need-gemini
```

---

## Deployment Process

### Option 1: Automated Deployment via GitHub Actions (Recommended)

**For most deployments, use the automated GitHub Actions workflow:**

1. **Push to main branch** (if code changes are on main):

   ```bash
   git checkout main
   git pull origin main
   git push origin main
   ```

   - This automatically triggers the build-and-deploy workflow
   - Builds image and pushes to Artifact Registry
   - Does NOT auto-deploy to Cloud Run (requires manual step)

2. **Check build status**:
   - Go to: <https://github.com/PriorityLexusVB/vehicle-in-need/actions>
   - Wait for "Build and Push Container" workflow to complete
   - Verify image was pushed to Artifact Registry

3. **Deploy manually** (copy SHA from GitHub Actions output):

   ```bash
   export SHORT_SHA=<commit-sha-from-github>
   
   gcloud run deploy pre-order-dealer-exchange-tracker \
     --image=us-west1-docker.pkg.dev/gen-lang-client-0615287333/vehicle-in-need/pre-order-dealer-exchange-tracker:${SHORT_SHA} \
     --region=us-west1 \
     --platform=managed \
     --allow-unauthenticated \
     --service-account=pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com \
     --set-env-vars=NODE_ENV=production,APP_VERSION=${SHORT_SHA},BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
     --update-secrets=API_KEY=vehicle-in-need-gemini:latest
   ```

### Option 2: Manual Build and Deploy via Cloud Build

**Use this when GitHub Actions is not available or for testing:**

1. **Navigate to repository**:

   ```bash
   cd /path/to/vehicle-in-need
   ```

2. **Ensure clean working directory**:

   ```bash
   git status
   # Should show no uncommitted changes
   ```

3. **Get current commit SHA or create a manual tag**:

   ```bash
   # Option A: Use current commit SHA (recommended for git commits)
   export SHORT_SHA=$(git rev-parse --short=7 HEAD)
   
   # Option B: Use manual tag (recommended for testing/manual deploys)
   export SHORT_SHA=manual-$(date +%Y%m%d-%H%M)
   
   echo "Building and deploying with tag: $SHORT_SHA"
   ```

4. **Submit build to Cloud Build**:

   ```bash
   gcloud builds submit \
     --config cloudbuild.yaml \
     --substitutions SHORT_SHA=${SHORT_SHA},_REGION=us-west1,_SERVICE=pre-order-dealer-exchange-tracker
   ```

   This will:
   - Check for merge conflict markers (fails fast if found)
   - Build Docker image with commit SHA
   - Push to Artifact Registry with tags: `${SHORT_SHA}` and `latest`
   - Automatically deploy to Cloud Run with secrets

5. **Monitor build progress**:
   - Cloud Build will stream logs to your terminal
   - You can also check: <https://console.cloud.google.com/cloud-build/builds>
   - Wait for "SUCCESS" status

6. **Verify deployment** (automatically deployed by cloudbuild.yaml step 5):

   ```bash
   gcloud run services describe pre-order-dealer-exchange-tracker \
     --region=us-west1 \
     --format='value(status.url)'
   ```

### Option 3: Manual Docker Build and Push (Advanced)

**Use this for local testing or when Cloud Build is unavailable:**

⚠️ **Note:** Local Docker builds may encounter npm errors. Use Cloud Build
(Option 2) for production.

1. **Set up variables**:

   ```bash
   export PROJECT_ID=gen-lang-client-0615287333
   export REGION=us-west1
   export SERVICE=pre-order-dealer-exchange-tracker
   export TAG=manual-$(date +%Y%m%d-%H%M)
   export IMAGE=us-west1-docker.pkg.dev/${PROJECT_ID}/vehicle-in-need/${SERVICE}:${TAG}
   ```

2. **Authenticate Docker with Artifact Registry**:

   ```bash
   gcloud auth configure-docker us-west1-docker.pkg.dev
   ```

3. **Build image locally**:

   ```bash
   docker build \
     --build-arg COMMIT_SHA=${TAG} \
     --build-arg BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
     -t ${IMAGE} \
     -t us-west1-docker.pkg.dev/${PROJECT_ID}/vehicle-in-need/${SERVICE}:latest \
     .
   ```

4. **Push to Artifact Registry**:

   ```bash
   docker push ${IMAGE}
   docker push us-west1-docker.pkg.dev/${PROJECT_ID}/vehicle-in-need/${SERVICE}:latest
   ```

5. **Deploy to Cloud Run**:

   ```bash
   gcloud run deploy ${SERVICE} \
     --image=${IMAGE} \
     --region=${REGION} \
     --platform=managed \
     --allow-unauthenticated \
     --set-env-vars=NODE_ENV=production,APP_VERSION=${TAG},BUILD_TIME=$(date -u
       +%Y-%m-%dT%H:%M:%SZ) \
     --update-secrets=API_KEY=vehicle-in-need-gemini:latest
   ```

### Option 4: Deploy Existing Image (No Rebuild)

**Use this to deploy an image that's already in Artifact Registry:**

1. **List available images**:

   ```bash
   gcloud artifacts docker images list \
     us-west1-docker.pkg.dev/gen-lang-client-0615287333/vehicle-in-need/pre-order-dealer-exchange-tracker \
     --limit=10
   ```

2. **Select image SHA** (or use `latest`):

   ```bash
   export SHORT_SHA=<sha-from-list>
   ```

3. **Deploy**:

   ```bash
   gcloud run deploy pre-order-dealer-exchange-tracker \
     --image=us-west1-docker.pkg.dev/gen-lang-client-0615287333/vehicle-in-need/pre-order-dealer-exchange-tracker:${SHORT_SHA} \
     --region=us-west1 \
     --platform=managed \
     --allow-unauthenticated \
     --set-env-vars=NODE_ENV=production,APP_VERSION=${SHORT_SHA},BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
     --update-secrets=API_KEY=vehicle-in-need-gemini:latest
   ```

---

## Verification Steps

### 1. Check Service Status

```bash
gcloud run services describe pre-order-dealer-exchange-tracker \
  --region=us-west1 \
  --format='yaml(status.latestReadyRevisionName,status.url,status.conditions)'
```

**Expected output:**

- `status.url`: Should show the service URL
- `status.latestReadyRevisionName`: Should show the newly deployed revision
- `status.conditions`: All conditions should have `status: "True"`

### 2. Health Check

```bash
SERVICE_URL=$(gcloud run services describe pre-order-dealer-exchange-tracker \
  --region=us-west1 \
  --format='value(status.url)')

curl -f "${SERVICE_URL}/health"
```

**Expected output:** `healthy`

### 3. Status API Check

```bash
curl -s "${SERVICE_URL}/api/status" | jq '.'
```

**Expected output:**

```json
{
  "status": "healthy",
  "geminiEnabled": true,
  "version": "<your-commit-sha>",
  "buildTime": "<build-timestamp>",
  "nodeVersion": "v20.x.x",
  "environment": "production",
  "timestamp": "<current-iso-timestamp>",
  "uptime": <seconds>
}
```

### 4. Check Logs

```bash
gcloud run services logs read pre-order-dealer-exchange-tracker \
  --region=us-west1 \
  --limit=50
```

**Look for:**

- Server startup message: "Vehicle Order Tracker Server"
- "Running on: <http://0.0.0.0:8080>"
- No error messages

### 5. Test Application UI

1. Open service URL in browser
2. Verify application loads correctly
3. Check browser console for errors
4. Test core functionality (login, view orders, etc.)

---

## Troubleshooting

### Build Fails with "conflict markers found"

**Symptom:** Cloud Build fails at check-conflicts step

**Solution:**

```bash
# Search for conflict markers
grep -r '<<<<<<< \|=======$\|>>>>>>> ' \
  --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" \
  --exclude-dir=node_modules .

# Resolve conflicts and commit
git add .
git commit -m "Resolve merge conflicts"
```

### Build Fails with npm Errors

**Symptom:** Docker build step fails with npm errors

**Solution:**

- This is expected in local Docker builds (known npm bug)
- Use Cloud Build instead - it works correctly
- See [DOCKER_BUILD_NOTES.md](./DOCKER_BUILD_NOTES.md) for details

### Deployment Fails with "Layer Mismatch" Error

**Symptom:** `got 1 Manifest.Layers vs 0 ConfigFile.RootFS.DiffIDs`

**Cause:** Using `gcloud run deploy --source` or corrupted image

**Solution:**

1. DO NOT use `--source` deployment method
2. Rebuild using Cloud Build (Option 2 above)
3. Deploy with explicit `--image` flag

### Recovering from Corrupted `cloud-run-source-deploy` Deployment

**Symptom:** Service shows deployment type as `cloud-run-source-deploy` instead
of `Container image`, or has OCI layer mismatch errors.

**Cause:** The service was deployed using `gcloud run deploy --source`, which
creates corrupted images with invalid OCI metadata.

**Solution - Complete Service Recreation:**

1. **List and save current environment variables and secrets**:

   ```bash
   gcloud run services describe pre-order-dealer-exchange-tracker \
     --region=us-west1 \
     --format='yaml(spec.template.spec.containers[0].env)' > /tmp/service-env.yaml
   
   gcloud run services describe pre-order-dealer-exchange-tracker \
     --region=us-west1 \
     --format='yaml(spec.template.spec.containers[0].env)' | grep -A 1 'secretKeyRef'
   ```

2. **Delete the corrupted service**:

   ```bash
   gcloud run services delete pre-order-dealer-exchange-tracker \
     --region=us-west1 \
     --quiet
   ```

3. **Verify a clean Docker image exists in Artifact Registry**:

   ```bash
   gcloud artifacts docker images list \
     us-west1-docker.pkg.dev/gen-lang-client-0615287333/vehicle-in-need/pre-order-dealer-exchange-tracker \
     --limit=5
   ```

4. **If no clean image exists, build one**:

   ```bash
   # Use Option 2 (Cloud Build) or Option 3 (Manual Docker build)
   export SHORT_SHA=manual-$(date +%Y%m%d-%H%M)
   gcloud builds submit \
     --config cloudbuild.yaml \
     --substitutions SHORT_SHA=${SHORT_SHA},_REGION=us-west1,_SERVICE=pre-order-dealer-exchange-tracker
   ```

5. **Deploy from clean image**:

   ```bash
   export SHORT_SHA=<tag-from-step-3-or-4>
   
   gcloud run deploy pre-order-dealer-exchange-tracker \
     --image=us-west1-docker.pkg.dev/gen-lang-client-0615287333/vehicle-in-need/pre-order-dealer-exchange-tracker:${SHORT_SHA} \
     --region=us-west1 \
     --platform=managed \
     --allow-unauthenticated \
     --set-env-vars=NODE_ENV=production,APP_VERSION=${SHORT_SHA},BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
     --update-secrets=API_KEY=vehicle-in-need-gemini:latest
   ```

6. **Verify the deployment type**:

   ```bash
   gcloud run services describe pre-order-dealer-exchange-tracker \
     --region=us-west1 \
     --format='value(metadata.labels)'
   ```

   Should show deployment type as `Container image`, NOT
   `cloud-run-source-deploy`.

7. **Test the service**:

   ```bash
   SERVICE_URL=$(gcloud run services describe pre-order-dealer-exchange-tracker \
     --region=us-west1 \
     --format='value(status.url)')
   
   curl -f "${SERVICE_URL}/health"
   curl -s "${SERVICE_URL}/api/status" | jq '.'
   ```

### Image Not Found in Artifact Registry

**Symptom:** `gcloud run deploy` fails - image not found

**Solution:**

```bash
# Check if image exists
gcloud artifacts docker images list \
  us-west1-docker.pkg.dev/gen-lang-client-0615287333/vehicle-in-need/pre-order-dealer-exchange-tracker

# If empty, rebuild
gcloud builds submit --config cloudbuild.yaml
```

### Service Not Responding (Health Check Fails)

**Symptom:** curl to /health endpoint times out or fails

**Solution:**

```bash
# Check recent logs
gcloud run services logs read pre-order-dealer-exchange-tracker \
  --region=us-west1 \
  --limit=100

# Look for:
# - Port binding errors
# - Missing environment variables
# - Crash on startup

# Common fixes:
# - Ensure secrets are properly mounted (API_KEY)
# - Check for missing environment variables
# - Verify image built successfully
```

### Rollback to Previous Version

**If deployment fails and you need to rollback:**

1. **List previous revisions**:

   ```bash
   gcloud run revisions list \
     --service=pre-order-dealer-exchange-tracker \
     --region=us-west1
   ```

2. **Roll back to specific revision**:

   ```bash
   gcloud run services update-traffic pre-order-dealer-exchange-tracker \
     --region=us-west1 \
     --to-revisions=<REVISION_NAME>=100
   ```

---

## Security Notes

### Secrets Management

The service uses Google Secret Manager for sensitive data:

- `API_KEY`: Gemini/Vertex AI API key (stored as `vehicle-in-need-gemini`)

**To update secret:**

```bash
# View current secret versions
gcloud secrets versions list vehicle-in-need-gemini

# Add new version
echo -n "NEW_API_KEY_VALUE" |
gcloud secrets versions add vehicle-in-need-gemini --data-file=-

# Redeploy service to use new version (uses :latest by default)
gcloud run services update pre-order-dealer-exchange-tracker --region=us-west1
```

### Public Access

The service is configured with `--allow-unauthenticated` because:

- It's a public-facing application
- Authentication is handled at application level (Firebase Auth)
- API endpoints validate requests internally

**To restrict access** (if needed):

```bash
gcloud run services remove-iam-policy-binding pre-order-dealer-exchange-tracker \
  --region=us-west1 \
  --member="allUsers" \
  --role="roles/run.invoker"
```

---

## Quick Reference Commands

### Get Service URL

```bash
gcloud run services describe pre-order-dealer-exchange-tracker \
  --region=us-west1 \
  --format='value(status.url)'
```

### View Recent Logs

```bash
gcloud run services logs read pre-order-dealer-exchange-tracker \
  --region=us-west1 \
  --limit=50 \
  --format='table(timestamp,severity,textPayload)'
```

### Check Build History

```bash
gcloud builds list \
  --filter="source.repoSource.repoName=vehicle-in-need" \
  --limit=10
```

### Inspect Image

```bash
docker pull us-west1-docker.pkg.dev/gen-lang-client-0615287333/vehicle-in-need/pre-order-dealer-exchange-tracker:latest
docker inspect
us-west1-docker.pkg.dev/gen-lang-client-0615287333/vehicle-in-need/pre-order-dealer-exchange-tracker:latest | jq '.[0].RootFS.Layers'
```

---

## Related Documentation

- [CONTAINER_IMAGE_ISSUES.md](./CONTAINER_IMAGE_ISSUES.md) - Container image
  troubleshooting
- [DOCKER_BUILD_NOTES.md](./DOCKER_BUILD_NOTES.md) - Docker build instructions
- [cloudbuild.yaml](./cloudbuild.yaml) - Cloud Build configuration
- [Dockerfile](./Dockerfile) - Container definition
-

[.github/workflows/build-and-deploy.yml](./.github/workflows/build-and-deploy.yml) - GitHub Actions workflow

---

## Support

For issues or questions:

1. Check [CONTAINER_IMAGE_ISSUES.md](./CONTAINER_IMAGE_ISSUES.md) for known
  issues
2. Review Cloud Build logs:
  <https://console.cloud.google.com/cloud-build/builds>
3. Review Cloud Run logs: <https://console.cloud.google.com/run>
4. Create GitHub issue with details and error messages
