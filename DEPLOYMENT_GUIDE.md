# Deployment Guide

This is the single source of truth for deploying the Pre-Order & Dealer Exchange Tracker application to Google Cloud Run.

## Prerequisites

- **Google Cloud Project**: `gen-lang-client-0615287333`
- **Service Name**: `pre-order-dealer-exchange-tracker`
- **Region**: `us-west1`
- **Artifact Registry**: `us-west1-docker.pkg.dev/gen-lang-client-0615287333/vehicle-in-need`

## Build System Status

✅ **All systems operational:**
- Tailwind CSS compiles correctly
- PostCSS processes styles properly
- Vite build generates optimized bundles
- CSS verification scripts pass
- Dockerfile validates CSS presence

## Deployment Methods

### Method 1: Cloud Build Trigger (Recommended)

The repository has a Cloud Build trigger named `vehicle-in-need-deploy` that automatically builds and deploys on commits to `main`.

**Trigger Configuration:**
```yaml
substitutions:
  _REGION: us-west1
  _SERVICE: pre-order-dealer-exchange-tracker
```

**Note**: Do NOT add `SERVICE_URL` or `_SERVICE_URL` - it's dynamically retrieved at runtime.

### Method 2: Manual Cloud Build (from Git Repository)

**Important**: All deployments must be traceable to git commits. Do NOT use arbitrary version strings.

```bash
cd /path/to/vehicle-in-need

# Get the current commit SHA (must be a real commit in the repository)
SHORT_SHA=$(git rev-parse --short HEAD)

# Ensure you're on the main branch or a tracked branch
git branch --show-current

gcloud builds submit \
  --config=cloudbuild.yaml \
  --substitutions=_REGION=us-west1,_SERVICE=pre-order-dealer-exchange-tracker,SHORT_SHA=$SHORT_SHA
```

**Note**: The SHORT_SHA must be a valid git commit SHA. Manual version strings like `manual-20241120` are blocked to ensure deployment traceability.

### Method 3: Local Docker Build + Deploy

```bash
# Build
docker build \
  --build-arg COMMIT_SHA=$(git rev-parse --short HEAD) \
  --build-arg BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ") \
  -t us-west1-docker.pkg.dev/gen-lang-client-0615287333/vehicle-in-need/pre-order-dealer-exchange-tracker:latest \
  .

# Push
docker push us-west1-docker.pkg.dev/gen-lang-client-0615287333/vehicle-in-need/pre-order-dealer-exchange-tracker:latest

# Deploy
gcloud run deploy pre-order-dealer-exchange-tracker \
  --image=us-west1-docker.pkg.dev/gen-lang-client-0615287333/vehicle-in-need/pre-order-dealer-exchange-tracker:latest \
  --region=us-west1 \
  --platform=managed \
  --allow-unauthenticated \
  --service-account=pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com \
  --set-env-vars=NODE_ENV=production \
  --update-secrets=API_KEY=vehicle-in-need-gemini:latest
```

## Verification

### 1. Build Verification

```bash
npm ci
npm run build
```

Expected output:
- ✅ CSS file generated in `dist/assets/`
- ✅ CSS referenced in `dist/index.html`
- ✅ Tailwind utility classes present in CSS

### 2. Deployment Verification

After deployment, run:

```bash
npm run verify:css
```

Or manually check:
```bash
SERVICE_URL="https://pre-order-dealer-exchange-tracker-842946218691.us-west1.run.app"
curl -sS "$SERVICE_URL/" | grep -o 'href="/assets/[^"]*\.css"'
```

### 3. Browser Verification

1. Open: https://pre-order-dealer-exchange-tracker-842946218691.us-west1.run.app
2. Open DevTools → Network tab
3. Clear cache and hard reload (Ctrl+Shift+R / Cmd+Shift+R)
4. Verify CSS file loads (look for `/assets/index-*.css`)
5. Check Elements tab for Tailwind classes being applied

