<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Pre-Order & Dealer Exchange Tracker

A vehicle order tracking application for Priority Automotive with manager controls, user management, and AI-powered email generation.

View your app in AI Studio: https://ai.studio/apps/drive/1XrFhCIH0pgEmQ_DSYHkXD3TovOfqWFJu

## Features

- 🚗 Track vehicle pre-orders and dealer exchanges
- 👥 User management with role-based access control
- 📊 Dashboard with real-time statistics
- 🤖 **AI-powered email generation** via secure server-side Vertex AI integration
- 🔔 Service worker with automatic update notifications
- 🎨 Optimized Tailwind CSS (no CDN in production)
- 📱 Responsive design for mobile and desktop
- 🔗 Deep linking support (e.g., `#settings` for direct access)
- 🔒 **Secure architecture** with no client-side API keys

## Architecture

### AI Email Generation Flow

```
Browser → /api/generate-email → Express Server → Vertex AI (Gemini 2.0 Flash)
                                      ↓
                            Service Account IAM
                         (Vertex AI User role)
```

**Security improvements:**
- ✅ No API keys exposed in client bundle
- ✅ Uses Google Cloud Application Default Credentials (ADC)
- ✅ Service account with proper IAM roles (Vertex AI User)
- ✅ Server-side validation and error handling

The application is split into:
1. **Frontend (React + Vite)**: Static files served by Express
2. **Backend (Express + Node.js)**: Serves static files + API endpoints

### API Endpoints

- `GET /health` - Health check endpoint (returns "healthy")
- `GET /api/status` - Returns AI service status and version info
- `POST /api/generate-email` - Generate follow-up emails for customer orders

## Run Locally

**Prerequisites:** Node.js (v20 or higher recommended)

### Option 1: Development Mode (Frontend Only)

1. Install dependencies:
   ```bash
   npm install
   ```

2. For AI features, the application uses server-side Vertex AI integration:
   ```bash
   gcloud auth application-default login
   ```
   
   This authenticates your local development environment using Application Default Credentials (ADC). The server will automatically use these credentials when calling Vertex AI APIs.
   
   **Note:** No client-side API keys are required. AI features are accessed through the `/api/generate-email` endpoint which handles authentication server-side. This is more secure than exposing API keys in the client.

3. Run the frontend development server:
   ```bash
   npm run dev
   ```

4. Open your browser to `http://localhost:3000`

**Note:** In dev mode, API calls will fail unless you also run the backend server separately.

### Option 2: Full Stack (Frontend + Backend)

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build the frontend:
   ```bash
   npm run build
   ```

3. Run the server:
   ```bash
   npm run server
   ```

4. Open your browser to `http://localhost:8080`

This mode runs the full application with the Express server serving both static files and API endpoints.

## Build and Deploy

### Docker Build (Recommended for Production)

The application uses a multi-stage Dockerfile that builds the frontend and packages it with a Node.js server:

**Build the Docker image:**

```bash
docker build \
  --build-arg COMMIT_SHA=$(git rev-parse --short HEAD) \
  --build-arg BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ") \
  -t vehicle-tracker:latest .
```

