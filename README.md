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

**With Docker**, these cache headers are automatically configured in `nginx.conf`.

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

## Manager Features

Users designated as managers can:
- View all orders from all users
- Access the Settings page to manage user roles
- Toggle manager permissions for other users
- Cannot change their own role (security safeguard)

### Accessing Settings (Admin)

Managers have multiple ways to access Settings:
1. **Pill navigation** (Header): Click "Settings" in the left-side pill nav (visible after login as manager)
2. **Gear icon** (Header): Click the settings gear icon in the header (right side, labeled "Settings")
3. **Admin button** (Navbar): Click the "Admin" button in the top navigation bar
4. **Deep link**: Navigate directly to `/#/admin` in the URL

All three UI controls (pill navigation, gear icon, and Admin button) have `data-testid` attributes for automated testing:
- `data-testid="pill-admin-link"` - Pill navigation link
- `data-testid="header-admin-gear"` - Gear icon button
- `data-testid="navbar-admin-link"` - Admin button in navbar

Non-managers attempting to access `/#/admin` will be automatically redirected to the dashboard.

### Granting Manager Role

To grant manager permissions to a user:

1. **Via Settings Page** (recommended):
   - Log in as an existing manager
   - Navigate to Settings using any of the methods above
   - Find the user in the list
   - Toggle the "Manager" switch to enable manager permissions

2. **Via Firestore Console** (for initial setup):
   - Open Firebase Console > Firestore Database
   - Navigate to the `users` collection
   - Find or create the user document
   - Set `isManager: true` in the document

3. **First-time Bootstrap** (optional):
   - Set environment variable `ENABLE_FIRST_USER_ADMIN=true` (Cloud Run or Docker)
   - The first user with a `@priorityautomotive.com` email will automatically become a manager
   - After the first manager is created, disable this flag to prevent auto-promotion

**Note:** Users are initially seeded as managers based on the `MANAGER_EMAILS` constant in `constants.ts`, but subsequent role changes are managed exclusively through Firestore to ensure persistence.

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

### Verifying Current Version

To confirm which version is currently running:

1. **Browser UI**: Look for the version badge in the header next to "Vehicle Order Tracker" (displays as `v<commit-sha> @ <build-time>`, hover for ISO timestamp)
2. **Browser Console**: Check the logs for:
   ```
   App Version: <commit-sha>
   Build Time: <ISO timestamp>
   ```
3. **API Endpoint**: Visit `/api/status` or run:
   ```bash
   curl https://your-app-url.com/api/status
   ```
   This returns:
   ```json
   {
     "geminiEnabled": true,
     "version": "<commit-sha>",
     "appVersion": "<commit-sha>",
     "commitSha": "<commit-sha>",
     "buildTime": "<ISO timestamp>",
     "kRevision": "<Cloud Run revision>",
     "timestamp": "<current time>"
   }
   ```

4. **Server Logs** (Cloud Run or local): Check logs for:
   ```
   [Server] App Version: <commit-sha>
   [Server] Build Time: <ISO timestamp>
   ```

### "Settings" buttons not visible

If manager UI is not showing:
1. **Verify manager role**: Check Firestore `users` collection - ensure user has `isManager: true`
2. **Clear browser cache**: Hard refresh with `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
3. **Clear service worker**:
   - Open DevTools > Application > Service Workers
   - Click "Unregister" for any service workers
   - Click "Clear storage" to remove all caches
   - Hard refresh the page
4. **Check version**: Ensure the latest build is loaded (see "Verifying Current Version" above)
5. **Check for auth issues**: Verify the user is logged in with a `@priorityautomotive.com` email

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

If the app still shows an old version after deploy:
1. **Force service worker update**: 
   - Open DevTools > Application > Service Workers
   - Click "Update" to manually trigger SW update
   - Look for "A new version is available!" banner and click "Reload"

2. **Verify Cloud Run deployment**:
   ```bash
   # Check which revision is serving traffic
   gcloud run services describe YOUR_SERVICE_NAME --region YOUR_REGION
   ```
   - Confirm 100% traffic is routed to the latest revision
   - Check image digest matches the new build

3. **Check cache headers**:
   ```bash
   # Verify index.html is not cached
   curl -I https://your-app-url.com/
   # Should show: Cache-Control: no-cache, no-store, must-revalidate
   
   # Verify hashed assets are cached long-term
   curl -I https://your-app-url.com/assets/index-HASH.js
   # Should show: Cache-Control: public, max-age=31536000, immutable
   ```

Additionally:
- Ensure `index.html` has short cache duration on your hosting platform
- The service worker update banner will appear for version updates
- Users can manually hard refresh if needed: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)

### MutationObserver Errors

The app includes a defensive error handler that suppresses MutationObserver errors from third-party code that might break rendering. Other errors are not suppressed and will display normally.
