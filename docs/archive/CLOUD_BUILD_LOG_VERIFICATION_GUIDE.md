# Cloud Build Log Verification Guide

## Purpose

This guide helps verify that the Cloud Build CSS verification step is working correctly by analyzing successful build logs.

## Successful Build Reference

**Build ID**: `06bb5060-a490-44e4-b21b-08cf09712a9f`  
**Project**: `gen-lang-client-0615287333`  
**Status**: SUCCESS (confirmed by user)

## How to Retrieve and Review Logs

### Option 1: Using gcloud CLI

```bash
# View full build log
gcloud builds log 06bb5060-a490-44e4-b21b-08cf09712a9f \
  --project=gen-lang-client-0615287333

# View only the verify-css-deployed step
gcloud builds log 06bb5060-a490-44e4-b21b-08cf09712a9f \
  --project=gen-lang-client-0615287333 | \
  grep -A 50 "verify-css-deployed"
```

### Option 2: Using GCP Console

1. Navigate to [Cloud Build History](https://console.cloud.google.com/cloud-build/builds)
2. Select project: `gen-lang-client-0615287333`
3. Find build: `06bb5060-a490-44e4-b21b-08cf09712a9f`
4. Click to view build details
5. Scroll to the `verify-css-deployed` step
6. Review the step logs

## What to Look For in the Logs

### 1. CSS Verification Step Output

The `verify-css-deployed` step should show:

```
🔍 Verifying CSS deployment...
Service URL: https://pre-order-dealer-exchange-tracker-[hash]-uw.a.run.app
Waiting 10 seconds for service to stabilize...
Fetching index.html...
Found CSS reference: /assets/index-[hash].css
Verifying CSS file is accessible: https://[service-url]/assets/index-[hash].css
✅ CSS verification passed!
   URL: https://[service-url]/assets/index-[hash].css
   HTTP Status: 200
   Size: [number] bytes
   Contains Tailwind: YES
   
🎉 Deployment verification complete - CSS is properly deployed!
```

### 2. Key Validations to Confirm

- [ ] **SERVICE_URL retrieved dynamically**: Look for line showing `gcloud run services describe` being executed
- [ ] **SERVICE_URL format**: Should be `https://pre-order-dealer-exchange-tracker-*.a.run.app` (Cloud Run URL format)
- [ ] **Index.html fetched**: Should show "Fetching index.html..." with no errors
- [ ] **CSS reference found**: Should extract a path like `/assets/index-*.css` or `/assets/*.css`
- [ ] **CSS file accessible**: HTTP status should be `200`
- [ ] **CSS size check**: Size should be > 1000 bytes (Tailwind CSS is substantial)
- [ ] **Tailwind verification**: Should find `tw-` or other Tailwind markers in CSS content

### 3. What Would Indicate a Problem

❌ **Error indicators**:

- `❌ ERROR: Could not fetch index.html` - Service not responding
- `❌ ERROR: No CSS file referenced in index.html` - Build didn't generate CSS reference
- `❌ ERROR: CSS file returned HTTP 404` - CSS file not deployed or wrong path
- `❌ ERROR: CSS file is too small` - CSS not properly generated
- `❌ ERROR: CSS file does not contain Tailwind` - Wrong CSS file or compilation issue

### 4. SERVICE_URL Usage Verification

**Critical**: Confirm that SERVICE_URL appears only in the bash script context, NOT as a substitution:

```bash
# This is CORRECT (bash variable):
SERVICE_URL=$(gcloud run services describe ${_SERVICE} ...)

# This would be WRONG (substitution):
# --substitutions=SERVICE_URL=https://... ❌
```

In the logs, you should see:

1. The substitutions passed to Cloud Build (should NOT include SERVICE_URL)
2. The `verify-css-deployed` step retrieving SERVICE_URL via gcloud command
3. SERVICE_URL being used in subsequent curl commands

## Enhanced CSS Verification (Current Implementation)

The current `cloudbuild.yaml` now has **more robust CSS verification**:

### Pattern Matching

- **Old**: Only matched `/assets/index-*.css`
- **New**: Matches `/assets/*.css` OR `/static/*.css`

### Tailwind Detection

- **Old**: Hard fail if no `tw-` prefix found
- **New**: Also accepts `tailwind` or `@tailwind` markers
- **New**: Warning instead of failure for edge cases

### Example Log Output (Updated Verification)

```
Found CSS reference: /assets/index-ABC123.css
# or
Found CSS reference: /static/main.css

Verifying CSS file is accessible: https://[service-url]/assets/index-ABC123.css
HTTP Status: 200
Size: 45678 bytes
Contains Tailwind: YES
# or
Contains Tailwind: UNCERTAIN (if markers aren't obvious but size is OK)
```

## Testing the Verification Locally

You can test the CSS verification logic locally:

```bash
# Build the application
npm run build

# Check CSS files were generated
ls -lh dist/assets/*.css

# Start the server
npm run server &

# Test CSS verification manually
curl -sS http://localhost:8080/ | grep -o '/assets/[^"]*\.css'
curl -I http://localhost:8080/assets/index-*.css
```

## Build Steps Order

The successful build should show these steps in order:

1. ✅ `check-conflicts` - Verify no merge conflict markers
2. ✅ `build-image` - Docker build with CSS generation
3. ✅ `push-image` - Push SHA-tagged image
4. ✅ `push-latest` - Push latest tag
5. ✅ `deploy-cloud-run` - Deploy to Cloud Run
6. ✅ `verify-css-deployed` - **This is where SERVICE_URL is retrieved and used**

## Substitutions Actually Used

The build should show these substitutions were passed:

```yaml
substitutions:
  _REGION: us-west1
  _SERVICE: pre-order-dealer-exchange-tracker
  SHORT_SHA: [commit-sha or manual-timestamp]
  PROJECT_ID: gen-lang-client-0615287333  # (built-in, auto-provided)
  BUILD_ID: [build-id]                     # (built-in, auto-provided)
```

**Notably absent**: `SERVICE_URL` ✅

## Runtime Behavior to Verify

### 1. Deployment Process

- Cloud Run service gets updated with new image
- Service URL remains stable (same domain)
- New revision is created and becomes primary

### 2. CSS Accessibility

- CSS file is served with correct Content-Type: `text/css`
- CSS file is cacheable (has cache headers)
- CSS file contains expected Tailwind utility classes

### 3. Application Behavior

- Index.html references the hashed CSS file
- Browser loads CSS successfully
- No console errors about missing CSS
- Tailwind classes are applied (no unstyled content)

## Common Issues and Their Log Signatures

### Issue: CSS File Not Found (404)

```
❌ ERROR: CSS file returned HTTP 404
CSS URL: https://[service-url]/assets/index-ABC123.css
```

**Cause**: Build process didn't copy CSS to the right location  
**Fix**: Check Dockerfile COPY commands and nginx.conf

### Issue: CSS File Empty or Tiny

```
❌ ERROR: CSS file is too small (234 bytes)
Expected at least 1000 bytes
```

**Cause**: CSS generation failed or Tailwind not configured  
**Fix**: Check Vite/Tailwind build configuration

### Issue: Service Not Ready

```
❌ ERROR: Could not fetch index.html from https://[service-url]
```

**Cause**: Service hasn't fully started or is unhealthy  
**Fix**: May need longer wait time or check Cloud Run logs

## Next Steps After Log Review

1. [ ] Confirm SERVICE_URL was retrieved dynamically (not passed as substitution)
2. [ ] Verify CSS verification step passed all checks
3. [ ] Check CSS file is the expected size (should be 20KB+ for production Tailwind)
4. [ ] Confirm Tailwind classes are present in the CSS content
5. [ ] Test the deployed application in a browser to verify visual styling

## Automated Verification

The repository now includes automated checks:

```bash
# Check Cloud Build configuration
npm run lint:cloudbuild

# Verify Cloud Build trigger configuration (requires gcloud auth)
./scripts/verify-cloud-build-config.sh

# Check CSS in local build
npm run verify:css
```

These checks run automatically in CI to prevent regression.

## Related Documentation

- [cloudbuild.yaml](./cloudbuild.yaml) - Build configuration with CSS verification
- [GCP_MANUAL_CONFIGURATION_CHECKLIST.md](./GCP_MANUAL_CONFIGURATION_CHECKLIST.md) - Complete setup guide
- [CLOUD_BUILD_SERVICE_URL_FIX.md](./CLOUD_BUILD_SERVICE_URL_FIX.md) - SERVICE_URL explanation
- [scripts/check-cloudbuild-service-url.sh](./scripts/check-cloudbuild-service-url.sh) - Static analysis guardrail

---

**Last Updated**: 2025-11-18  
**Build Reference**: `06bb5060-a490-44e4-b21b-08cf09712a9f`  
**Status**: Ready for log verification by user with GCP access
