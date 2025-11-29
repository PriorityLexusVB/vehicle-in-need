# Developer Notes

## Local Development

### Setup

1. Install and authenticate with gcloud (if using Firebase):

   ```bash
   gcloud auth application-default login
   gcloud config set project vehicles-in-need
   ```

2. Run the development server:

   ```bash
   npm run dev
   npm run server  # In a separate terminal
   ```

### Architecture

```text
┌─────────────┐
│   Browser   │
│   (Client)  │
└──────┬──────┘
       │ /api/status, /health
       │
       ▼
┌─────────────────┐
│  Express Server │
│  server/index.cjs │
└─────────────────┘
```

### Key Files

- **`server/index.cjs`**: Express server that serves static files and API endpoints
- **`Dockerfile`**: Multi-stage build for production
- **`cloudbuild.yaml`**: Cloud Build configuration

### Conflict Marker Protection

To prevent accidental deployment of files with merge conflict markers:

- **Prebuild Check**: The `prebuild` script in `package.json` runs before every
  build
- **Cloud Build Guard**: The first step in `cloudbuild.yaml` checks for
  conflict markers
- **Fail Fast**: Build fails immediately if markers are detected

## Automated UI Audit & Merge Marker Guard

### Overview (Automated Guards)

The repository includes automated guards to prevent deployment issues:

1. **Merge Conflict Marker Detection**: Prevents builds with unresolved merge
  conflicts
2. **Secret Scanning**: Ensures no secrets are exposed in production bundles
3. **Lighthouse Performance Audits**: Optional performance and accessibility
  checks

### Local UI Audit

Run a comprehensive UI audit locally before deploying:

```bash
npm run audit:ui
```

This script performs:

- Dependency installation (`npm ci`)
- Conflict marker detection (`prebuild:check`)
- Production build
- Secret scanning in `dist/`
- Lighthouse audit (if `lighthouse` and `http-server` are installed)

**Install Lighthouse (optional):**

```bash
npm install -g lighthouse http-server
```

### Bundle Analysis

Analyze the production bundle size and composition:

```bash
npm run audit:bundle
```

Requires `source-map-explorer` to be installed globally:

```bash
npm install -g source-map-explorer
```

### Conflict Marker Protection (Pre-Build Check)

The `prebuild:check` script runs automatically before every build and
checks for merge conflict markers in source files:

```bash
npm run prebuild:check
```

Searches for patterns: `<<<<<<<`, `=======`, `>>>>>>>` in:

- TypeScript files (*.ts,*.tsx)
- JavaScript files (*.js,*.jsx)
- HTML files (*.html)
- Markdown files (*.md)
- YAML files (*.yaml,*.yml)

If markers are found, the build fails immediately with an error listing the
affected files.

### GitHub Actions Workflow

A CI workflow runs on every PR to `main`:

**Workflow: `.github/workflows/ui-audit.yml`**

Performs:

1. Checkout code
2. Setup Node.js 20
3. Install dependencies
4. Check for conflict markers (fail if found)
5. Build production bundle (fail if build fails)
6. Scan for secrets in `dist/` (fail if found)
7. Run Lighthouse audit
8. Upload Lighthouse report as artifact

**View reports:**

- Go to the Actions tab in GitHub
- Select the workflow run
- Download the `lighthouse-report` artifact

### Secret Scanning Patterns

**Note on Firebase API Keys:**
Firebase Web SDK API keys (starting with `AIza`) are expected in the production
bundle. These are NOT secrets:

- They are designed to be public and included in client-side code
- They are protected by Firebase Security Rules
- They only grant access to public Firebase APIs
- The actual security is enforced server-side via Firestore Rules

## Related Documentation

- [Deployment Checklist](../DEPLOYMENT_CHECKLIST.md)
- [Docker Build Notes](../DOCKER_BUILD_NOTES.md)
- [Manual Testing Steps](../MANUAL_TESTING_STEPS.md)
