# Docker Build Notes

## Building the Container Image

The Dockerfile uses a multi-stage build to produce deterministic, valid OCI images compatible with Cloud Run.

### Recommended Build Methods

#### 1. Cloud Build (Recommended for Production)

Use the provided `cloudbuild.yaml` configuration:

```bash
gcloud builds submit --config cloudbuild.yaml
```

Cloud Build automatically handles all build complexities and publishes to Artifact Registry.

#### 2. Local Docker Build

**Important**: Due to a known npm bug with Docker BuildKit, local builds must disable BuildKit:

```bash
# Build with BuildKit disabled
DOCKER_BUILDKIT=0 docker build \
  --platform=linux/amd64 \
  --build-arg COMMIT_SHA=$(git rev-parse --short HEAD) \
  --build-arg BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
  -t vehicle-tracker:local \
  .
```

**Why disable BuildKit?** npm has an "Exit handler never called!" bug in BuildKit that prevents dependencies from installing correctly. This is a known npm issue that occurs in certain Docker environments.

#### 3. GitHub Actions (Automated CI/CD)

The repository includes `.github/workflows/build-and-deploy.yml` which builds and pushes images to Artifact Registry on push to main.

#### 4. Cloud Buildpacks (Alternative)

If using Cloud Buildpacks without Docker:

```bash
gcloud run deploy pre-order-dealer-exchange-tracker \
  --source . \
  --region us-west1
```

**Note**: This method previously created malformed images with layer/diff_ids mismatches. Using the Dockerfile approach is strongly recommended.

## Validating the Build

### Check Image Structure

Verify the image has valid layer structure:

```bash
# Check number of layers
docker image inspect vehicle-tracker:local | jq -r '.[0].RootFS.Layers | length'

# Verify RootFS structure
docker image inspect vehicle-tracker:local | jq -r '.[0].RootFS'
```

A valid image should have matching layer counts (typically 10 layers for this application).

### Test the Container

```bash
# Run container locally
docker run -d -p 8080:8080 --name test-tracker vehicle-tracker:local

# Test health endpoint
curl http://localhost:8080/health
# Expected output: healthy

# Test API status
curl http://localhost:8080/api/status | jq

# Clean up
docker stop test-tracker && docker rm test-tracker
```

## What Changed from Previous Versions

1. **Base Image**: Changed from `node:20-alpine` to `node:20-slim`
   - Fixes npm installation reliability issues
   - Slightly larger image (~100MB difference) but guaranteed to work

2. **Health Check**: Uses Node.js HTTP module instead of wget
   - No need to install additional packages
   - More lightweight and reliable

3. **Build Process**: Simplified error handling
   - Removes complex workarounds for Alpine issues
   - Clearer failure modes

## Troubleshooting

### Issue: "vite not found" during build

**Cause**: BuildKit enabled when building locally

**Fix**: Disable BuildKit with `DOCKER_BUILDKIT=0` environment variable

### Issue: "Exit handler never called!" error

**Cause**: Known npm bug in Docker BuildKit

**Fix**: This error can be safely ignored if using `DOCKER_BUILDKIT=0`. The workaround in the Dockerfile ensures dependencies are still installed correctly.

### Issue: Health check failing

**Cause**: Server may not be binding to all interfaces (0.0.0.0)

**Fix**: Verify `server/index.cjs` binds to `0.0.0.0` (already configured correctly in this repo)
