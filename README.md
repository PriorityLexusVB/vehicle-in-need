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

1. **Ensure your service account has required roles:**

   - `Vertex AI User` - for calling Gemini models via server-side proxy
   - `Service Account Token Creator` (if needed for service-to-service calls)

2. **Deploy with Cloud Build (server-side mode - recommended):**

   ```bash
   gcloud builds submit --config cloudbuild.yaml
   ```

3. **Deploy with client-side API key (optional):**

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

4. **The container automatically:**
   - Uses the attached service account credentials (for server-side proxy)
   - Or uses the build-time API key (if VITE_GEMINI_API_KEY provided)
   - Serves both static files and API endpoints on port 8080
   - Provides health check at `/health` for Cloud Run

**Recommended:** Use server-side Vertex AI proxy for production (no API key needed). The client-side option is available for development/testing.

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

See [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md) for comprehensive deployment procedures.

## Testing

The application includes automated tests to ensure code quality and functionality.

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
- **Role-based access** - UI visibility based on user role
- **Production diagnostics** - Bundle info logging, no Tailwind CDN
- **Service worker** - Cleanup behavior, no infinite reload

**Run E2E tests:**

```bash
npm run test:e2e           # Run all E2E tests
npm run test:e2e:ui        # Run with Playwright UI
```

**Note:** E2E tests require:

- Built application (`npm run build`)
- Playwright browsers installed (`npx playwright install`)
- Running server (`npm run server` or auto-started by Playwright)

**Test Implementation:**

The E2E tests use a graceful detection approach:
- Tests check if manager/non-manager UI elements are present
- Tests verify expected behavior when elements are available
- Tests skip gracefully when authentication is not configured
- Firebase Auth/Firestore mocking utilities provided in `e2e/auth-mock-utils.ts`

**Test files:**
- `e2e/manager-flow.spec.ts` - Original tests for application load and console errors
- `e2e/role-based-access.spec.ts` - Comprehensive role-based UI visibility tests

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

- `lint` – Runs ESLint and markdownlint to enforce code quality and documentation standards
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

The application uses a two-tier authorization system:

1. **Initial Seeding** - The `MANAGER_EMAILS` constant in `constants.ts`:
   - Used **only** on first login to seed initial manager status
   - Provides a bootstrap mechanism for new users
   - New managers can be added by updating this constant before their first login

2. **Persistent Storage** - Firestore is the single source of truth:
   - After first login, role data is stored in Firestore `users` collection
   - Role changes via Settings page persist across logins
   - Removing an email from `MANAGER_EMAILS` won't demote existing managers

**Manager Elevation Flow:**

```text
User First Login → Check MANAGER_EMAILS → Seed isManager: true/false → Store in Firestore
Subsequent Logins → Read isManager from Firestore (MANAGER_EMAILS ignored)
```

**Adding a New Manager:**

Option 1: Before first login (automatic):

1. Add email to `MANAGER_EMAILS` in `constants.ts`
2. Deploy the change
3. User logs in → automatically becomes manager

Option 2: After first login (manual):

1. Use existing manager account to access User Management (`/#/admin`)
2. Toggle the user's manager role switch
3. Change persists immediately in Firestore

Option 3: Using seeder script:

```bash
pnpm run seed:managers:apply -- --emails newmanager@priorityautomotive.com
```

**Security Safeguards:**

- ✅ Domain restriction: Only `@priorityautomotive.com` emails can access the app
- ✅ Manager self-protection: Managers cannot demote themselves
- ✅ Protected routes: `/admin` route is guarded by `ProtectedRoute` component
- ✅ Zero-manager warning: Non-managers see an alert if no managers exist
- ✅ Elevation logging: Manager upgrades are logged with `[ROLE-ELEVATION]` prefix

**Role Verification:**

After deployment, verify roles are correct:

```bash
# Check manager roles in Firestore
# Use Firebase Console → Firestore → users collection
# Verify isManager: true for expected users

# Or use the seeder script in dry-run mode
pnpm run seed:managers:dry-run -- --emails manager@priorityautomotive.com
```

For comprehensive role UI documentation, see [docs/role-ui-examples.md](./docs/role-ui-examples.md).

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
