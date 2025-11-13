<!-- markdownlint-disable MD013 -->
<!-- Long lines intentional for code examples and command demonstrations -->

# Docker Build Notes

## Cloud Run Deployment Fix

**Issue**: Previous Cloud Run deployment failed with error:
```
got 1 Manifest.Layers vs 0 ConfigFile.RootFS.DiffIDs
```

**Root Cause**: The ephemeral source deploy pipeline created a structurally invalid OCI image with mismatched manifest layers and config diff_ids.

**Solution**: Build container images using Google Cloud Build with the standard Docker builder, which produces valid OCI images. The GitHub Actions workflow `.github/workflows/build-and-deploy.yml` automates this process.

## Recommended Build Methods

### 1. GitHub Actions (Automated CI/CD)

The primary build pipeline is automated via GitHub Actions:

- **Push to main branch**: Automatically builds and pushes image to Artifact Registry
- **Pull requests**: Validates build configuration only (no push)
- **Manual deployment**: Use workflow_dispatch with `deploy: true` to deploy after build

Image location:
```
us-west1-docker.pkg.dev/gen-lang-client-0615287333/vehicle-in-need/pre-order-dealer-exchange-tracker:<sha>
```

### 2. Cloud Build (Manual)

Use the provided `cloudbuild.yaml` configuration:

```bash
gcloud builds submit --config cloudbuild.yaml
```

This will:
1. Check for merge conflict markers
2. Build the Docker image with proper build args
3. Push to Artifact Registry with SHA tag and `latest` tag
4. Optionally deploy to Cloud Run

### 3. Manual Deployment

After a successful build, deploy using:

```bash
gcloud run deploy pre-order-dealer-exchange-tracker \
  --image=us-west1-docker.pkg.dev/gen-lang-client-0615287333/vehicle-in-need/pre-order-dealer-exchange-tracker:<SHA> \
  --region=us-west1 \
  --platform=managed \
  --allow-unauthenticated \
  --set-env-vars=NODE_ENV=production,APP_VERSION=<SHA> \
  --update-secrets=API_KEY=vehicle-in-need-gemini:latest
```

Replace `<SHA>` with the git commit SHA from the build.

## Local Docker Build Issues

If you encounter the following error when building the Docker image locally:

```text
npm error Exit handler never called!
npm error This is an error with npm itself. Please report this error at:
npm error   <https://github.com/npm/cli/issues>
```

This is a known npm bug in certain Docker environments (Alpine Linux, some Debian versions). **This issue does NOT occur in Cloud Build**, which is where production builds happen.

### Why Cloud Build Works

Cloud Build uses a different environment and npm version that doesn't trigger the "Exit handler never called!" bug. The Dockerfile is designed to work correctly in Cloud Build, which is the intended production build environment.

## Local Testing (Without Docker)

For local development and testing, use these commands instead of Docker:

```bash
# Install dependencies
npm install

# Run Vite dev server
npm run dev

# Build for production
npm run build

# Test production build locally
npm start
```

Then visit <http://localhost:8080>

## Validating Image Structure

To verify an image has proper OCI structure:

```bash
# Pull image
docker pull us-west1-docker.pkg.dev/gen-lang-client-0615287333/vehicle-in-need/pre-order-dealer-exchange-tracker:<SHA>

# Inspect structure
docker inspect us-west1-docker.pkg.dev/gen-lang-client-0615287333/vehicle-in-need/pre-order-dealer-exchange-tracker:<SHA> | jq '.[0].RootFS.Layers'
```

The output should show an array of layer digests. If the array is empty or the count doesn't match the manifest, the image is invalid.

## Verifying Production Build

To verify the production build serves correctly:

1. Build locally: `npm run build`
2. Start server: `npm start`
3. Visit <http://localhost:8080>
4. Check for:
   - No Tailwind CDN in page source
   - No `/index.tsx` references
   - Hashed asset filenames (e.g., `/assets/index-abc123.js`)
   - Admin UI visible for manager accounts
   - Console logs showing App Version and Build Time

## Troubleshooting

### Image has 0 layers or diff_ids mismatch

**Symptom**: Cloud Run deployment fails with layer/diff_ids error

**Solution**: 
1. Don't use `gcloud run deploy --source` (creates ephemeral images)
2. Always build via Cloud Build (`cloudbuild.yaml`) or GitHub Actions workflow
3. Deploy using explicit `--image` flag with Artifact Registry path

### Build succeeds but deployment fails

**Check**:
1. Verify image exists in Artifact Registry: `gcloud artifacts docker images list us-west1-docker.pkg.dev/gen-lang-client-0615287333/vehicle-in-need`
2. Inspect image structure: `docker inspect <image>` 
3. Check Cloud Run logs for startup errors

### Need to rollback deployment

List previous revisions:
```bash
gcloud run revisions list --service=pre-order-dealer-exchange-tracker --region=us-west1
```

Roll back to previous revision:
```bash
gcloud run services update-traffic pre-order-dealer-exchange-tracker \
  --region=us-west1 \
  --to-revisions=<REVISION_NAME>=100
```
