# Container Image Issues and Solutions

## ⚠️ CRITICAL: DO NOT USE `gcloud run deploy --source`

**This service MUST be deployed using pre-built Docker images from Artifact Registry.**

Using `gcloud run deploy --source` creates corrupted images in the ephemeral `cloud-run-source-deploy` registry with mismatched OCI metadata, causing deployment failures.

### Correct Deployment Process

1. **Build via Cloud Build** (automated in GitHub Actions or manual):

   ```bash
   gcloud builds submit --config cloudbuild.yaml
   ```

2. **Deploy using explicit image reference**:

   ```bash
   gcloud run deploy pre-order-dealer-exchange-tracker \
     --image us-west1-docker.pkg.dev/gen-lang-client-0615287333/vehicle-in-need/pre-order-dealer-exchange-tracker:$SHORT_SHA \
     --region us-west1 \
     --platform managed \
     --allow-unauthenticated \
     --set-env-vars=NODE_ENV=production,APP_VERSION=$SHORT_SHA \
     --update-secrets=API_KEY=vehicle-in-need-gemini:latest
   ```

Replace `$SHORT_SHA` with the actual git commit SHA from your build.

**See [CLOUD_RUN_DEPLOYMENT_RUNBOOK.md](./CLOUD_RUN_DEPLOYMENT_RUNBOOK.md) for complete deployment instructions.**

---

## Issue Summary

This document describes the container image issues discovered during Cloud Run deployment and their solutions.

## Issue 1: IAM Permission Denied (RESOLVED)

### Error

```text
PERMISSION_DENIED: Permission 'iam.serviceaccounts.actAs' denied on service account 
pre-order-dealer-exchange--860@gen-lang-client-0615287333.iam.gserviceaccount.com
```

### Root Cause

The Cloud Build deployer service account (`cloud-build-deployer@...`) lacked permission to impersonate the runtime service account.

### Solution (Applied in PR #72)

1. Granted `roles/iam.serviceAccountUser` on the runtime service account
2. Granted `roles/run.admin` at project level to cloud-build-deployer

### Status

✅ **RESOLVED** - IAM permissions have been correctly configured.

---

## Issue 2: Container Image Metadata Error (ACTIVE)

### Error (Issue 2)

```text
ERROR: (gcloud.run.deploy) Container import failed: failed to fetch metadata from the registry for image 
"us-west1-docker.pkg.dev/gen-lang-client-0615287333/cloud-run-source-deploy/vehicle-in-need/
pre-order-dealer-exchange-tracker@sha256:ef4ee520c841748b96f7a31f8df10b9f63b84d38b02213f4e84a117d0214281b"

Details: got 1 Manifest.Layers vs 0 ConfigFile.RootFS.DiffIDs
```

### Root Cause (Issue 2)

The image in the `cloud-run-source-deploy` registry path is corrupted with mismatched OCI image structure:

- Manifest reports 1 layer
- Config reports 0 diff_ids
- This indicates the image was not built properly

### Analysis

1. **Source Deploy Issue**: The image was likely created using `gcloud run deploy --source` which uses Cloud Buildpacks
2. **Ephemeral Registry**: The `cloud-run-source-deploy` path is an ephemeral location, not recommended for production
3. **Build Method**: Need to use proper Docker build process via `cloudbuild.yaml` or GitHub Actions

### Solution

**DO NOT use the corrupted image**. Instead:

1. **Build via Cloud Build** (Recommended):

   ```bash
   gcloud builds submit --config cloudbuild.yaml
   ```

2. **Deploy using proper Artifact Registry path**:

   ```bash
   gcloud run deploy pre-order-dealer-exchange-tracker \
     --image us-west1-docker.pkg.dev/gen-lang-client-0615287333/vehicle-in-need/pre-order-dealer-exchange-tracker:COMMIT_SHA \
     --region us-west1 \
     --platform managed \
     --allow-unauthenticated \
     --set-env-vars=NODE_ENV=production,APP_VERSION=COMMIT_SHA \
     --update-secrets=API_KEY=vehicle-in-need-gemini:latest
   ```
### Status (Issue 2)

⚠️ **ACTIVE** - Awaiting new build from Cloud Build to replace corrupted image.

---

## Issue 3: Local Docker Build Fails (npm Bug)

### Error (Issue 3)

```text
npm error Exit handler never called!
npm error This is an error with npm itself. Please report this error at:
npm error   <https://github.com/npm/cli/issues>
```

### Root Cause (Issue 3)

This is a known npm bug that occurs in Docker environments, particularly with:

- Node Alpine images  
- Node Slim images
- Local Docker builds
- Both `npm ci` and `npm install` commands

The bug causes npm to crash before completing dependency installation, even though it may report success.

### Why It Doesn't Affect Cloud Build

Cloud Build uses a different execution environment with different npm versions and configurations that don't trigger this bug.

### Solution for Development

**Do NOT attempt local Docker builds for production.**

Instead, use these methods:

1. **Local Development** (without Docker):

   ```bash
   npm install
   npm run dev      # Development server
   npm run build    # Production build
   npm start        # Test production build locally
   ```

2. **Production Builds** (Cloud Build):

   ```bash
   gcloud builds submit --config cloudbuild.yaml
   ```

3. **CI/CD** (GitHub Actions):
   - Push to main branch
   - Workflow automatically builds via Cloud Build API
   - Validates image structure
   - Pushes to Artifact Registry