## Cache Busting

The application includes service worker cleanup that runs on page load:
- Unregisters legacy service workers
- Forces reload after cleanup (one-time)
- Uses session storage to prevent infinite reload loops

If styles don't appear:
1. Clear browser cache
2. Hard reload (Ctrl+Shift+R)
3. Check DevTools Console for service worker messages

## Troubleshooting

### CSS Not Appearing in Browser

**Symptoms**: Application loads but appears unstyled

**Solutions**:
1. **Clear Service Worker**:
   - DevTools → Application → Service Workers → Unregister all
   - Hard reload

2. **Verify CSS in Build**:
   ```bash
   npm run build
   ls -lh dist/assets/*.css
   ```

3. **Check Production**:
   ```bash
   curl https://pre-order-dealer-exchange-tracker-842946218691.us-west1.run.app/ | grep stylesheet
   ```

### Cloud Build Trigger Fails

**Common Issues**:

1. **"SERVICE_URL is not a valid built-in substitution"**
   - Remove `SERVICE_URL` from trigger substitutions
   - See `cloudbuild.yaml` comments for details

2. **CSS Verification Fails**
   - Check Dockerfile build logs
   - Ensure `npm run build` completes successfully
   - Verify `tailwind.config.js` content paths include all components

### Build Locally Works, Production Doesn't

1. **Confirm deployed version**:
   ```bash
   curl https://pre-order-dealer-exchange-tracker-842946218691.us-west1.run.app/ | grep 'data-commit'
   ```

2. **Check Cloud Build logs** for the deployment
3. **Verify Docker image** was pushed and deployed
4. **Test direct container**:
   ```bash
   docker run -p 8080:8080 \
     us-west1-docker.pkg.dev/gen-lang-client-0615287333/vehicle-in-need/pre-order-dealer-exchange-tracker:latest
   ```

## Service Accounts & IAM

### Cloud Build Service Account

`cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com`

Required roles:
- `roles/run.admin` - Deploy Cloud Run services
- `roles/iam.serviceAccountUser` - Act as runtime service account
- `roles/artifactregistry.writer` - Push container images

### Cloud Run Runtime Service Account

`pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com`

Required roles:
- `roles/logging.logWriter` - Write logs
- `roles/secretmanager.secretAccessor` - Access API keys

## Architecture

### Build Pipeline

```
Source Code
    ↓
npm run build (Vite + Tailwind)
    ↓
Docker Build (node:20-alpine)
    ├─ CSS Verification
    └─ Multi-stage build
    ↓
Artifact Registry
    ↓
Cloud Run Deployment
    ↓
CSS Verification (live)
```

### Key Files

- `tailwind.config.js` - Tailwind content paths and theme
- `postcss.config.js` - PostCSS with Tailwind plugin
- `vite.config.ts` - Vite build configuration
- `src/index.css` - Tailwind directives
- `Dockerfile` - Multi-stage container build with CSS validation
- `cloudbuild.yaml` - Cloud Build pipeline with verification
- `scripts/verify-css-in-build.sh` - Post-build CSS validation

## Success Criteria

A successful deployment has:

✅ Build completes without errors
✅ CSS file generated (~10KB with Tailwind utilities)
✅ CSS linked in HTML
✅ Dockerfile CSS verification passes
✅ Cloud Build CSS verification passes
✅ Application loads with styles in browser
✅ No console errors related to missing stylesheets

## Additional Resources

- **Cloud Build Logs**: https://console.cloud.google.com/cloud-build/builds
- **Cloud Run Service**: https://console.cloud.google.com/run/detail/us-west1/pre-order-dealer-exchange-tracker
- **Artifact Registry**: https://console.cloud.google.com/artifacts/docker/gen-lang-client-0615287333/us-west1/vehicle-in-need
- **Production App**: https://pre-order-dealer-exchange-tracker-842946218691.us-west1.run.app
