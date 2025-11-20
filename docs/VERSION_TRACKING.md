# Version Tracking and Deployment Traceability

## Overview

This document explains how the Vehicle-in-Need application ensures that all production deployments are traceable to specific git commits, preventing "manual deployment" states and version mismatches.

## Problem Statement

Previously, the deployment system allowed:
- Manual deployments with arbitrary version strings (e.g., `manual-20241120-1430`)
- Deployments where `APP_VERSION` was "unknown"
- No enforcement that deployments must come from tracked commits

This led to situations where:
- Production showed "manual deployment" instead of a git commit SHA
- Version mismatches between production and the main branch
- Inability to determine exactly what code was running in production

## Solution

The system now enforces version traceability through multiple layers:

### 1. Cloud Build Validation

**File**: `cloudbuild.yaml`

A new validation step (`validate-version`) runs before building the Docker image:

```yaml
- name: gcr.io/cloud-builders/gcloud
  id: validate-version
  waitFor: ['check-conflicts']
  entrypoint: bash
  args:
    - -c
    - |
      # Reject deployments with "manual" prefix
      if [[ "${SHORT_SHA}" =~ ^manual ]]; then
        echo "❌ ERROR: Manual deployment versions are not allowed!"
        exit 1
      fi
      
      # Warn if not standard git SHA format
      if ! [[ "${SHORT_SHA}" =~ ^[a-fA-F0-9]{7,40}$ ]]; then
        echo "⚠️  WARNING: SHORT_SHA does not match standard git commit format"
      fi
```

This step:
- **Blocks** any deployment where `SHORT_SHA` starts with "manual"
- **Warns** if `SHORT_SHA` doesn't match standard git commit SHA format (7-40 hex characters)
- **Passes** valid git commit SHAs

### 2. GitHub Actions Integration

**File**: `.github/workflows/build-and-deploy.yml`

The GitHub Actions workflow now:
1. Extracts the short SHA from the full GitHub commit SHA
2. Uses this consistently throughout the build and deployment
3. Verifies the deployed version matches the expected commit

```yaml
- name: Submit build to Cloud Build
  run: |
    SHORT_SHA=$(echo "${{ github.sha }}" | cut -c1-7)
    BUILD_ID=$(gcloud builds submit \
      --config cloudbuild.yaml \
      --substitutions=SHORT_SHA=$SHORT_SHA,_REGION=${{ env.GCP_REGION }},_SERVICE=${{ env.SERVICE_NAME }})
```

### 3. Version Verification Script

**File**: `scripts/check-production-version.cjs`

A new script that verifies production version matches expected commit:

```bash
npm run verify:version
```

This script:
- Fetches the production version from `/api/status`
- Compares it to the latest commit on `origin/main`
- Detects "manual" deployments and reports them as errors
- Shows commit history to understand version differences

**Exit Codes**:
- `0` - Version matches expected commit
- `1` - Version mismatch or manual deployment detected
- `2` - Cannot verify (service unavailable)

### 4. Production Sync Script

**File**: `scripts/sync-production-with-main.sh`

A new script to synchronize production with a specific commit:

```bash
npm run sync:production
```

This script:
- Fetches the latest commit from `origin/main`
- Validates the commit exists in the repository
- Submits a Cloud Build with the proper git commit SHA
- Monitors the deployment
- Verifies the deployed version matches

**Features**:
- Can deploy a specific commit: `npm run sync:production -- <commit-sha>`
- Defaults to latest `origin/main` if no commit specified
- Shows commit details before deploying
- Requires user confirmation before deploying
- Verifies version after deployment

## Deployment Workflows

### Automatic Deployment (Recommended)

**Trigger**: Push to `main` branch

1. GitHub Actions detects push to `main`
2. Extracts commit SHA from GitHub context
3. Submits Cloud Build with proper `SHORT_SHA`
4. Cloud Build validates the version
5. Builds and deploys container with `APP_VERSION` set
6. Verifies deployment success

**Result**: Production version matches the commit SHA

### Manual Deployment (Testing Only)

**Use Case**: Deploy a specific commit for testing

```bash
# Get the commit you want to deploy
git checkout <branch-or-commit>
SHORT_SHA=$(git rev-parse --short HEAD)

# Submit build
gcloud builds submit \
  --config=cloudbuild.yaml \
  --substitutions=_REGION=us-west1,_SERVICE=pre-order-dealer-exchange-tracker,SHORT_SHA=$SHORT_SHA
```

**Important**: 
- Must use a real git commit SHA
- Cannot use `SHORT_SHA=manual-...` format
- Should only be used for testing, not production

### Recommended: Use Sync Script

```bash
npm run sync:production
```

This is the safest way to manually deploy because it:
- Automatically fetches latest from `origin/main`
- Validates the commit exists
- Uses proper version format
- Provides confirmation prompt
- Verifies deployment

## Version Checking

### Check Current Production Version

```bash
npm run verify:version
```

**Output Examples**:

✅ **Success** (versions match):
```
Production Version Verification
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Production Status
Environment: production
Version: f47420e
Build Time: 2024-11-20T01:23:45Z

Version Check: PASSED
✓ Production version matches expected commit!
  Production: f47420e
  Expected:   f47420e
```

❌ **Error** (manual deployment):
```
Production Status
Environment: production
Version: manual-20241120-1430

Version Check: FAILED
✗ Production shows MANUAL DEPLOYMENT!

Production version indicates a manual deployment, not a tracked git commit.

To fix this:
  1. Run: npm run sync:production
```

