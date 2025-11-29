<!-- markdownlint-disable MD013 -->
<!-- Long lines intentional for command examples, URLs, and comprehensive explanations -->

# Pre-Order & Dealer Exchange Tracker

![GH Banner](https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6)

[![CI](https://github.com/PriorityLexusVB/vehicle-in-need/actions/workflows/ci.yml/badge.svg)](https://github.com/PriorityLexusVB/vehicle-in-need/actions/workflows/ci.yml)

A vehicle order tracking application for Priority Automotive with manager controls, user management, and AI-powered email generation.

View your app in AI Studio: [AI Studio App](https://ai.studio/apps/drive/1XrFhCIH0pgEmQ_DSYHkXD3TovOfqWFJu)

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

## Role-Based Access Control

The application provides distinct experiences for two user roles:

### Manager Role

Managers have full access to all features:

- ✅ View **All Orders** from all users
- ✅ Dashboard with statistics (active orders, pending actions, deliveries)
- ✅ Create new orders
- ✅ Update order status and delete orders
- ✅ Access User Management at `/#/admin`
- ✅ Toggle manager status for other users
- ✅ Admin navigation visible in header

### Non-Manager Role

Non-managers have a streamlined experience:

- ✅ Submit new vehicle requests via always-visible form
- ✅ View **Your Orders** (filtered to only their created orders)
- ❌ Cannot see orders created by other users
- ❌ Cannot update status or delete orders
- ❌ No access to `/#/admin` (automatically redirected)
- ❌ No admin navigation or settings

### Order Ownership

All orders are automatically stamped with creator identity:

- `createdByUid` - User ID of the order creator
- `createdByEmail` - Email of the order creator
- `createdAt` - Server timestamp when order was created

This ensures proper order filtering and audit trails.

### Firestore Index Requirements

To support per-user order queries, you need a composite index in Firestore:

```text
Collection: orders
Fields:
  - createdByUid (Ascending)
  - createdAt (Descending)
```

**The index is defined in `firestore.indexes.json`** and can be deployed using Firebase CLI.

**To deploy the index:**

```bash
# Deploy Firestore indexes
firebase deploy --only firestore:indexes --project vehicles-in-need
```

#### Alternative: Create via Firebase Console

1. In Firebase Console, go to Firestore Database → Indexes
2. Click "Create Index"
3. Collection: `orders`
4. Add field: `createdByUid` (Ascending)
5. Add field: `createdAt` (Descending)
6. Click "Create Index"

**Or follow the console link:** When you run a query requiring this index, Firebase will show an error with a direct link to create it in the console.

### Verifying Roles Locally

For comprehensive role testing using Firebase Emulator, see **[Emulator Role Testing Guide](docs/dev/emulator-role-testing.md)**.

#### Quick Start

1. Start the Firebase Emulator:

   ```bash
   firebase emulators:start
   ```

2. Set environment variables to point to emulator:

   ```bash
   export FIRESTORE_EMULATOR_HOST='localhost:8080'
   export FIREBASE_AUTH_EMULATOR_HOST='localhost:9099'
   ```

3. Create test users with custom tokens:

   **Manager user (rob.brasco at priorityautomotive.com):**

   ```bash
   node scripts/auth-impersonate.mjs --email rob.brasco@priorityautomotive.com --manager
   ```

   **Non-manager user (ron.jordan at priorityautomotive.com):**

   ```bash
   node scripts/auth-impersonate.mjs --email ron.jordan@priorityautomotive.com --non-manager
   ```

4. Copy the generated token and use `signInWithCustomToken()` in the browser console

See the [full guide](docs/dev/emulator-role-testing.md) for detailed instructions, expected behaviors, and troubleshooting.

#### Migration Script for Legacy Orders

For existing orders without owner information, see **[Order Owner Migration Guide](docs/dev/order-owner-migration.md)**.

##### Migration Quick Reference

```bash
# Dry run to preview changes (recommended first step)
node scripts/migrations/backfill-order-owners.mjs --project vehicles-in-need --dry-run

# Apply changes (only after reviewing dry-run output)
node scripts/migrations/backfill-order-owners.mjs --project vehicles-in-need --apply
```

The script attempts to match orders to users by salesperson name and provides a detailed report of:

- Matched orders (with confidence levels)
- Unmatched orders requiring manual review
- Suggested remediation steps for unmatched orders

See the [full migration guide](docs/dev/order-owner-migration.md) for detailed workflow, troubleshooting, and manual remediation steps.

## Architecture

### AI Email Generation - Dual Mode Support

The application supports **two methods** for AI email generation:

#### Method 1: Server-Side Vertex AI Proxy (Recommended for Production)

```text
Browser → /api/generate-email → Express Server → Vertex AI (Gemini 2.0 Flash)
                                      ↓
                            Service Account IAM
                         (Vertex AI User role)
```

**Benefits:**

- ✅ No API keys exposed in client bundle
- ✅ Uses Google Cloud Application Default Credentials (ADC)
- ✅ Service account with proper IAM roles (Vertex AI User)
- ✅ Server-side validation and error handling
- ✅ Smaller client bundle size (~280 KB vs ~469 KB)

#### Method 2: Client-Side Gemini API (Development/Fallback)

```text
Browser → Gemini API (direct)
   ↓
VITE_GEMINI_API_KEY
```

**Use cases:**

- 🔧 Local development without server setup
- 🔄 Fallback when server is unavailable
- 🧪 Testing and prototyping

**⚠️ Security Warning:** API keys are visible in browser DevTools. Use only for development!

#### Automatic Mode Selection

The application automatically detects which method to use:

1. If `VITE_GEMINI_API_KEY` is set at build time → Uses client-side API
2. Otherwise → Falls back to server-side proxy

The application is split into:

1. **Frontend (React + Vite)**: Static files served by Express
2. **Backend (Express + Node.js)**: Serves static files + API endpoints

### API Endpoints

- `GET /health` - Health check endpoint (returns "healthy")
- `GET /api/status` - Returns AI service status and version info
- `POST /api/generate-email` - Generate follow-up emails for customer orders

## Run Locally

**Prerequisites:** Node.js (v20 or higher recommended)

### Setup 1: Server-Side Proxy (Production Mode)

The recommended approach for production-like testing.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Authenticate with Google Cloud:

   ```bash
   gcloud auth application-default login
   ```

   This authenticates your local environment using Application Default Credentials (ADC). The server will automatically use these credentials when calling Vertex AI APIs.

3. Build the frontend:

   ```bash
   npm run build
   ```

4. Run the server:

   ```bash
   npm run server
   ```

5. Open your browser to [`http://localhost:8080`](http://localhost:8080)

**How it works:**

- Frontend is served as static files from `dist/`
- API endpoint `/api/generate-email` uses Vertex AI with ADC
- No client-side API keys needed

### Setup 2: Client-Side API (Development Mode)

Quick setup for frontend development without running a server.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env.local` with your Gemini API key:

   ```bash
   echo "VITE_GEMINI_API_KEY=your-api-key-here" > .env.local
   ```

   Get an API key from [Google AI Studio](https://aistudio.google.com/app/apikey).

3. Run the development server:

   ```bash
   npm run dev
   ```

4. Open your browser to [`http://localhost:3000`](http://localhost:3000)

**⚠️ Note:** This exposes the API key in the browser bundle. Use only for development!

### Setup 3: Hybrid Development

For frontend development with server-side API calls:

1. Terminal 1 - Backend server:

   ```bash
   gcloud auth application-default login  # One-time setup
   npm run server
   ```

2. Terminal 2 - Frontend dev server:

   ```bash
   npm run dev
   ```

The dev server (port 3000) will proxy API calls to the backend (port 8080).

## Build and Deploy

### Docker Build (Recommended for Production)

The application uses a multi-stage Dockerfile that builds the frontend and packages it with a Node.js server:

**Build with server-side Vertex AI (recommended):**

```bash
docker build \
  --build-arg COMMIT_SHA=$(git rev-parse --short HEAD) \
  --build-arg BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ") \
  -t vehicle-tracker:latest .
```

**Build with client-side API key (optional):**

```bash
docker build \
  --build-arg COMMIT_SHA=$(git rev-parse --short HEAD) \
  --build-arg BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ") \
  --build-arg VITE_GEMINI_API_KEY=your-api-key-here \
  -t vehicle-tracker:latest .
```

**⚠️ Note:** Client-side API keys are visible in the browser bundle. For production, use the server-side proxy instead.

**Note:** If you encounter an npm "Exit handler never called!" error when building locally, this is a [known npm bug](https://github.com/npm/cli/issues) in certain Docker environments. **The recommended approach is to build using Google Cloud Build** where this issue doesn't occur. For local testing, you can:

- Build the frontend with `npm run build` locally
- Run the server with `npm run server` to test the full stack
- Skip Docker build for local development

**Run the container locally (if Docker build succeeds):**

```bash
docker run -p 8080:8080 vehicle-tracker:latest
```

Then open [`http://localhost:8080`](http://localhost:8080) in your browser.

**Benefits of Docker build:**

- ✅ Deterministic builds with consistent Node 20 environment
- ✅ Proper cache control headers (no-cache for index.html, immutable for hashed assets)
- ✅ Version visibility via VersionBadge component in header
- ✅ Minimal production image size (Node 20 Alpine runtime)
- ✅ Built-in health check endpoint at `/health`
- ✅ Integrated Express server for static files + API

### Cloud Run Deployment

When deploying to Google Cloud Run:

#### ⚠️ IAM Permissions Required

Before deploying, ensure proper IAM permissions are configured. If you encounter:

```text
ERROR: Permission 'iam.serviceaccounts.actAs' denied
```

**Quick Fix**: See [QUICK_IAM_FIX.md](./QUICK_IAM_FIX.md) for 5-minute solution.

**Detailed Guides**:

- [IAM_FIX_EXECUTION_GUIDE.md](./IAM_FIX_EXECUTION_GUIDE.md) - Complete walkthrough
- [IAM_FIX_CHECKLIST.md](./IAM_FIX_CHECKLIST.md) - Execution checklist
- [IAM_CONFIGURATION_SUMMARY.md](./IAM_CONFIGURATION_SUMMARY.md) - Full IAM architecture
- [scripts/setup-iam-permissions.sh](./scripts/setup-iam-permissions.sh) - Automated setup script

#### Deployment Steps

1. **Pre-deployment verification (recommended):**

   Run the comprehensive CSS check before deploying:

   ```bash
   npm run predeploy
   ```

   This will:
   - Build the application fresh
   - Verify CSS files are generated
   - Check Tailwind classes are present
   - Test server startup
   - Verify CSS is accessible via HTTP

2. **Ensure your service account has required roles:**

   - `Vertex AI User` - for calling Gemini models via server-side proxy
   - `Service Account Token Creator` (if needed for service-to-service calls)
   - See IAM guides above for complete permissions setup

3. **Deploy with Cloud Build (server-side mode - recommended):**

   ```bash
   gcloud builds submit --config cloudbuild.yaml \
     --project=gen-lang-client-0615287333 \
     --substitutions=_REGION=us-west1,_SERVICE=pre-order-dealer-exchange-tracker,SHORT_SHA=manual-$(date +%Y%m%d-%H%M)
   ```

   **Note:** The build now includes automatic CSS verification at multiple stages:
   - ✅ Docker build-stage verification (fails if CSS not generated)
   - ✅ Docker runtime-stage verification (fails if CSS not copied)
   - ✅ Post-deployment HTTP check (fails if CSS not accessible)
   - ✅ Server startup verification (crashes if CSS missing)

   **Canonical Deployment Flows:**
   - **CI/CD (Recommended)**: Cloud Build trigger `vehicle-in-need-deploy` automatically builds and deploys on push to `main`
   - **Manual**: Use the `gcloud builds submit` command above for testing or emergency deployments
   - **Never use**: `SERVICE_URL` as a Cloud Build substitution variable (it's retrieved dynamically at runtime)

   See [GCP_MANUAL_CONFIGURATION_CHECKLIST.md](./GCP_MANUAL_CONFIGURATION_CHECKLIST.md) for complete Cloud Build trigger setup.

4. **Deploy with client-side API key (optional):**

   Add to your `cloudbuild.yaml`:

   ```yaml
   steps:
     - name: "gcr.io/cloud-builders/docker"
       args:
         - "build"
         - "--build-arg"
         - "COMMIT_SHA=$SHORT_SHA"
         - "--build-arg"
         - "BUILD_TIME=$_BUILD_TIME"
         - "--build-arg"
         - "VITE_GEMINI_API_KEY=${_VITE_GEMINI_API_KEY}"
         - "-t"
         - "gcr.io/$PROJECT_ID/vehicle-tracker:$SHORT_SHA"
         - "."
   substitutions:
     _BUILD_TIME: '$(date -u +"%Y-%m-%dT%H:%M:%SZ")'
     _VITE_GEMINI_API_KEY: "your-api-key-or-secret-ref"
   ```

5. **The container automatically:**
   - Uses the attached service account credentials (for server-side proxy)
   - Or uses the build-time API key (if VITE_GEMINI_API_KEY provided)
   - Serves both static files and API endpoints on port 8080
   - Provides health check at `/health` for Cloud Run

**Recommended:** Use server-side Vertex AI proxy for production (no API key needed). The client-side option is available for development/testing.

### Selecting the Correct Container Image

When deploying or updating the Cloud Run service via the Cloud Console, ensure you select the correct image from Artifact Registry:

**✅ Correct image path:**

```text
us-west1-docker.pkg.dev/gen-lang-client-0615287333/vehicle-in-need/pre-order-dealer-exchange-tracker:<TAG>
```

**❌ Avoid legacy path:**

```text
us-west1-docker.pkg.dev/gen-lang-client-0615287333/cloud-run-source-deploy/...
```

The `cloud-run-source-deploy` directory contains deprecated images from legacy deployments. Always use the main repository path for current deployments.

**Note:** Previous deployments using `gcloud run deploy --source` may have created invalid OCI images (manifest layer/diff_ids mismatch). The new deployment pipeline ensures proper image structure.

**Finding the correct image:**

1. In Cloud Run console, click "Edit & Deploy New Revision"
2. Select "Container Image URL"
3. Click "Select" to browse Artifact Registry
4. Navigate to: `gen-lang-client-0615287333/vehicle-in-need/pre-order-dealer-exchange-tracker`
5. Choose the desired tag (typically the latest commit SHA)

### Automated CI/CD with GitHub Actions

The repository includes a GitHub Actions workflow (`.github/workflows/build-and-deploy.yml`) that automates container builds:

**On push to main:**

- Validates build configuration
- Builds Docker image via Cloud Build
- Pushes to Artifact Registry with git SHA tag
- Validates image structure
- Generates deployment command

**On pull requests:**

- Validates build configuration only (no build/push)

**Manual deployment:**

- Use workflow_dispatch to build and optionally deploy

**Prerequisites:**

- Configure GitHub secrets for Workload Identity Federation:
  - `GCP_WORKLOAD_IDENTITY_PROVIDER`
  - `GCP_SERVICE_ACCOUNT`

See [DOCKER_BUILD_NOTES.md](./DOCKER_BUILD_NOTES.md) for detailed build and deployment procedures.

### Environment Variables (Optional)

See [.env.example](.env.example) for detailed configuration options:

**Server-side configuration:**

- `GOOGLE_CLOUD_PROJECT` - Auto-detected from environment (optional override)
- `VERTEX_AI_LOCATION` - Defaults to `us-central1` (optional)
- `PORT` - Server port, defaults to `8080` (optional)

**Client-side configuration:**

- `VITE_GEMINI_API_KEY` - Gemini API key for client-side mode (build-time only)
  - Set in `.env.local` for local development
  - Pass as `--build-arg` for Docker builds
  - Add as substitution in Cloud Build
  - ⚠️ Visible in browser - use only for development!

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

```text
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
  - name: "gcr.io/cloud-builders/docker"
    args:
      - "build"
      - "--build-arg"
      - "COMMIT_SHA=$SHORT_SHA"
      - "--build-arg"
      - "BUILD_TIME=$_BUILD_TIME"
      - "-t"
      - "gcr.io/$PROJECT_ID/vehicle-tracker:$SHORT_SHA"
      - "."
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

### CSS Deployment Safeguards

The project includes comprehensive safeguards to ensure CSS is correctly compiled, deployed, and served in production. These prevent the application from being deployed with missing or broken styles.

**Multi-layer verification:**

1. **Build time** - `postbuild` script verifies CSS after `npm run build`
2. **Docker builder stage** - Fails if CSS not generated in container
3. **Docker runtime stage** - Fails if CSS not copied to final image
4. **Cloud Build deployment** - HTTP check verifies CSS is accessible
5. **Server startup** - Node.js verifies CSS files exist before listening
6. **Browser runtime** - Client-side warning if CSS fails to load

**Quick verification:**

```bash
# Run all CSS checks before deploying
npm run predeploy

# Check CSS in existing build
npm run verify:css
```

**Documentation:**

- `TAILWIND_CSS_SAFEGUARDS.md` - Complete technical documentation
- `DEPLOYMENT_QUICK_REFERENCE.md` - Quick deployment guide
- `scripts/pre-deploy-css-check.sh` - Comprehensive pre-deployment checker

**Result:** Successful deployment = Working CSS. It's impossible to deploy without properly functioning styles.

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

```text
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

### Problem: VersionBadge shows "unknown" or missing

- **Cause:** Build args not passed during Docker build
- **Fix:** Verify `cloudbuild.yaml` passes `COMMIT_SHA=${SHORT_SHA}`

### Problem: Module script MIME type errors

- **Cause:** Assets returning HTML instead of JavaScript (404 fallback)
- **Fix:** Verify assets exist in dist/ and Docker COPY includes dist/

### Problem: Manager navigation not visible

- **Cause:** User role not set in Firestore
- **Fix:** Set `isManager: true` in Firestore users collection

### Problem: Tailwind CDN warning in console

- **Cause:** Old build or source index.html has CDN script
- **Fix:** Clear dist/, rebuild, redeploy

### Problem: Cloud Build "SERVICE_URL" substitution error

- **Error:** `invalid value for 'build.substitutions': key in the template "SERVICE_URL" is not a valid built-in substitution`
- **Cause:** `SERVICE_URL` was incorrectly added as a Cloud Build substitution variable
- **Operator Runbook:** See [CLOUD_BUILD_TRIGGER_RUNBOOK.md](./CLOUD_BUILD_TRIGGER_RUNBOOK.md) for step-by-step diagnosis and fix procedures
- **Detailed Fix Guide:** See [CLOUD_BUILD_SERVICE_URL_FIX.md](./CLOUD_BUILD_SERVICE_URL_FIX.md) for comprehensive explanation
- **Quick Fix:** Remove `SERVICE_URL` from the Cloud Build trigger's substitution variables in GCP Console
- **List Triggers:** Run `npm run cloudbuild:list-triggers` to see all triggers and their substitutions
- **Verify Trigger:** Run `npm run cloudbuild:verify-trigger` to check a specific trigger configuration
- **Prevention:** Run `npm run lint:cloudbuild` to check for SERVICE_URL misuse (runs automatically in CI)
- **Complete GCP Setup:** See [GCP_MANUAL_CONFIGURATION_CHECKLIST.md](./GCP_MANUAL_CONFIGURATION_CHECKLIST.md) for full IAM and trigger configuration

### Problem: Cloud Build IAM permission errors

- **Error:** `PERMISSION_DENIED: Permission 'iam.serviceaccounts.actAs' denied` or other permission errors
- **Cause:** Missing IAM permissions for Cloud Build or runtime service accounts
- **Comprehensive Fix Guide:** See [CLOUD_BUILD_ERROR_FIX.md](./CLOUD_BUILD_ERROR_FIX.md) for complete step-by-step instructions
- **Quick Diagnosis:** Run `./scripts/diagnose-cloud-build-error.sh [BUILD_ID]` to analyze the issue
- **Automated Fix:** Run `./scripts/setup-iam-permissions.sh --execute` to configure all required permissions
- **Most Common Fix:** Grant actAs permission to Cloud Build SA:

  ```bash
  gcloud iam service-accounts add-iam-policy-binding \
    pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com \
    --member="serviceAccount:cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com" \
    --role="roles/iam.serviceAccountUser" \
    --project="gen-lang-client-0615287333"
  ```

- **Manual Fix:** See [QUICK_IAM_FIX.md](./docs/archive/QUICK_IAM_FIX.md) for individual commands

See [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md) for comprehensive deployment procedures.

## Testing

The application includes automated tests to ensure code quality and functionality.

### Firestore Rules Tests

Security rules tests validate the Firestore security rules using the Firebase emulator:

- **User creation** - Self-escalation prevention, email validation
- **User access** - Read permissions, role-based access
- **User updates** - Role and email immutability
- **Order creation** - Ownership enforcement, required fields
- **Order access** - Manager vs. owner permissions
- **Order updates** - Field immutability, manager privileges
- **Order deletion** - Manager-only deletion

**Run rules tests:**

```bash
npm run test:rules          # Run tests once
npm run test:rules:watch    # Run in watch mode
```

**Test files:** `tests/firestore-rules/**/*.test.ts`

### Unit Tests

Unit tests are written using Vitest and Testing Library. They cover critical components:

- **ProtectedRoute** - Route protection logic for manager-only pages
- **SettingsPage** - User management and role toggle functionality
- **VersionBadge** - Version display component

**Run unit tests:**

```bash
npm test              # Run tests in watch mode
npm test -- --run     # Run tests once
npm test -- --ui      # Run with UI
```

**Test files:** `components/__tests__/*.test.tsx`

### End-to-End Tests

E2E tests are written using Playwright and cover user flows:

- **Manager flow** - Navigation, settings access, user management
- **Non-manager flow** - Access restrictions, redirects
- **Authentication flow** - Login, unauthenticated access

**Run E2E tests:**

```bash
npm run test:e2e           # Run all E2E tests
npm run test:e2e:ui        # Run with Playwright UI
```

**Note:** E2E tests require:

- Built application (`npm run build`)
- Running server (`npm run server`)
- Firebase authentication configured
- Test user accounts

Most E2E tests are skipped by default (`.skip`) because they require authenticated sessions. To run them:

1. Set up test user accounts in Firebase
2. Configure authentication in tests
3. Remove `.skip` from desired tests

**Test files:** `e2e/*.spec.ts`

### Deploy Parity Verification

Verify that production matches the local repository state:

```bash
npm run verify:parity https://your-production-url.com
```

This script checks:

- ✅ Production version matches local commit SHA
- ✅ Build time is recent
- ✅ No Tailwind CDN (using compiled CSS)
- ✅ Hashed assets present
- ✅ Service worker cleanup script included

**Exit codes:**

- `0` - Parity verified
- `1` - Parity check failed (investigate and redeploy)

### Running All Tests

```bash
# Unit tests
npm test -- --run

# E2E tests (requires server running)
npm run build
npm run server &
npm run test:e2e

# Deploy parity (against production)
npm run verify:parity https://your-app-url.com
```

## Continuous Integration (CI)

Automated tests run on every push and pull request to `main` via the GitHub Actions workflow in `.github/workflows/ci.yml`:

**Status Badge:**

[![CI Status](https://github.com/PriorityLexusVB/vehicle-in-need/actions/workflows/ci.yml/badge.svg)](https://github.com/PriorityLexusVB/vehicle-in-need/actions/workflows/ci.yml)

**Jobs:**

- `lint` – Runs ESLint, markdownlint, and Cloud Build configuration checks to enforce code quality, documentation standards, and prevent SERVICE_URL substitution errors
- `unit` – Installs dependencies and runs Vitest tests including frontend components and backend API tests (`npm test -- --run`)
- `e2e` – After unit tests pass: installs Playwright browsers (with caching), builds the app, starts the server, checks `/health`, then runs Playwright tests

**Test Coverage:**

- **Unit Tests:** Component tests (ProtectedRoute, SettingsPage, VersionBadge, OrderForm, OrderList) + Server API tests (health, status, AI endpoints)
- **E2E Tests:** End-to-end user flows with Playwright (manager flows, non-manager restrictions, authentication)
- **Crypto Polyfills:** Verified Buffer and getRandomValues availability

**Playwright Artifacts:**

On E2E test failures, the CI workflow automatically uploads:

- Screenshots of failed tests
- Video recordings of test execution
- Trace files for detailed debugging

Artifacts are retained for 7 days and can be downloaded from the Actions tab in GitHub.

**Browser Caching:**

Playwright browser binaries are cached between CI runs to speed up workflow execution. The cache key is based on Playwright version from package-lock.json.

**Local equivalent:**

```bash
# Run linting
npm run lint
npm run lint:md
npm run lint:cloudbuild

# Run unit tests
npm ci
npm test -- --run

# Run E2E tests
npx playwright install --with-deps
npm run build
npm run server &
npm run test:e2e
```

**Linting Commands:**

- `npm run lint` - Run ESLint on all TypeScript/JavaScript files
- `npm run lint:fix` - Auto-fix ESLint issues where possible
- `npm run lint:md` - Run markdownlint on all markdown files
- `npm run lint:md:fix` - Auto-fix markdown formatting issues
- `npm run lint:cloudbuild` - Check Cloud Build configuration (prevents SERVICE_URL substitution errors)

### UI Audit & Security Workflow

The repository includes an automated UI audit workflow (`.github/workflows/ui-audit.yml`) that runs on every PR to `main`:

**Checks performed:**

- ✅ Merge conflict marker detection (prevents builds with unresolved conflicts)
- ✅ Production build verification
- ✅ Secret scanning (ensures no API keys in `dist/`)
- ✅ Lighthouse performance and accessibility audit

**Run locally:**

```bash
# Full UI audit (includes secret scan + optional Lighthouse)
npm run audit:ui

# Or individual checks
npm run prebuild:check  # Check for conflict markers
npm run build           # Build production bundle
npm run audit:bundle    # Analyze bundle size (requires source-map-explorer)
```

**View Lighthouse reports:**

1. Go to Actions tab in GitHub
2. Select a UI Audit workflow run
3. Download the `lighthouse-report` artifact

For more details, see [docs/DEV_NOTES.md](./docs/DEV_NOTES.md#automated-ui-audit--merge-marker-guard).

**Testing with data-testid:**

Key UI elements now include `data-testid` attributes for stable E2E testing:

- `submit-order-button` - Order form submit button
- `manager-toggle-{uid}` - Manager role toggle switches
- `user-row-{uid}` - User management rows

**Adding authenticated E2E tests:**

Manager/user role tests are skipped until an authentication harness is implemented. To enable:

1. Set up test Firebase project or use Firebase Local Emulator Suite
2. Provide test credentials via environment variables:

   ```bash
   export PLAYWRIGHT_TEST_EMAIL="test-manager@example.com"
   export PLAYWRIGHT_TEST_PASSWORD="test-password"
   ```

3. Configure Playwright to use authentication state:

   ```typescript
   // In playwright.config.ts
   use: {
     storageState: 'playwright/.auth/user.json'
   }
   ```

4. Create global setup to generate auth state:

   ```typescript
   // In playwright/global-setup.ts
   // Login once, save storageState to file
   ```

5. Remove `.skip()` from tests in `e2e/manager-flow.spec.ts`

**Health gate:** E2E job waits for `http://localhost:8080/health` before executing tests.

**Future enhancements:**

- Integrate Firebase Local Emulator for authenticated E2E flows
- Add code coverage reporting
- Add visual regression testing
- Implement quality gate summary artifact (JSON/markdown report)

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

## Security & Role Management

### Service Account Key Security

**Never commit service account keys to version control.** The application uses Firebase Admin SDK for manager role seeding, which requires authentication.

**Recommended Authentication Methods** (in order of preference):

1. **Application Default Credentials (ADC)** - For local development:

   ```bash
   gcloud auth application-default login
   ```

2. **Service Account Key File** - For automation/CI:
   - Store keys outside of Git (e.g., `.secrets/vin-seeder.json`)
   - Set `GOOGLE_APPLICATION_CREDENTIALS` environment variable
   - Ensure `.gitignore` excludes `.secrets/` directory

**If a key is accidentally committed:**

1. **Immediately delete the key** from Google Cloud Console
2. **Rotate the key** by creating a new one (see [MANUAL_TESTING_STEPS.md](./MANUAL_TESTING_STEPS.md#service-account-key-rotation))
3. **Remove from Git history** using `git filter-branch` or BFG Repo-Cleaner
4. **Notify team members** to re-clone the repository

**Key Rotation Schedule:**

- **Immediately** if exposed or committed to Git
- **Every 90 days** as a security best practice
- **After any suspected compromise**

See [MANUAL_TESTING_STEPS.md - Service Account Key Rotation](./MANUAL_TESTING_STEPS.md#service-account-key-rotation) for detailed rotation instructions.

### Role Management System

The application uses a secure two-tier authorization system:

1. **User Document Creation** - On first login, a user document is created in Firestore:
   - All users are created with `isManager: false` (enforced by Firestore security rules)
   - User documents include: `uid`, `email`, `displayName`, `isManager`, `createdAt`, `updatedAt`
   - Security rules prevent users from self-assigning manager status

2. **Persistent Storage** - Firestore is the single source of truth:
   - After first login, role data is stored in Firestore `users` collection
   - Role changes via Settings page persist across logins
   - The `MANAGER_EMAILS` constant is for informational logging only; it does NOT automatically grant manager status

**User Document Fields:**

| Field | Type | Description |
| ----- | ---- | ----------- |
| `uid` | string | Firebase Auth UID |
| `email` | string | User's email address |
| `displayName` | string \| null | Display name from Firebase Auth |
| `isManager` | boolean | Manager role flag (must be set by admin) |
| `createdAt` | timestamp | When the user document was created |
| `updatedAt` | timestamp | When the user document was last updated |
| `isActive` | boolean (optional) | Whether the account is active |

**User Registration Flow:**

```text
User First Login → Create user doc (isManager: false) → Store in Firestore
Subsequent Logins → Read from Firestore → Update updatedAt timestamp
```

**Adding a New Manager:**

Option 1: Use the Settings page (recommended):

1. Log in as an existing manager
2. Navigate to User Management (`/#/admin`)
3. Find the user and toggle their manager role switch
4. Change persists immediately in Firestore

Option 2: Using admin script:

```bash
npm run seed:managers:apply -- --emails newmanager@priorityautomotive.com
```

This script uses the Firebase Admin SDK to:

- Set `isManager: true` in the user's Firestore document
- Set `isManager: true` custom claim in Firebase Auth

**Bootstrap First Manager:**

For a new deployment with no existing managers, use the admin script:

```bash
# Dry run first to verify
npm run seed:managers:dry-run -- --emails first.manager@priorityautomotive.com

# Apply the change
npm run seed:managers:apply -- --emails first.manager@priorityautomotive.com
```

**Security Safeguards:**

- ✅ Domain restriction: Only `@priorityautomotive.com` emails can access the app
- ✅ Self-escalation prevention: Users cannot set their own `isManager: true`
- ✅ Manager self-protection: Managers cannot demote themselves
- ✅ Protected routes: `/admin` route is guarded by `ProtectedRoute` component
- ✅ Zero-manager warning: Non-managers see an alert if no managers exist

**Role Verification:**

After deployment, verify roles are correct:

```bash
# Check manager roles in Firestore
# Use Firebase Console → Firestore → users collection
# Verify isManager: true for expected users

# Or use the seeder script in dry-run mode
npm run seed:managers:dry-run -- --emails manager@priorityautomotive.com
```

For comprehensive role UI documentation, see [docs/role-ui-examples.md](./docs/role-ui-examples.md).

### Firestore Security Rules - Manager Access

The Firestore security rules support manager access via **two methods**:

1. **Custom Claims (Preferred)**: Manager status stored in Firebase Auth custom claims (`request.auth.token.isManager`)
2. **Firestore Document Fallback**: Manager status stored in `/users/{uid}.isManager`

The rules check custom claims first for performance, then fall back to Firestore:

```javascript
function isManager() {
  return hasManagerClaim() || hasManagerInFirestore();
}
```

**Benefits of this approach:**

- ✅ Managers work immediately when `isManager: true` is set in Firestore
- ✅ No need to wait for custom claims to propagate
- ✅ Custom claims provide better performance when available
- ✅ Full test coverage (56 tests, 100% pass rate)

**Production Query Patterns:**

- **Managers**: `query(collection(db, 'orders'), orderBy('createdAt', 'desc'))` - list all orders
- **Managers**: `query(collection(db, 'users'), orderBy('displayName', 'asc'))` - list all users
- **Non-managers**: `query(collection(db, 'orders'), where('createdByUid', '==', uid), orderBy('createdAt', 'desc'))` - list own orders only

For detailed rules documentation, see [FIRESTORE_RULES_STATUS.md](./docs/archive/FIRESTORE_RULES_STATUS.md).

### Manager Delete Operations & Permissions Fix

This section documents the fix for the "Missing or insufficient permissions" error that managers may encounter when performing delete operations. The fix ensures proper custom claims configuration and safe UI behavior.

**Problem:** Managers receive permission errors from Firestore when attempting to delete orders. The UI previously removed orders optimistically before server confirmation, causing orders to disappear even when deletion failed.

**Solution Components:**

1. **Custom Claims Script** (`tools/set-manager-custom-claims.mjs`) - Sets the `isManager: true` custom claim
2. **Debug Log Collector** (`scripts/collect_delete_debug.sh`) - Collects Cloud Run/Functions logs for debugging
3. **Safe Delete Component** (`web/src/components/OrderCard_delete_fix.tsx`) - Client-side component with proper error handling
4. **Server-Side Delete** (`server/src/handlers/orders_delete_admin.cjs`) - Admin SDK delete endpoint example
5. **Rules Documentation** (`docs/firestore-rules-manager-delete-snippet.md`) - Security rules explanation

#### Step 1: Set Manager Custom Claims

```bash
# Dry run first to verify the user
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
  node tools/set-manager-custom-claims.mjs --email manager@example.com --dry-run

# Apply the changes
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
  node tools/set-manager-custom-claims.mjs --email manager@example.com --apply

# Or using Application Default Credentials
gcloud auth application-default login
node tools/set-manager-custom-claims.mjs --project vehicles-in-need --email manager@example.com --apply
```

#### Step 2: User Token Refresh

After setting custom claims, the user must refresh their ID token:

- **Option A:** Sign out and sign back in
- **Option B:** In client code: `await user.getIdToken(true);`

The token refreshes automatically after ~1 hour, but signing out/in is immediate.

#### Step 3: Verify Claims (Optional)

In browser DevTools console:

```javascript
const user = firebase.auth().currentUser;
const token = await user.getIdTokenResult();
console.log('Claims:', token.claims);
// Should show: { ..., isManager: true } or { ..., manager: true }
```

#### Step 4: Deploy Server-Side Delete Route (Optional)

If you want to use server-side deletion (bypasses client rules):

```typescript
// In server/index.cjs (file is at server/index.cjs, paths are relative to server/)
const { initializeFirebaseAdmin, router: ordersDeleteRouter } = require('./src/handlers/orders_delete_admin.cjs');

initializeFirebaseAdmin();
app.use('/api/orders', ordersDeleteRouter);
```

#### Step 5: Integrate Safe Delete in Client

Replace optimistic delete with the safe delete component:

```tsx
import { SafeDeleteButton } from './OrderCard_delete_fix';

// In OrderCard, replace the delete button with:
<SafeDeleteButton 
  orderId={order.id}
  onDeleted={onDeleteOrder}
>
  <TrashIcon className="w-4 h-4 text-red-500" />
  Delete
</SafeDeleteButton>
```

#### Debugging Failed Deletions

Use the debug log collector to investigate failures:

```bash
# Collect delete-related logs from the last hour
./scripts/collect_delete_debug.sh --service pre-order-dealer-exchange-tracker

# Collect logs from a specific time window
./scripts/collect_delete_debug.sh \
  --service pre-order-dealer-exchange-tracker \
  --since "2024-01-01T10:00:00Z" \
  --until "2024-01-01T12:00:00Z"
```

#### Rollback Notes

If issues occur after deploying these changes:

1. **Client-side:** Revert the SafeDeleteButton integration to the original delete handler
2. **Server-side:** Remove the orders delete router from server/index.cjs
3. **Custom claims:** Claims cannot be easily "rolled back" but can be overwritten with `{ isManager: false }`
4. **Rules:** Firestore rules can be redeployed from a previous version via Firebase Console

References:

- Failing commit: `b7bbf4ce81bc133cf79910dea610113b18695186`
- MD060 fix: PR #134

## Development Notes

### Developer Documentation

Comprehensive guides for development, testing, and Git workflows:

- **[Emulator Role Testing](docs/dev/emulator-role-testing.md)** - Test role-based access control using Firebase Emulator Suite
- **[Order Owner Migration](docs/dev/order-owner-migration.md)** - Backfill legacy orders with owner information
- **[Branching Policy](docs/dev/branching-policy.md)** - Git workflow, branch hygiene, and squash merge guidelines

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

## Troubleshooting (General)

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

### MCP authentication 404 at /authorize

If you see a 404 when authenticating a GitHub Copilot MCP server and the browser URL is `https://api.githubcopilot.com/authorize?...`, update your user MCP config to use the `/mcp` base.

**📖 For detailed reset instructions, see [docs/mcp-reset.md](docs/mcp-reset.md)**

**Step-by-step recovery:**

1. **Locate your MCP configuration file:**
   - VS Code: `vscode-userdata:/User/mcp.json` or `~/.vscode/extensions/github.copilot-chat-*/mcp.json`
   - Other editors: Check editor-specific configuration paths

2. **Edit the GitHub MCP server entry:**

   ```json
   {
     "github/github-mcp-server": {
       "type": "http",
       "url": "https://api.githubcopilot.com/mcp"
     }
   }
   ```

   **Key change:** Ensure the URL ends with `/mcp` (not just `https://api.githubcopilot.com`)

3. **Restart MCP servers:**
   - Command Palette → `Developer: Reload Window`
   - Command Palette → `GitHub Copilot: Restart MCP Servers`

4. **Clear cached authentication (if still stuck):**
   - Open Secret Storage (Command Palette → `Developer: Open Secret Storage`)
   - Remove entries related to Copilot MCP auth
   - Restart VS Code

5. **Verify the fix:**
   - Browser should now open `https://api.githubcopilot.com/mcp/authorize?...`
   - Complete authentication flow
   - MCP server should connect successfully

**Automated reset script:**

Create a shell script to automate MCP reset:

```bash
#!/bin/bash
# mcp-reset.sh - Reset GitHub Copilot MCP server configuration

echo "Stopping VS Code..."
pkill -x "Code" || true

echo "Updating MCP configuration..."
MCP_CONFIG="$HOME/.vscode/extensions/github.copilot-chat-*/mcp.json"
if [ -f "$MCP_CONFIG" ]; then
  # Backup existing config
  cp "$MCP_CONFIG" "${MCP_CONFIG}.backup"
  
  # Update URL to include /mcp base path
  sed -i 's|https://api.githubcopilot.com"|https://api.githubcopilot.com/mcp"|g' "$MCP_CONFIG"
  echo "Configuration updated"
else
  echo "MCP config not found at $MCP_CONFIG"
fi

echo "Restarting VS Code..."
code
```

Make executable and run:

```bash
chmod +x mcp-reset.sh
./mcp-reset.sh
```

**Common issues:**

- **Still getting 404:** Clear browser cookies for `githubcopilot.com` and retry
- **Server won't start:** Check VS Code logs (Help → Toggle Developer Tools → Console)
- **Permission denied:** Ensure your GitHub account has Copilot access
- **Network errors:** Check firewall/proxy settings for `api.githubcopilot.com`

**Prevention:**

- Always use the full MCP base URL: `https://api.githubcopilot.com/mcp`
- Keep VS Code and Copilot extensions updated
- Regularly restart MCP servers after updates

The browser should open `https://api.githubcopilot.com/mcp/authorize?...`.

### Firebase auth/unauthorized-domain on Codespaces

If sign-in fails with `auth/unauthorized-domain` while using Codespaces or preview URLs (e.g. `*.app.github.dev`):

1. Copy your exact origin from the address bar (e.g. `https://<id>-4000.app.github.dev`).
2. In Firebase Console → Authentication → Settings → Authorized domains, add that origin.
3. Return to the app tab and click “Sign in with Google” again (don’t refresh; changes may take ~1 minute).

The Login screen in this app provides a helper UI and a deep link to the correct Firebase Console page when this error occurs.

### Node polyfills (crypto)

This project uses `vite-plugin-node-polyfills` with `protocolImports: true` in both `vite.config.ts` and `vitest.config.ts` so that `crypto.getRandomValues` works in browser and tests. If you introduce code that relies on other Node globals, prefer web APIs or small shims rather than adding heavy polyfills.

## Documentation

### Quick Links

- **[Production Quick Reference](docs/PRODUCTION_QUICK_REFERENCE.md)** - Quick verification and deployment commands
- **[Version Tracking](docs/VERSION_TRACKING.md)** - Deployment traceability and version management
- **[CSS Execution Final](docs/CSS_EXECUTION_FINAL.md)** - Comprehensive production URL consistency verification
- **[Deployment Guide](DEPLOYMENT_GUIDE.md)** - Complete deployment procedures and troubleshooting
- **[Documentation Index](docs/INDEX.md)** - Full documentation directory
- **[Operational Runbooks](docs/operations/)** - Cloud Build, Cloud Run, and deployment procedures

### Documentation Structure

The repository documentation is organized as follows:

- **Root level**: `README.md` (this file) and `DEPLOYMENT_GUIDE.md`
- **`docs/operations/`**: Current operational runbooks for Cloud Build, Cloud Run, and deployment
- **`docs/`**: Development documentation (CI/CD, MCP, templates, version tracking)
- **`docs/archive/`**: Historical documentation from previous fixes (for reference only)

For current deployment and troubleshooting information, always refer to the operational runbooks, not the archived documentation.