### Status (Issue 3)

📝 **DOCUMENTED** - This is expected behavior. Use Cloud Build for container builds.

---

## Dockerfile Multi-Stage Build Review

### Current Structure

The Dockerfile uses a multi-stage build:

**Stage 1: Builder**

```dockerfile
FROM node:20-alpine AS builder
- Install all dependencies (including devDependencies)
- Copy source code
- Run conflict marker check (prebuild)
- Run vite build
```

**Stage 2: Runtime**

```dockerfile
FROM node:20-alpine
- Install production dependencies only (--omit=dev)
- Copy server code
- Copy built assets from Stage 1
- Configure health check
- Start Node.js server
```

### Build Process Validation

The multi-stage build is correctly structured:

1. ✅ Separate build and runtime stages
2. ✅ Proper dependency separation (dev vs prod)
3. ✅ Conflict marker checking before build
4. ✅ Health check configured
5. ✅ Build args for version info

### Issues Found

1. ❌ Local builds fail due to npm bug (documented above)
2. ✅ Cloud Build works correctly
3. ✅ Multi-stage structure produces valid OCI images when built in Cloud Build

---

## cloudbuild.yaml Review

### Current Configuration

```yaml
steps:
  1. check-conflicts    - Validates no merge conflict markers in code
  2. build-image        - Builds Docker image with commit SHA
  3. push-image         - Pushes to Artifact Registry with SHA tag
  4. push-latest        - Pushes latest tag
  5. deploy-cloud-run   - Deploys to Cloud Run with secrets
```

### Validation

✅ **CORRECT** - The cloudbuild.yaml is properly configured:

- Validates source code before building
- Builds with proper build args
- Tags with both SHA and latest
- Deploys with environment variables and secrets
- Uses correct Artifact Registry path

### Status (Dockerfile Review)

✅ **VALIDATED** - No changes needed to cloudbuild.yaml

---

## Recommended Actions

### Immediate Actions

1. **Clean and Rebuild Image**

   ```bash
   # From local machine or Cloud Shell
   cd /path/to/vehicle-in-need
   gcloud builds submit --config cloudbuild.yaml
   ```

2. **Verify Image Structure**

   ```bash
   # Pull the newly built image
   docker pull us-west1-docker.pkg.dev/gen-lang-client-0615287333/vehicle-in-need/pre-order-dealer-exchange-tracker:latest
   
   # Inspect layers
   docker inspect us-west1-docker.pkg.dev/gen-lang-client-0615287333/vehicle-in-need/pre-order-dealer-exchange-tracker:latest \
     | jq '.[0].RootFS.Layers'
   
   # Should show an array of layer digests (not empty)
   ```

3. **Deploy New Image**

   ```bash
   gcloud run deploy pre-order-dealer-exchange-tracker \
     --image us-west1-docker.pkg.dev/gen-lang-client-0615287333/vehicle-in-need/pre-order-dealer-exchange-tracker:latest \
     --region us-west1 \
     --platform managed
   ```

### Documentation Updates

1. ✅ Updated DOCKER_BUILD_NOTES.md with npm bug information
2. ✅ Created CONTAINER_IMAGE_ISSUES.md (this document)
3. ⏳ Will create GitHub issue documenting the container image problem

### Prevention Measures

Going forward:

1. **Always use Cloud Build** for production container builds
2. **Never use `gcloud run deploy --source`** - always use explicit `--image` flag
3. **Validate images** after building (check layer count > 0)
4. **Use version tags** (commit SHA) for traceability
5. **Avoid `cloud-run-source-deploy` registry path** - use stable Artifact Registry location

---

## Additional Diagnostics

### Check Current Deployment Status

```bash
gcloud run services describe pre-order-dealer-exchange-tracker \
  --region us-west1 \
  --format='yaml(status.latestReadyRevisionName,status.url,status.traffic)'
```

### List Available Images

```bash
gcloud artifacts docker images list \
  us-west1-docker.pkg.dev/gen-lang-client-0615287333/vehicle-in-need/pre-order-dealer-exchange-tracker
```

### View Build History

```bash
gcloud builds list --limit=10
```

---

## Related Documentation

- [DOCKER_BUILD_NOTES.md](./DOCKER_BUILD_NOTES.md) - Build instructions and troubleshooting
- [CONTAINER_DEPLOYMENT_GUIDE.md](./CONTAINER_DEPLOYMENT_GUIDE.md) - Comprehensive deployment guide
- [cloudbuild.yaml](./cloudbuild.yaml) - Cloud Build configuration
- [Dockerfile](./Dockerfile) - Multi-stage container definition

---

## Summary

| Issue | Status | Solution |
|-------|--------|----------|
| IAM Permission Denied | ✅ Resolved | Granted appropriate IAM roles (PR #72) |
| Corrupted Image in cloud-run-source-deploy | ⚠️ Active | Rebuild using Cloud Build, deploy from correct registry |
| npm Bug in Local Docker Builds | 📝 Documented | Use Cloud Build for production; local dev without Docker |
| Dockerfile Multi-Stage Build | ✅ Validated | No changes needed |
| cloudbuild.yaml Configuration | ✅ Validated | No changes needed |

**Next Step**: Trigger Cloud Build to create a new, valid container image.
