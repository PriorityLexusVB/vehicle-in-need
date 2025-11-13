# Container Build and Deployment Guide

This document provides comprehensive instructions for building and deploying the Vehicle Order Tracker application to Cloud Run.

## Overview

The application uses a multi-stage Dockerfile that produces valid OCI images compatible with Cloud Run. Images are built and stored in Google Artifact Registry for reliable, reproducible deployments.

## Architecture

```
Source Code → Docker Build → Security Scanning → Artifact Registry → Cloud Run
                     ↓              ↓
               Validation     (Trivy, SBOM, Grype)
             (layer structure,
              health check)
```

**Key Components:**
- **Dockerfile**: Multi-stage build using `node:20-slim`
- **GitHub Actions**: Automated build, security scanning, and push on commits to main
- **Cloud Build**: Alternative build method using `cloudbuild.yaml`
- **Artifact Registry**: `us-west1-docker.pkg.dev/gen-lang-client-0615287333/vehicle-in-need/pre-order-dealer-exchange-tracker`
- **Security Scanning**: Trivy vulnerability scanning, Syft SBOM generation, Grype analysis

> **Note**: For detailed information about security scanning, see [SECURITY_SCANNING.md](./SECURITY_SCANNING.md)

## Building the Container

### Option 1: GitHub Actions (Recommended for CI/CD)

The repository includes a GitHub Actions workflow that automatically builds and pushes images on every commit to main.

**Setup Requirements:**
1. Configure GCP authentication in GitHub repository settings
2. Add required secrets (see below)

**GitHub Secrets Required:**
```yaml
GCP_WORKLOAD_IDENTITY_PROVIDER: projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL/providers/PROVIDER
GCP_SERVICE_ACCOUNT: github-actions@PROJECT_ID.iam.gserviceaccount.com

# OR (if not using Workload Identity Federation)
GCP_SA_KEY: <service account JSON key>
```

**Workflow Behavior:**
- **On PRs**: Builds, validates, and runs security scans (does not push)
- **On push to main**: Builds, validates, runs security scans, and pushes to Artifact Registry
- **Tags**: Creates both `:latest` and `:COMMIT_SHA` tags
- **Security**: Runs Trivy vulnerability scanning, generates SBOM with Syft, and runs Grype analysis
- **Artifacts**: Uploads SBOM as build artifact (retained for 90 days)

See `.github/workflows/build-and-deploy.yml` for details.

### Option 2: Cloud Build

Use Cloud Build for production builds with full GCP integration:

```bash
# Submit build to Cloud Build
gcloud builds submit --config cloudbuild.yaml

# Check build status
gcloud builds list --limit=5

# View build logs
gcloud builds log BUILD_ID --stream
```

**Benefits:**
- No local Docker setup required
- Automatic authentication to Artifact Registry
- Build logs stored in Cloud Logging
- Can trigger automatically on git push (configure Cloud Build triggers)

### Option 3: Local Docker Build

For local testing and development:

```bash
# Build image (BuildKit must be disabled due to npm bug)
DOCKER_BUILDKIT=0 docker build \
  --platform=linux/amd64 \
  --build-arg COMMIT_SHA=$(git rev-parse --short HEAD) \
  --build-arg BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
  -t vehicle-tracker:local \
  .

# Test locally
docker run -d -p 8080:8080 --name test-tracker vehicle-tracker:local

# Verify health
curl http://localhost:8080/health

# Check logs
docker logs test-tracker

# Clean up
docker stop test-tracker && docker rm test-tracker
```

**Why `DOCKER_BUILDKIT=0`?**  
npm has a known "Exit handler never called!" bug in Docker BuildKit that prevents reliable dependency installation. Cloud Build doesn't use BuildKit, so this workaround is only needed for local builds.

## Image Validation

Always validate images before deploying to production:

### Check Layer Structure

```bash
# View number of layers (should be > 0, typically ~10)
docker image inspect IMAGE_NAME | jq -r '.[0].RootFS.Layers | length'

# View full RootFS structure
docker image inspect IMAGE_NAME | jq -r '.[0].RootFS'
```

**Expected Output:**
```json
{
  "Type": "layers",
  "Layers": [
    "sha256:...",
    "sha256:...",
    ...
  ]
}
```

If layer count is 0 or RootFS is empty, the image is malformed.

### Test Container Functionality

```bash
# Start container
docker run -d -p 8080:8080 --name test IMAGE_NAME

# Health check
curl http://localhost:8080/health
# Expected: "healthy"

# API status
curl http://localhost:8080/api/status | jq
# Expected: JSON with version, buildTime, etc.

# Clean up
docker stop test && docker rm test
```

## Deploying to Cloud Run

### Prerequisites

1. **Artifact Registry Repository**: Must exist
   ```bash
   gcloud artifacts repositories create vehicle-in-need \
     --repository-format=docker \
     --location=us-west1 \
     --description="Vehicle Order Tracker container images"
   ```

2. **IAM Permissions**: Service account needs:
   - `roles/artifactregistry.writer` (to push images)
   - `roles/run.admin` (to deploy to Cloud Run)
   - `roles/iam.serviceAccountUser` (to act as Cloud Run service account)

### Deploy from Artifact Registry

After building and pushing an image:

```bash
# Deploy specific version (recommended)
gcloud run deploy pre-order-dealer-exchange-tracker \
  --image us-west1-docker.pkg.dev/gen-lang-client-0615287333/vehicle-in-need/pre-order-dealer-exchange-tracker:COMMIT_SHA \
  --region us-west1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars NODE_ENV=production,APP_VERSION=COMMIT_SHA,BUILD_TIME=2025-01-01T00:00:00Z

# Or deploy latest (use with caution in production)
gcloud run deploy pre-order-dealer-exchange-tracker \
  --image us-west1-docker.pkg.dev/gen-lang-client-0615287333/vehicle-in-need/pre-order-dealer-exchange-tracker:latest \
  --region us-west1 \
  --platform managed \
  --allow-unauthenticated
```

