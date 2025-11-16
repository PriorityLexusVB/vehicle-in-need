# Developer Notes

## Secret Management and API Key Security

### Overview

This application uses **server-side only** AI integration via Google Cloud
Vertex AI. API keys are **never exposed** to the client browser.

### Production Deployment (Cloud Run)

#### Secret Injection

The application uses Google Cloud Secret Manager for secure API key storage:

1. **Secret Storage**: The Gemini API key is stored in Secret Manager as
  `vehicle-in-need-gemini:latest`
2. **Secret Injection**: Cloud Run automatically injects the secret at runtime
  via the `--update-secrets` flag in `cloudbuild.yaml`
3. **Access Pattern**: The Node.js server accesses the key via
  `process.env.API_KEY`
4. **Security**: The key is never written to disk or exposed in environment
variables visible to the client

#### Verification

To verify the secret is properly configured:

```bash
# Check Cloud Run service configuration
gcloud run services describe pre-order-dealer-exchange-tracker \
  --region=us-west1 \
  --format="value(spec.template.spec.containers[0].env)"
```

Expected output should show `valueSource.secretKeyRef` instead of plaintext
values.

### Local Development

#### Option 1: Using Application Default Credentials (Recommended)

For local development with actual AI features:

1. Install and authenticate with gcloud:

   ```bash
   gcloud auth application-default login
   gcloud config set project vehicles-in-need
   ```

2. Ensure you have Vertex AI API enabled and proper IAM permissions

3. Run the development server:

   ```bash
   npm run dev
   npm run server  # In a separate terminal
   ```

#### Option 2: Mock/Fallback Mode

If you don't need AI features locally:

1. Set environment variable to disable Vertex AI:

   ```bash
   export DISABLE_VERTEX_AI=true
   npm run server
   ```

2. The AI features will return 503 errors, but the rest of the app will work

### Architecture

```text
┌─────────────┐
│   Browser   │
│   (Client)  │
└──────┬──────┘
       │ /api/generate-email
       │ (No API key sent)
       ▼
┌─────────────────┐
│  Express Server │
│  server/index.cjs │◄─── process.env.API_KEY (from Secret Manager)
└────────┬────────┘
         │
         ▼
┌──────────────────┐
│  aiProxy.cjs     │
│  (Vertex AI SDK) │
└────────┬─────────┘
         │
         ▼
┌────────────────────┐
│  Google Vertex AI  │
│  (gemini-2.0-flash)│
└────────────────────┘
```

### Key Files

- **`server/aiProxy.cjs`**: AI proxy that uses Vertex AI SDK with Application
  Default Credentials
- **`services/geminiService.ts`**: Client-side service that calls the server
  proxy (no API key)
- **`Dockerfile`**: Multi-stage build that excludes API keys from the image
- **`cloudbuild.yaml`**: Cloud Build configuration with secret injection

### Security Best Practices

1. ✅ **Server-Side Only**: All AI API calls go through the server
2. ✅ **No Client Exposure**: API keys never appear in client-side code or
  bundles
3. ✅ **Secret Manager**: Production uses Google Cloud Secret Manager
4. ✅ **ADC for Local**: Local development uses Application Default Credentials
5. ✅ **No Hardcoded Keys**: No API keys committed to the repository
6. ✅ **Build-time Protection**: Dockerfile doesn't accept API key build
arguments

### Rotating Secrets

To rotate the API key:

1. Create a new version of the secret in Secret Manager:

   ```bash
   echo -n "NEW_API_KEY_HERE" | gcloud secrets versions add vehicle-in-need-gemini --data-file=-
   ```

2. Redeploy the Cloud Run service (it automatically picks up the `:latest`
  version):

   ```bash
   gcloud builds submit --config cloudbuild.yaml
   ```

### Conflict Marker Protection

To prevent accidental deployment of files with merge conflict markers:

- **Prebuild Check**: The `prebuild` script in `package.json` runs before every
  build
- **Cloud Build Guard**: The first step in `cloudbuild.yaml` checks for
  conflict markers
- **Fail Fast**: Build fails immediately if markers are detected

### Testing

To test the AI proxy locally:

```bash
# Start the server
npm run server

# In another terminal, test the endpoint
curl -X POST http://localhost:8080/api/generate-email \
  -H "Content-Type: application/json" \
  -d '{"order": {"id": "test", "customerName": "John Doe", "model": "RX 350", "year": "2025", "status": "Factory Order", "salesperson": "Jane Smith", "depositAmount": 5000, "msrp": 50000}}'
```

### Troubleshooting

#### "AI service temporarily unavailable"

**Cause**: Vertex AI is not initialized or credentials are missing

**Solutions**:

1. Check Application Default Credentials: `gcloud auth application-default
  print-access-token`
2. Verify project: `gcloud config get-value project`
3. Enable Vertex AI API: `gcloud services enable aiplatform.googleapis.com`
4. Check IAM permissions: User/service account needs `aiplatform.user` role

#### "Permission denied" errors

**Cause**: IAM permissions issue

**Solution**: Grant the Cloud Run service account the required role:

```bash
gcloud projects add-iam-policy-binding vehicles-in-need \
  --member="serviceAccount:SERVICE_ACCOUNT_EMAIL" \
  --role="roles/aiplatform.user"
```

### Build Verification

After building, verify no Gemini API secrets leaked into the bundle:

```bash
npm run build
grep -r "VITE_GEMINI_API_KEY" dist/ || echo "✓ No VITE_GEMINI_API_KEY in dist/"
```

Expected output: `✓ No VITE_GEMINI_API_KEY in dist/`

**Note:** Firebase Web SDK API keys (AIza...) are expected in dist/ and are
safe - they're protected by Firebase Security Rules.

## Automated UI Audit & Merge Marker Guard

### Overview (Automated Guards)

The repository includes automated guards to prevent deployment issues:

1. **Merge Conflict Marker Detection**: Prevents builds with unresolved merge
  conflicts
2. **Secret Scanning**: Ensures no API keys are exposed in production bundles
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

The audit checks for:

- `VITE_GEMINI_API_KEY` - Gemini API key environment variable (should never be
  in dist/)

**Note on Firebase API Keys:**
Firebase Web SDK API keys (starting with `AIza`) are expected in the production
bundle. These are NOT secrets:

- They are designed to be public and included in client-side code
- They are protected by Firebase Security Rules
- They only grant access to public Firebase APIs
- The actual security is enforced server-side via Firestore Rules

The audit specifically looks for `VITE_GEMINI_API_KEY` which would indicate the
Gemini AI API key was accidentally included at build time.

If found, the audit fails and prevents deployment.

## Related Documentation

- [Deployment Checklist](../DEPLOYMENT_CHECKLIST.md)
- [Docker Build Notes](../DOCKER_BUILD_NOTES.md)
- [Manual Testing Steps](../MANUAL_TESTING_STEPS.md)
