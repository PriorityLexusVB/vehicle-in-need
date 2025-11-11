# Vehicle-In-Need — Cloud Run Container Deploy Runbook

This app deploys to Cloud Run via Cloud Build using the Dockerfile in the repo. Static assets are built into the image; no GCS volumes are mounted at runtime.

## Project Information

- **GCP Project**: `gen-lang-client-0615287333`
- **Region**: `us-west1`
- **Cloud Run Service**: `pre-order-dealer-exchange-tracker`
- **Artifact Registry**: `us-west1-docker.pkg.dev/gen-lang-client-0615287333/vehicle-in-need`

## Overview

The deployment pipeline consists of:

1. **Dockerfile** — Multi-stage build that:
   - Builds the Vite React application with version info
   - Copies static assets to `dist/`
   - Installs production Node.js dependencies
   - Runs the Express server (`server/index.cjs`)
   - Exposes `/health` endpoint on port 8080

2. **Cloud Build** (`cloudbuild.yaml`) — Automatically triggered on push to `main`:
   - Builds Docker image with commit SHA and build timestamp
   - Pushes to Artifact Registry in `us-west1`
   - Deploys to Cloud Run service

3. **Express Server** (`server/index.cjs`):
   - Serves static files from `dist/`
   - Provides `/health` health check endpoint
   - Provides `/api` endpoints for AI proxy functionality
   - Listens on `process.env.PORT` (Cloud Run sets this to 8080)

## One-Time Setup (GCP Admin)

These steps should be performed once by a GCP administrator with appropriate permissions.

### 1. Create Artifact Registry Repository

```bash
# Create the Artifact Registry repository for Docker images
gcloud artifacts repositories create vehicle-in-need \
  --repository-format=docker \
  --location=us-west1 \
  --project=gen-lang-client-0615287333 \
  --description="Docker images for Vehicle-In-Need application"
```

### 2. Configure Cloud Build Service Account Permissions

The Cloud Build service account needs permissions to push to Artifact Registry and deploy to Cloud Run.

```bash
# Get the Cloud Build service account
PROJECT_ID="gen-lang-client-0615287333"
PROJECT_NUMBER=$(gcloud projects describe ${PROJECT_ID} --format="value(projectNumber)")
CLOUD_BUILD_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

# Grant Artifact Registry Writer role
gcloud artifacts repositories add-iam-policy-binding vehicle-in-need \
  --location=us-west1 \
  --member="serviceAccount:${CLOUD_BUILD_SA}" \
  --role="roles/artifactregistry.writer" \
  --project=${PROJECT_ID}

# Grant Cloud Run Admin role (to deploy services)
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${CLOUD_BUILD_SA}" \
  --role="roles/run.admin"

# Grant Service Account User role (to deploy as the Cloud Run service account)
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${CLOUD_BUILD_SA}" \
  --role="roles/iam.serviceAccountUser"
```

### 3. Remove GCS Fuse Volume (If Present)

If the Cloud Run service currently has a GCS Fuse volume mounted (which can cause startup failures), remove it:

```bash
# Check current service configuration
gcloud run services describe pre-order-dealer-exchange-tracker \
  --region=us-west1 \
  --project=gen-lang-client-0615287333 \
  --format=yaml

# If volumes are present, update the service to remove them
# Note: This will be done automatically during the next deployment via Cloud Build
# Or you can manually update using:
gcloud run services update pre-order-dealer-exchange-tracker \
  --region=us-west1 \
  --project=gen-lang-client-0615287333 \
  --clear-volumes
```

### 4. Configure Secret Manager for API Keys

**IMPORTANT**: Do NOT expose API keys in client-side code. API keys should only be used server-side.

#### Create Secrets in Secret Manager

```bash
# Create secret for Gemini API key (server-side only)
echo -n "your-actual-api-key-here" | gcloud secrets create gemini-api-key \
  --data-file=- \
  --replication-policy="automatic" \
  --project=gen-lang-client-0615287333

# Create secret for GCP credentials (if needed for Vertex AI)
gcloud secrets create gcp-credentials \
  --data-file=/path/to/service-account-key.json \
  --replication-policy="automatic" \
  --project=gen-lang-client-0615287333
```

#### Grant Cloud Run Service Access to Secrets

```bash
# Get the Cloud Run service account (default compute service account)
PROJECT_NUMBER=$(gcloud projects describe gen-lang-client-0615287333 --format="value(projectNumber)")
CLOUD_RUN_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# Grant Secret Accessor role for Gemini API key
gcloud secrets add-iam-policy-binding gemini-api-key \
  --member="serviceAccount:${CLOUD_RUN_SA}" \
  --role="roles/secretmanager.secretAccessor" \
  --project=gen-lang-client-0615287333

# Grant Secret Accessor role for GCP credentials (if applicable)
gcloud secrets add-iam-policy-binding gcp-credentials \
  --member="serviceAccount:${CLOUD_RUN_SA}" \
  --role="roles/secretmanager.secretAccessor" \
  --project=gen-lang-client-0615287333
```