### Deploy Using Cloud Build (One Command)

The `cloudbuild.yaml` handles build, push, AND deployment:

```bash
gcloud builds submit --config cloudbuild.yaml
```

This is the simplest production deployment method.

### Verify Deployment

```bash
# Get service URL
SERVICE_URL=$(gcloud run services describe pre-order-dealer-exchange-tracker \
  --region us-west1 \
  --format='value(status.url)')

# Test health
curl $SERVICE_URL/health

# Check version
curl $SERVICE_URL/api/status | jq '.version, .buildTime'

# View current revision
gcloud run revisions list \
  --service=pre-order-dealer-exchange-tracker \
  --region=us-west1 \
  --limit=5
```

## Rollback Procedure

If a deployment fails or has issues:

### 1. List Recent Revisions

```bash
gcloud run revisions list \
  --service=pre-order-dealer-exchange-tracker \
  --region=us-west1 \
  --format='table(name,creationTimestamp,status.conditions[0].status)'
```

### 2. Route Traffic to Previous Revision

```bash
# Route 100% traffic to specific revision
gcloud run services update-traffic pre-order-dealer-exchange-tracker \
  --region=us-west1 \
  --to-revisions=REVISION_NAME=100
```

### 3. Verify Rollback

```bash
# Check traffic split
gcloud run services describe pre-order-dealer-exchange-tracker \
  --region=us-west1 \
  --format='table(status.traffic.revisionName,status.traffic.percent)'

# Test service
curl $SERVICE_URL/api/status
```

### 4. Delete Bad Revision (Optional)

```bash
gcloud run revisions delete REVISION_NAME \
  --region=us-west1 \
  --quiet
```

## Troubleshooting

### Issue: Image layer/diff_ids mismatch

**Symptoms:**
- Error: "got X Manifest.Layers vs Y ConfigFile.RootFS.DiffIDs"
- Cloud Run deployment fails with image validation error

**Cause:**
- Using `gcloud run deploy --source` (buildpacks)
- Malformed image from cloud-run-source-deploy registry

**Solution:**
1. Build from Dockerfile (this repo's approach)
2. Validate image structure before deploying
3. Use stable Artifact Registry location

### Issue: npm "Exit handler never called!" error

**Symptoms:**
- Local Docker build fails during `npm ci`
- vite not found after npm install

**Cause:**
- npm bug in Docker BuildKit

**Solution:**
```bash
# Build with BuildKit disabled
DOCKER_BUILDKIT=0 docker build ...
```

Cloud Build doesn't use BuildKit, so this only affects local builds.

### Issue: Container fails health check

**Symptoms:**
- Cloud Run shows "Container failed to start"
- Health endpoint not responding

**Checklist:**
1. Verify server binds to `0.0.0.0:${PORT}` (not `localhost`)
2. Check `server/index.cjs` for correct PORT env var usage
3. Verify dist/ files copied to image correctly
4. Check container logs: `docker logs CONTAINER_NAME`

### Issue: Secrets not available in Cloud Run

**Symptoms:**
- API errors related to missing credentials
- Vertex AI authentication failures

**Solution:**
```bash
# Mount secret from Secret Manager
gcloud run deploy pre-order-dealer-exchange-tracker \
  --update-secrets=API_KEY=vehicle-in-need-gemini:latest \
  --region=us-west1
```

See `cloudbuild.yaml` for example.

## Best Practices

### Tagging Strategy

- **`:latest`**: Always points to most recent main branch build
- **`:COMMIT_SHA`**: Immutable tag for specific version
- **Recommendation**: Deploy using commit SHA tags for traceability

### Image Lifecycle

```bash
# List images
gcloud artifacts docker images list \
  us-west1-docker.pkg.dev/gen-lang-client-0615287333/vehicle-in-need/pre-order-dealer-exchange-tracker

# Delete old images (keep last 10)
# Note: Use with caution, ensure no active deployments reference these tags
gcloud artifacts docker images delete IMAGE_DIGEST --quiet
```

### Security

1. **No secrets in Dockerfile** ✅ (already enforced)
2. **Use Secret Manager** for API keys ✅ (configured in cloudbuild.yaml)
3. **Scan images** for vulnerabilities (consider adding Artifact Analysis)
4. **Principle of least privilege** for service accounts

### Monitoring

```bash
# View Cloud Run logs
gcloud logging read "resource.type=cloud_run_revision" \
  --limit=50 \
  --format=json

# Real-time logs
gcloud logging tail "resource.type=cloud_run_revision"

# Metrics in Cloud Console
# Navigate to: Cloud Run → Service → Metrics tab
```

## Related Documentation

- [DOCKER_BUILD_NOTES.md](./DOCKER_BUILD_NOTES.md) - Detailed build notes and troubleshooting
- [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md) - Comprehensive deployment checklist
- [cloudbuild.yaml](./cloudbuild.yaml) - Cloud Build configuration
- [.github/workflows/build-and-deploy.yml](./.github/workflows/build-and-deploy.yml) - GitHub Actions workflow

## Support

For issues or questions:
1. Check troubleshooting section above
2. Review [GitHub Issues](https://github.com/PriorityLexusVB/vehicle-in-need/issues)
3. Consult Cloud Run documentation: https://cloud.google.com/run/docs
