# Container Image Build and Deployment Issues

**Note**: This is a template for creating a GitHub issue. Copy the content below to create the issue.

---

## Problem Summary

Cloud Run deployment is failing due to a corrupted container image in the ephemeral `cloud-run-source-deploy` registry path.

## Error Message

```
ERROR: (gcloud.run.deploy) Container import failed: failed to fetch metadata from the registry for image 
"us-west1-docker.pkg.dev/gen-lang-client-0615287333/cloud-run-source-deploy/vehicle-in-need/
pre-order-dealer-exchange-tracker@sha256:ef4ee520c841748b96f7a31f8df10b9f63b84d38b02213f4e84a117d0214281b"

Details: got 1 Manifest.Layers vs 0 ConfigFile.RootFS.DiffIDs
```

## Root Cause

The container image has an invalid OCI structure:
- **Manifest**: Reports 1 layer
- **Config**: Reports 0 diff_ids
- **Location**: Ephemeral `cloud-run-source-deploy` registry (not recommended for production)

This corruption likely occurred when using `gcloud run deploy --source` which:
1. Uses Cloud Buildpacks to automatically containerize
2. Creates images in an ephemeral registry location
3. Can produce malformed OCI images with structural inconsistencies

## Impact

- Cloud Run deployment fails at revision creation
- Unable to deploy new versions of the application
- Production service may be using an outdated image

## Solution

### Immediate Fix

1. **Rebuild the image using Cloud Build**:
   ```bash
   gcloud builds submit --config cloudbuild.yaml
   ```

2. **Deploy using the proper Artifact Registry path**:
   ```bash
   gcloud run deploy pre-order-dealer-exchange-tracker \
     --image us-west1-docker.pkg.dev/gen-lang-client-0615287333/vehicle-in-need/pre-order-dealer-exchange-tracker:COMMIT_SHA \
     --region us-west1 \
     --platform managed \
     --allow-unauthenticated \
     --set-env-vars=NODE_ENV=production,APP_VERSION=COMMIT_SHA \
     --update-secrets=API_KEY=vehicle-in-need-gemini:latest
   ```

### Long-term Prevention

1. **Never use `gcloud run deploy --source`** for production deployments
2. **Always build via Cloud Build** using `cloudbuild.yaml`
3. **Use explicit `--image` flag** with stable Artifact Registry path
4. **Validate images after building**:
   ```bash
   docker inspect IMAGE_NAME | jq '.[0].RootFS.Layers | length'
   # Should return a number > 0
   ```
5. **Tag images with commit SHA** for traceability and rollback capability

## Related Issues

- IAM permission issue was resolved in PR #72 (granting `roles/iam.serviceAccountUser` and `roles/run.admin`)
- Local Docker builds may encounter npm "Exit handler never called!" bug (documented in DOCKER_BUILD_NOTES.md)
  - This is a known npm issue in Docker environments
  - Does not affect Cloud Build
  - Use Cloud Build for production container builds

## Documentation

Comprehensive documentation has been added in:
- `CONTAINER_IMAGE_ISSUES.md` - Full diagnosis and solutions
- `DOCKER_BUILD_NOTES.md` - Build instructions and troubleshooting
- `Dockerfile` - Updated with warnings about local build limitations

## Validation Steps

After rebuilding the image, verify:

1. **Image exists in correct registry**:
   ```bash
   gcloud artifacts docker images list \
     us-west1-docker.pkg.dev/gen-lang-client-0615287333/vehicle-in-need/pre-order-dealer-exchange-tracker
   ```

2. **Image has valid structure**:
   ```bash
   docker pull IMAGE_PATH
   docker inspect IMAGE_PATH | jq '.[0].RootFS.Layers'
   # Should show array of layer digests (not empty)
   ```

3. **Deployment succeeds**:
   ```bash
   gcloud run services describe pre-order-dealer-exchange-tracker \
     --region us-west1 \
     --format='yaml(status.latestReadyRevisionName,status.url)'
   ```

4. **Health check passes**:
   ```bash
   curl https://SERVICE_URL/health
   # Should return "healthy"
   ```

## Additional Context

- **Project**: gen-lang-client-0615287333
- **Service**: pre-order-dealer-exchange-tracker
- **Region**: us-west1
- **Artifact Registry**: `us-west1-docker.pkg.dev/gen-lang-client-0615287333/vehicle-in-need`
- **Related PRs**: #72, #67, #68, #70

## Suggested Labels

- `bug` - Image corruption prevents deployment
- `deployment` - Affects Cloud Run deployment process
- `infrastructure` - Related to container build infrastructure
- `documentation` - Comprehensive docs added
