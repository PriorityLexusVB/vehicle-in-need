# Docker Build Notes

## Local Docker Build Issues

If you encounter the following error when building the Docker image locally:

```
npm error Exit handler never called!
npm error This is an error with npm itself. Please report this error at:
npm error   <https://github.com/npm/cli/issues>
```

This is a known npm bug that occurs in certain Docker environments. However, **this issue does NOT occur in Cloud Build**, which is where the production builds happen.

## Recommended Build Methods

### 1. Cloud Build (Recommended for Production)

Use the provided `cloudbuild.yaml` configuration:

```bash
gcloud builds submit --config cloudbuild.yaml
```

Or trigger from Git:
```bash
git push origin main  # If you have Cloud Build triggers configured
```

### 2. Cloud Buildpacks (Alternative)

If using Cloud Buildpacks without Docker:

```bash
gcloud run deploy pre-order-dealer-exchange-tracker \
  --source . \
  --region us-west1
```

The `gcp-build` script in `package.json` will handle the build.

### 3. Local Testing

For local development and testing:

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

Then visit http://localhost:8080

## Why Cloud Build Works

Cloud Build uses a different environment and npm version that doesn't trigger the "Exit handler never called!" bug. The Dockerfile is designed to work correctly in Cloud Build, which is the intended production build environment.

## Verifying Production Build

To verify the production build serves correctly:

1. Build locally: `npm run build`
2. Start server: `npm start`
3. Visit http://localhost:8080
4. Check for:
   - No Tailwind CDN in page source
   - No `/index.tsx` references
   - Hashed asset filenames (e.g., `/assets/index-abc123.js`)
   - Admin UI visible for manager accounts
   - Console logs showing App Version and Build Time
