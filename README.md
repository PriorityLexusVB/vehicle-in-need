<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Pre-Order & Dealer Exchange Tracker

A vehicle order tracking application for Priority Automotive with manager controls and user management.

View your app in AI Studio: https://ai.studio/apps/drive/1XrFhCIH0pgEmQ_DSYHkXD3TovOfqWFJu

## Features

- 🚗 Track vehicle pre-orders and dealer exchanges
- 👥 User management with role-based access control
- 📊 Dashboard with real-time statistics
- 🔔 Service worker with automatic update notifications
- 🎨 Optimized Tailwind CSS (no CDN in production)
- 📱 Responsive design for mobile and desktop
- 🔗 Deep linking support (e.g., `#settings` for direct access)

## Run Locally

**Prerequisites:** Node.js (v18 or higher recommended)

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key

3. Run the development server:
   ```bash
   npm run dev
   ```

4. Open your browser to `http://localhost:3000`

## Build and Deploy

### Docker Build (Recommended for Production)

The application includes a multi-stage Dockerfile for deterministic, reproducible builds:

**Build the Docker image:**

```bash
docker build \
  --build-arg COMMIT_SHA=$(git rev-parse --short HEAD) \
  --build-arg BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ") \
  -t vehicle-tracker:latest .
```

**Note:** If you encounter an npm "Exit handler never called!" error when building locally, this is a [known npm bug](https://github.com/npm/cli/issues) in certain Docker environments. Workarounds:
- Use `docker build --network=host` 
- Update Docker Desktop to the latest version
- Build in Cloud Build (recommended) where this issue doesn't occur

**Run the container locally:**

```bash
docker run -p 8080:80 vehicle-tracker:latest
```

Then open http://localhost:8080 in your browser.

**Benefits of Docker build:**
- ✅ Deterministic builds with consistent Node 20 environment
- ✅ Proper cache control headers (no-cache for index.html, immutable for hashed assets)
- ✅ Version visibility via VersionBadge component in header
- ✅ Minimal production image size (nginx-alpine runtime)
- ✅ Built-in health check endpoint at `/health`
- ✅ No legacy service worker files in final image

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

### Deploy

The app can be deployed to any static hosting service:

- **Docker Container** (recommended): Use the provided Dockerfile for Cloud Run, Kubernetes, or any container platform
- **Firebase Hosting**: `firebase deploy`
- **Netlify**: Drag and drop the `dist/` folder or connect your repo
- **Vercel**: Connect your GitHub repo with build command `npm run build`
- **GitHub Pages**: Use a deployment action to publish the `dist/` folder

**Important:** When not using Docker, ensure your hosting is configured to:
- Set `Cache-Control: no-cache` for `index.html` to allow service worker updates
- Allow longer caching for hashed assets (`assets/index-*.js`, `assets/index-*.css`)

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
- **Populated via**: Vite config generates `__APP_VERSION__` and `__BUILD_TIME__` from git and build timestamp

### Service Worker Cleanup

On app load, the application automatically:
1. **Checks for legacy service workers**: Detects any registered service workers
2. **Unregisters them**: Removes old service workers to prevent stale cache issues
3. **One-time reload**: If service workers were found, triggers a single page reload
4. **Session guard**: Uses `sessionStorage` to prevent infinite reload loops

This temporary cleanup ensures all users get the latest bundle after deployment, even if they were stuck behind an old service worker cache.

### Environment Variables

- `GEMINI_API_KEY` - Required for AI features
- Build-time variables are injected via Vite config

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