### 5. Set Up Cloud Build Trigger

Create a Cloud Build trigger to automatically deploy on push to `main`:

```bash
# Create trigger via gcloud
gcloud builds triggers create github \
  --name="deploy-vehicle-in-need" \
  --repo-name="vehicle-in-need" \
  --repo-owner="PriorityLexusVB" \
  --branch-pattern="^main$" \
  --build-config="cloudbuild.yaml" \
  --region=us-west1 \
  --project=gen-lang-client-0615287333
```

Or create via Cloud Console:
1. Go to Cloud Build > Triggers
2. Click "Create Trigger"
3. Connect to GitHub repository `PriorityLexusVB/vehicle-in-need`
4. Set branch to `^main$`
5. Set build configuration to `cloudbuild.yaml`
6. Save

## Per-Deployment Process

### Automatic Deployment (via Cloud Build Trigger)

When code is pushed to the `main` branch:

1. Cloud Build automatically triggers
2. Builds Docker image with commit SHA
3. Pushes to Artifact Registry
4. Deploys to Cloud Run
5. New revision becomes active

Monitor the build:

```bash
# List recent builds
gcloud builds list --project=gen-lang-client-0615287333 --limit=5

# View specific build logs
gcloud builds log <BUILD_ID> --project=gen-lang-client-0615287333
```

### Manual Deployment (if needed)

If you need to trigger a manual deployment:

```bash
# Submit a manual Cloud Build
gcloud builds submit \
  --config=cloudbuild.yaml \
  --project=gen-lang-client-0615287333 \
  --region=us-west1
```

### Deploying with Secret Manager Integration

To deploy with secrets from Secret Manager, update the Cloud Build configuration or deploy manually:

```bash
# Deploy with secrets mounted as environment variables
gcloud run deploy pre-order-dealer-exchange-tracker \
  --image=us-west1-docker.pkg.dev/gen-lang-client-0615287333/vehicle-in-need/pre-order-dealer-exchange-tracker:latest \
  --region=us-west1 \
  --platform=managed \
  --allow-unauthenticated \
  --update-secrets=GEMINI_API_KEY=gemini-api-key:latest \
  --update-secrets=GOOGLE_APPLICATION_CREDENTIALS_JSON=gcp-credentials:latest \
  --project=gen-lang-client-0615287333
```

**Note**: Add `--update-secrets` flags to the deploy step in `cloudbuild.yaml` for automatic secret injection.

## Validation Checklist

After deployment, verify the service is working correctly:

### 1. Check Service Status

```bash
# Get service details
gcloud run services describe pre-order-dealer-exchange-tracker \
  --region=us-west1 \
  --project=gen-lang-client-0615287333

# Check if latest revision is ready
gcloud run revisions list \
  --service=pre-order-dealer-exchange-tracker \
  --region=us-west1 \
  --project=gen-lang-client-0615287333 \
  --limit=5
```

### 2. Test Health Endpoint

```bash
# Get service URL
SERVICE_URL=$(gcloud run services describe pre-order-dealer-exchange-tracker \
  --region=us-west1 \
  --project=gen-lang-client-0615287333 \
  --format="value(status.url)")

# Test health endpoint
curl -I ${SERVICE_URL}/health

# Expected output: HTTP/2 200
```

### 3. Test Application

```bash
# Open application in browser
echo "Application URL: ${SERVICE_URL}"

# Or use curl
curl ${SERVICE_URL}
```

### 4. Check Logs

```bash
# View recent logs
gcloud run services logs read pre-order-dealer-exchange-tracker \
  --region=us-west1 \
  --project=gen-lang-client-0615287333 \
  --limit=50

# Tail logs in real-time
gcloud run services logs tail pre-order-dealer-exchange-tracker \
  --region=us-west1 \
  --project=gen-lang-client-0615287333
```

### 5. Verify No GCS Volumes

```bash
# Check that no volumes are configured
gcloud run services describe pre-order-dealer-exchange-tracker \
  --region=us-west1 \
  --project=gen-lang-client-0615287333 \
  --format="get(spec.template.spec.volumes)"

# Expected output: empty or no volumes listed
```

## Rollback Procedures

### Rollback to Previous Revision

If the new deployment has issues, rollback to a previous working revision:

```bash
# List recent revisions
gcloud run revisions list \
  --service=pre-order-dealer-exchange-tracker \
  --region=us-west1 \
  --project=gen-lang-client-0615287333 \
  --limit=10

# Rollback to a specific revision
gcloud run services update-traffic pre-order-dealer-exchange-tracker \
  --region=us-west1 \
  --to-revisions=<REVISION_NAME>=100 \
  --project=gen-lang-client-0615287333
```

### Rollback via Tag