⚠️ **Warning** (version mismatch):
```
Production Status
Environment: production
Version: abc123d

Version Check: MISMATCH
⚠ Version mismatch detected
  Production: abc123d
  Expected:   f47420e

Production is 3 commit(s) behind expected commit

To sync production with latest main:
  npm run sync:production
```

### Comprehensive Production Verification

```bash
npm run verify:production
```

This runs the full `verify-production-state.sh` script which checks:
- Repository state
- Build system configuration
- Production service status
- CSS deployment
- Documentation
- Package.json scripts

## API Status Endpoint

The `/api/status` endpoint returns version information:

```json
{
  "status": "healthy",
  "geminiEnabled": true,
  "version": "f47420e",
  "buildTime": "2024-11-20T01:23:45Z",
  "nodeVersion": "v20.10.0",
  "environment": "production",
  "timestamp": "2024-11-20T02:15:30.123Z",
  "uptime": 3600
}
```

**Key Fields**:
- `version`: Git commit SHA (short form) - **should never be "manual" or "unknown"**
- `buildTime`: When the container was built
- `environment`: Should be "production" in production

## Environment Variables

### During Build (Dockerfile)

```dockerfile
ARG COMMIT_SHA=unknown
ENV APP_VERSION=$COMMIT_SHA
```

### During Deployment (Cloud Run)

```bash
--set-env-vars=NODE_ENV=production,APP_VERSION=$SHORT_SHA,BUILD_TIME=$BUILD_ID
```

### In Application (server/index.cjs)

```javascript
version: process.env.APP_VERSION || "unknown"
```

## Preventing Manual Deployments

### What is a "Manual Deployment"?

A manual deployment is one where the version is set to an arbitrary string like:
- `manual-20241120-1430`
- `manual-test-deployment`
- `dev-build`
- Any non-git-commit identifier

### Why Are They Problematic?

1. **Not traceable**: Cannot determine what code is deployed
2. **Not reproducible**: Cannot rebuild the exact same version
3. **Debugging difficulty**: Cannot checkout the code to investigate issues
4. **Rollback impossible**: Cannot revert to a previous known-good state

### How We Prevent Them

1. **Cloud Build validation**: Rejects `SHORT_SHA` starting with "manual"
2. **Documentation**: Updated to show correct deployment procedure
3. **Scripts**: Sync script always uses real git commits
4. **GitHub Actions**: Automatically uses GitHub commit SHA

## Troubleshooting

### Production Shows "manual" Version

**Cause**: Previous deployment used arbitrary version string

**Fix**:
```bash
npm run sync:production
```

This will redeploy from the latest `origin/main` commit with proper version tracking.

### Version is "unknown"

**Cause**: `APP_VERSION` environment variable was not set during deployment

**Check**:
1. Verify Cloud Run service environment variables:
   ```bash
   gcloud run services describe pre-order-dealer-exchange-tracker \
     --region=us-west1 \
     --format=yaml | grep -A 5 env:
   ```

2. Verify the deployment command includes `--set-env-vars=APP_VERSION=...`

**Fix**: Redeploy with proper environment variables:
```bash
npm run sync:production
```

### Version Mismatch Between Production and Main

**Cause**: Production is behind or ahead of main branch

**Check Difference**:
```bash
npm run verify:version
```

This will show:
- Current production version
- Expected version from `origin/main`
- Number of commits different
- Commit details

**Fix**: Deploy latest main:
```bash
npm run sync:production
```

### Cloud Build Fails with "Manual deployment versions not allowed"

**Cause**: Trying to deploy with `SHORT_SHA=manual-...`

**Fix**: Use a real git commit SHA:
```bash
SHORT_SHA=$(git rev-parse --short HEAD)
gcloud builds submit --config=cloudbuild.yaml \
  --substitutions=SHORT_SHA=$SHORT_SHA,...
```

Or better, use the sync script:
```bash
npm run sync:production
```

## Best Practices

### ✅ DO

1. **Always deploy from tracked commits**
   ```bash
   SHORT_SHA=$(git rev-parse --short HEAD)
   ```

2. **Use the sync script for manual deployments**
   ```bash
   npm run sync:production
   ```

3. **Verify version after deployment**
   ```bash
   npm run verify:version
   ```

4. **Keep main branch up to date**
   ```bash
   git pull origin main
   ```

5. **Use GitHub Actions for production deployments**
   - Let the automatic workflow handle production deploys
   - Manual deploys should be for testing only

### ❌ DON'T

1. **Never use arbitrary version strings**
   ```bash
   # BAD - will be rejected
   SHORT_SHA=manual-$(date +%Y%m%d-%H%M)
   ```

2. **Don't deploy without verification**
   - Always check version after deploying
   - Use `npm run verify:version`

3. **Don't skip the validation step**
   - The Cloud Build validation is there for a reason
   - Don't try to work around it

4. **Don't modify the version after deployment**
   - The version must match the deployed code
   - Don't manually change environment variables

## Summary

The version tracking system ensures that:

1. ✅ All production deployments are traceable to git commits
2. ✅ "Manual deployment" states are prevented
3. ✅ Version mismatches are detected and reported
4. ✅ Production can be synchronized with main branch easily
5. ✅ Deployment history is maintained in git

This provides:
- **Traceability**: Know exactly what code is running
- **Reproducibility**: Can rebuild any version
- **Debugging**: Can checkout the exact code to investigate
- **Rollback**: Can revert to previous versions
- **Confidence**: Production always matches a known git state