**Note:** If you encounter an npm "Exit handler never called!" error when building locally, this is a [known npm bug](https://github.com/npm/cli/issues) in certain Docker environments. **The recommended approach is to build using Google Cloud Build** where this issue doesn't occur. For local testing, you can:
- Build the frontend with `npm run build` locally
- Run the server with `npm run server` to test the full stack
- Skip Docker build for local development

**Run the container locally (if Docker build succeeds):**

```bash
docker run -p 8080:8080 vehicle-tracker:latest
```

Then open http://localhost:8080 in your browser.

**Benefits of Docker build:**
- ✅ Deterministic builds with consistent Node 20 environment
- ✅ Proper cache control headers (no-cache for index.html, immutable for hashed assets)
- ✅ Version visibility via VersionBadge component in header
- ✅ Minimal production image size (Node 20 Alpine runtime)
- ✅ Built-in health check endpoint at `/health`
- ✅ Integrated Express server for static files + API

### Cloud Run Deployment

When deploying to Google Cloud Run:

1. **Ensure your service account has required roles:**
   - `Vertex AI User` - for calling Gemini models
   - `Service Account Token Creator` (if needed for service-to-service calls)

2. **Deploy with Cloud Build:**
   ```bash
   gcloud builds submit --config cloudbuild.yaml
   ```

3. **The container automatically:**
   - Uses the attached service account credentials (no API keys needed)
   - Serves both static files and API endpoints on port 8080
   - Provides health check at `/health` for Cloud Run

**Important:** No environment variables for API keys are needed. The application uses Application Default Credentials (ADC) which are automatically provided by the Cloud Run environment.

### Environment Variables (Optional)

See [.env.example](.env.example) for configuration options:

- `GOOGLE_CLOUD_PROJECT` - Auto-detected from environment (optional override)
- `VERTEX_AI_LOCATION` - Defaults to `us-central1` (optional)
- `PORT` - Server port, defaults to `8080` (optional)
- `LOCAL_GEMINI_KEY` - **Local dev only**, fallback API key (not recommended for production)

### Security: Removing Old API Keys

After verifying the server-side proxy works correctly:

1. **Navigate to Google Cloud Console** → APIs & Services → Credentials
2. **Locate the API keys** previously used for client-side Gemini access
3. **Delete unused API keys** to prevent potential exposure
4. **Keep only service account IAM roles** for production access

**What to delete:**
- ❌ Any API keys labeled for "Gemini API" or "Browser access"
- ❌ The `VITE_GEMINI_API_KEY` from GitHub Secrets (if present)

**What to keep:**
- ✅ Service account with "Vertex AI User" role attached to Cloud Run
- ✅ No API keys should be present in the final deployment

### Build for Production (npm)

```bash
npm run build
```

This creates an optimized production build in the `dist/` directory with:
- Compiled and minified JavaScript
- Optimized CSS (Tailwind utilities tree-shaken)
- Service worker for offline support and caching
- Web app manifest for PWA support
- Version information (git commit SHA + build time)
- **No client-side API keys** (removed from bundle)

### Build Output

```
dist/
├── index.html                    # Entry point (not cached long-term)
├── manifest.webmanifest          # PWA manifest
├── sw.js                         # Service worker
├── workbox-*.js                  # Workbox runtime
└── assets/
    ├── index-[hash].css          # Optimized CSS
    └── index-[hash].js           # Bundled JavaScript
```

**Bundle size improvement:** The removal of `@google/genai` from the client reduced the JavaScript bundle from ~469 KB to ~268 KB (43% reduction).

**Cloud Build Configuration:**

For Google Cloud Build, configure build substitutions in your `cloudbuild.yaml`:

```yaml
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'build'
      - '--build-arg'
      - 'COMMIT_SHA=$SHORT_SHA'
      - '--build-arg'
      - 'BUILD_TIME=$_BUILD_TIME'
      - '-t'
      - 'gcr.io/$PROJECT_ID/vehicle-tracker:$SHORT_SHA'
      - '.'
substitutions:
  _BUILD_TIME: '$(date -u +"%Y-%m-%dT%H:%M:%SZ")'
```

**Rollback Instructions:**

To rollback to a previous version:

1. Find the previous image tag (commit SHA) in your container registry
2. Deploy the previous image:
   ```bash
   gcloud run deploy vehicle-tracker \
     --image gcr.io/PROJECT_ID/vehicle-tracker:PREVIOUS_SHA
   ```

### Deploy

The app can be deployed to any container platform or static hosting service:

- **Docker Container** (recommended): Use the provided Dockerfile for Cloud Run, Kubernetes, or any container platform
- **Firebase Hosting**: `firebase deploy` (requires separate backend deployment for API)
- **Netlify**: Connect your repo with build command `npm run build` (requires serverless functions for API)
- **Vercel**: Connect your GitHub repo with build command `npm run build` (requires serverless functions for API)

**Note:** If deploying to static hosting (Firebase/Netlify/Vercel), you'll need to separately deploy the backend API or use their serverless function capabilities.

### Service Worker Updates

The app includes automatic update detection:

1. **On new deployment**: The service worker detects a new version
2. **User notification**: A banner appears at the top: "A new version is available!"
3. **User action**: Click "Reload" to update, or "Dismiss" to continue with current version
4. **Version display**: Current version (git commit SHA) shown in the header

To verify the live version:
- Check the console for: `App Version: [commit-sha]` and `Build Time: [timestamp]`
- Look for version number next to "Vehicle Order Tracker" in the header

### Tailwind CSS Setup

The app uses Tailwind CSS via PostCSS (no CDN):

- **Configuration**: `tailwind.config.js`
- **PostCSS Config**: `postcss.config.js`
- **Source**: `src/index.css` (Tailwind directives)
- **Output**: Optimized CSS bundle with unused styles removed

**Production benefits:**
- ✅ No CDN warnings in console
- ✅ Faster initial load (no external script)
- ✅ Tree-shaking removes unused Tailwind utilities
- ✅ Consistent styling (no CDN version conflicts)

## Deployment Verification

### Pre-Deployment Checks

Before deploying to production, run the pre-deployment validation script:

```bash
npm run build
node scripts/pre-deploy-check.cjs
```

This script validates:
- ✅ Build artifacts exist and are correct
- ✅ No Tailwind CDN references in production build
- ✅ Hashed assets present (not source .tsx files)
- ✅ Favicons and service worker files exist
- ✅ Bundle sizes are reasonable
- ✅ Git status is clean

**Exit codes:**
- `0` - All checks passed
- `1` - Critical errors found (fix before deploying)

### Post-Deployment Verification

After deploying, verify the deployment with the automated verification script:

```bash
node scripts/verify-deployment.cjs https://your-app-url.com
```

This script tests:
- ✅ Health endpoint responds correctly
- ✅ API status endpoint returns version info
- ✅ No Tailwind CDN in served HTML
- ✅ Hashed assets served with correct MIME types
- ✅ Cache headers configured correctly (no-cache for HTML, immutable for assets)
- ✅ Favicons load successfully
- ✅ Service worker files accessible

**Example output:**
```
============================================================
Test Summary
============================================================
Total Tests: 25
Passed: 25
Failed: 0
Warnings: 0

✅ Deployment verification PASSED
```

### Manual Smoke Tests

After automated verification passes, perform manual smoke tests:

1. **Fresh Browser Test (No Cache)**
   - Open production URL in incognito/private window
   - Login as manager user
   - Verify manager navigation visible (Dashboard + User Management pills)
   - Verify VersionBadge shows in header
   - Navigate to `/#/admin` and verify SettingsPage loads
   - Check browser console for no errors

2. **Version Verification**
   ```bash
   curl https://your-app-url.com/api/status | jq
   ```
   Verify `version` field matches latest commit SHA

3. **Bundle Freshness**
   - Open DevTools Console
   - Look for "Application Bundle Info" log
   - Verify version and build time are current
   - No "STALE_BUNDLE_DETECTED" warnings

### Stale Bundle Recovery

If production is serving an outdated bundle:

1. **Unregister Service Workers**
   - Open DevTools → Application → Service Workers
   - Click "Unregister" on all workers
   - Hard refresh: Ctrl/Cmd + Shift + R

2. **Clear Browser Storage**
   ```javascript
   // Run in browser console
   localStorage.clear();
   sessionStorage.clear();
   location.reload();
   ```

3. **Verify New Build Deployed**
   ```bash
   # Check Cloud Run revision
   gcloud run services describe pre-order-dealer-exchange-tracker \
     --region=us-west1 \
     --format='value(status.latestCreatedRevisionName)'
   
   # Verify 100% traffic to latest
   gcloud run services describe pre-order-dealer-exchange-tracker \
     --region=us-west1 \
     --format='table(status.traffic.revisionName,status.traffic.percent)'
   ```

4. **Force New Deployment** (if needed)
   ```bash
   # Rebuild without cache
   gcloud builds submit --config cloudbuild.yaml --no-cache
   ```

### Troubleshooting

**Problem: VersionBadge shows "unknown" or missing**
- **Cause:** Build args not passed during Docker build
- **Fix:** Verify `cloudbuild.yaml` passes `COMMIT_SHA=${SHORT_SHA}`

**Problem: Module script MIME type errors**
- **Cause:** Assets returning HTML instead of JavaScript (404 fallback)
- **Fix:** Verify assets exist in dist/ and Docker COPY includes dist/

**Problem: Manager navigation not visible**
- **Cause:** User role not set in Firestore
- **Fix:** Set `isManager: true` in Firestore users collection

**Problem: Tailwind CDN warning in console**
- **Cause:** Old build or source index.html has CDN script
- **Fix:** Clear dist/, rebuild, redeploy

See [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md) for comprehensive deployment procedures.

## Manager Features

Users designated as managers can:
- View all orders from all users
- Access the "User Management" settings page
- Toggle manager permissions for other users
- Cannot change their own role (security safeguard)

### Accessing User Management

Managers have multiple ways to access User Management:
1. **Pill navigation**: Click "User Management" in the left-side pill nav
2. **Gear icon**: Click the settings gear icon in the header (right side)
3. **Deep link**: Navigate directly to `/#/admin` in the URL

Non-managers attempting to access `/#/admin` will be automatically redirected to the dashboard.

## Development Notes

### Routing Structure

The app uses React Router with HashRouter for client-side routing:
- `/#/` or `/` - Dashboard view (shows order form for non-managers, order list for managers)
- `/#/admin` - User Management page (protected, managers only)

**Deep linking works**: Navigating directly to `/#/admin` after authentication will show the Settings page for managers.

### Version Information

The app displays version information in the header:
- **Version format**: `v[commit-sha]` (e.g., `v3a2b1c4`)
- **Build time**: Hover over version to see build timestamp
- **Console logs**: Version info is logged on app load
- **Implementation**: VersionBadge component reads from `import.meta.env.VITE_APP_COMMIT_SHA` and `import.meta.env.VITE_APP_BUILD_TIME`
- **Build-time injection**: Vite config uses `VITE_APP_*` environment variables if set (Docker build), otherwise falls back to git commands

**Docker Build:**
The Dockerfile passes `COMMIT_SHA` and `BUILD_TIME` build args as `VITE_APP_*` environment variables, which Vite embeds into the browser bundle at build time.

**Local Development:**
During local builds, Vite automatically uses `git rev-parse --short HEAD` for the commit SHA and the current timestamp for build time.

### Service Worker Cleanup

On app load, the application automatically:
1. **Checks for legacy service workers**: Detects any registered service workers
2. **Unregisters them**: Removes old service workers to prevent stale cache issues
3. **One-time reload**: If service workers were found, triggers a single page reload
4. **Session guard**: Uses `sessionStorage` to prevent infinite reload loops

This temporary cleanup ensures all users get the latest bundle after deployment, even if they were stuck behind an old service worker cache.

## Troubleshooting

### "User Management" buttons not visible

If manager UI is not showing:
1. Hard refresh the browser: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
2. Clear service worker cache in DevTools > Application > Service Workers
3. Verify user has `isManager: true` in Firestore `users` collection
4. Check console for version - ensure latest build is loaded

### Service Worker Issues

To reset service worker:
1. Open DevTools > Application > Service Workers
2. Click "Unregister" for the current service worker
3. Click "Clear storage" to remove all caches
4. Hard refresh the page

### Stale Cache After Deploy

The app includes automatic service worker cleanup:
1. **On first load after deploy**: Legacy service workers are automatically unregistered
2. **Automatic reload**: A one-time reload occurs to fetch the fresh bundle
3. **No user action needed**: The cleanup happens transparently
4. **Verification**: Check console for "Unregistering X legacy service worker(s)..." message

Additionally:
- Ensure `index.html` has short cache duration on your hosting platform
- The service worker update banner will appear for version updates
- Users can manually hard refresh if needed: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)

### MutationObserver Errors

The app includes a defensive error handler that suppresses MutationObserver errors from third-party code that might break rendering. Other errors are not suppressed and will display normally.