```bash
# Deploy a previous known-good image tag
gcloud run deploy pre-order-dealer-exchange-tracker \
  --image=us-west1-docker.pkg.dev/gen-lang-client-0615287333/vehicle-in-need/pre-order-dealer-exchange-tracker:<PREVIOUS_SHA> \
  --region=us-west1 \
  --project=gen-lang-client-0615287333
```

### Emergency Stop (Disable Service)

If you need to immediately stop the service:

```bash
# Set traffic to 0% (effectively disables the service)
gcloud run services update-traffic pre-order-dealer-exchange-tracker \
  --region=us-west1 \
  --to-revisions=<OLD_REVISION>=100 \
  --project=gen-lang-client-0615287333

# Or delete the service entirely (use with caution)
gcloud run services delete pre-order-dealer-exchange-tracker \
  --region=us-west1 \
  --project=gen-lang-client-0615287333
```

## Security Best Practices

### 1. Client vs Server Environment Variables

- **NEVER** expose sensitive API keys in Vite environment variables (prefixed with `VITE_`)
- Vite exposes all `VITE_*` variables to the browser bundle
- API keys should only be used server-side in `server/index.cjs` or `server/aiProxy.cjs`

### 2. Using Secret Manager

- Store all API keys and credentials in Secret Manager
- Mount secrets as environment variables using `--update-secrets` flag
- Use IAM to control access to secrets

### 3. Server-Side API Proxy

If the client needs to make AI API calls:

1. **DO NOT** expose `VITE_GEMINI_API_KEY` to the client
2. **DO** route requests through the server's `/api` endpoints
3. The server (`server/aiProxy.cjs`) already implements this pattern
4. Client makes requests to `/api/generate` which proxies to Vertex AI

## Troubleshooting

### Build Failures

**Issue**: Docker build fails with "npm ci" errors

**Solution**: Ensure `package-lock.json` is committed and up-to-date. The Dockerfile uses `npm ci` which requires a lockfile.

---

**Issue**: Cloud Build times out

**Solution**: Increase timeout in `cloudbuild.yaml` (currently set to 1200s = 20 minutes)

### Deployment Failures

**Issue**: "Permission denied" when pushing to Artifact Registry

**Solution**: Ensure Cloud Build SA has `roles/artifactregistry.writer` role

---

**Issue**: "Permission denied" when deploying to Cloud Run

**Solution**: Ensure Cloud Build SA has `roles/run.admin` and `roles/iam.serviceAccountUser` roles

### Runtime Failures

**Issue**: Service fails health checks

**Solution**: 
- Check logs: `gcloud run services logs read pre-order-dealer-exchange-tracker`
- Verify port 8080 is exposed in Dockerfile
- Verify server listens on `process.env.PORT`
- Ensure `/health` endpoint returns 200 OK

---

**Issue**: "Failed to mount GCS volume"

**Solution**: Remove GCS Fuse volumes from service configuration:
```bash
gcloud run services update pre-order-dealer-exchange-tracker \
  --clear-volumes \
  --region=us-west1 \
  --project=gen-lang-client-0615287333
```

---

**Issue**: Environment variables not set

**Solution**: 
- Check if secrets are properly configured in Secret Manager
- Verify Cloud Run SA has `roles/secretmanager.secretAccessor`
- Use `--update-secrets` in deploy command

## Additional Resources

- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Cloud Build Documentation](https://cloud.google.com/build/docs)
- [Artifact Registry Documentation](https://cloud.google.com/artifact-registry/docs)
- [Secret Manager Documentation](https://cloud.google.com/secret-manager/docs)
- [Dockerfile Best Practices](https://docs.docker.com/develop/dev-best-practices/)

## Repository Cleanup Notes

This deployment runbook assumes the following repository cleanups have been completed:

- ✅ `pnpm-lock.yaml` removed from repository root
- ✅ `package.json` has no merge conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`)
- ✅ `packageManager` field set to `npm@10.8.2` in `package.json`
- ✅ `start` script added to `package.json` (`"start": "node server/index.cjs"`)
- ✅ `cloudbuild.yaml` updated to use Artifact Registry path
- ✅ Dockerfile uses `package-lock.json` and `npm ci` (no changes required)

## Out of Scope (Future Enhancements)

The following items are intentionally out of scope for this deployment setup but can be considered for future improvements:

1. **GitHub Actions with Workload Identity Federation**: Migrate from Cloud Build triggers to GitHub Actions using OIDC authentication
2. **Additional Secret Manager Integration**: Move all remaining environment variables to Secret Manager
3. **CI/CD Pre-flight Checks**: Add automated checks to fail builds on:
   - Merge conflict markers in any files
   - Missing or mismatched lockfiles
   - Security vulnerabilities
4. **Multi-environment Deployments**: Set up separate dev/staging/prod environments
5. **Canary Deployments**: Implement gradual traffic shifting for safer deployments
6. **Automated Rollback**: Implement automated rollback on health check failures
