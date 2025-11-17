# CSS Loading Issue - Quick Fix Guide

## Problem Summary

The deployed Cloud Run service shows default browser styles instead of Tailwind CSS, with purple links and black borders. However, local builds correctly generate and include CSS files.

## Root Cause

The deployed version is serving a **stale build**. The console logs show asset hash `index-PBlrTBeX.js`, but fresh local builds generate different hashes (e.g., `index-DlazGtSi.js`). This indicates the deployment is using an outdated Docker image.

## Immediate Fix

### Option 1: Full Rebuild and Redeploy (Recommended)

```bash
# 1. Build and deploy with Cloud Build
gcloud builds submit --config cloudbuild.yaml \
  --substitutions SHORT_SHA=$(git rev-parse --short HEAD)

# 2. Wait for deployment to complete
gcloud run services wait pre-order-dealer-exchange-tracker --region=us-west1

# 3. Get the service URL
SERVICE_URL=$(gcloud run services describe pre-order-dealer-exchange-tracker \
  --region=us-west1 --format='value(status.url)')

# 4. Test the deployment
bash scripts/test-deployed-css.sh $SERVICE_URL

# 5. Open in Incognito window to bypass browser cache
echo "Test in browser: $SERVICE_URL"
```

### Option 2: Force Fresh Deployment

```bash
# Use timestamp to force new image
gcloud builds submit --config cloudbuild.yaml \
  --substitutions SHORT_SHA="fix-$(date +%Y%m%d-%H%M%S)"
```

## Verification Steps

### 1. Check Local Build (Already Working ✅)

```bash
npm run build
# Should output:
# ✅ Found 1 CSS file(s): index-<hash>.css (12K)
# ✅ CSS contains Tailwind utility classes
```

### 2. Check Deployed Service

After redeployment, open the app and check browser console:

**Expected Output:**

```
🚀 Application Bundle Info
Version: <commit-sha>
Build Time: <build-id>

📦 CSS Resources
Total CSS links: 1
  ✅ [1] https://.../assets/index-<hash>.css - Loaded
✅ Tailwind styles applied successfully
```

**If CSS Fails:**

```
❌ CSS LOAD FAILURE: https://.../assets/index-<hash>.css
Possible causes:
  1. File not deployed to server (check dist/assets/)
  2. 404 error (check Network tab)
  3. CORS or security policy blocking CSS
  4. Stale service worker or browser cache
```

### 3. Manual Browser Check

1. Open DevTools → Network tab
2. Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
3. Look for `index-<hash>.css` with Status 200
4. Check the file size is ~10KB (not 0 bytes)
5. Preview the CSS content - should see Tailwind classes

## Why This Happened

The CSS file **is being generated correctly** in builds:

- ✅ Vite build outputs CSS: `dist/assets/index-<hash>.css` (9.91 kB)
- ✅ HTML references CSS: `<link rel="stylesheet" href="/assets/index-<hash>.css">`
- ✅ CSS contains Tailwind v4 utility classes
- ✅ PostCSS and Tailwind configs are correct
- ✅ Dockerfile includes `npm run build` step

However, the **deployed version uses different asset hashes**, meaning an old Docker image is running in Cloud Run.

Common causes:

1. Cloud Build failed silently and deployed cached image
2. Deployment used `:latest` tag with stale image
3. Multiple deployments in quick succession caused race condition
4. Docker layer cache reused old build

## Prevention

The following safeguards are now in place:

### 1. Automatic CSS Verification (`postbuild` script)

Every build now automatically verifies:

- CSS file exists in dist/assets/
- CSS contains Tailwind classes
- HTML references CSS correctly

If verification fails, the build fails (preventing deployment of broken builds).

### 2. Enhanced Diagnostic Logging

The browser console now shows:

- All CSS link elements and their load status
- Whether Tailwind styles are applied
- Detailed error messages if CSS fails to load

### 3. Cache-Busting Meta Tags

HTML now includes:

```html
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
<meta http-equiv="Pragma" content="no-cache" />
<meta http-equiv="Expires" content="0" />
```

This prevents browsers and proxies from caching stale HTML that references old CSS files.

### 4. Deployment Verification Tools

**Manual CSS Check:**

```bash
npm run verify:css
```

**Test Deployed Service:**

```bash
bash scripts/test-deployed-css.sh https://your-service-url.run.app
```

## Detailed Troubleshooting

See [DEPLOYMENT_CSS_CHECKLIST.md](./DEPLOYMENT_CSS_CHECKLIST.md) for:

- Complete deployment checklist
- Common issues and solutions
- Monitoring and logging instructions
- Docker image verification steps
- Service worker cache clearing

## Summary

**The Problem:** Deployed version uses stale Docker image with old asset hashes.

**The Solution:** Redeploy using Cloud Build to generate fresh image with current CSS files.

**The Prevention:** Automatic CSS verification, enhanced diagnostics, and cache-busting.

## Testing This Fix

After deploying these changes:

1. The build will automatically verify CSS presence
2. Browser console will show detailed CSS diagnostics
3. Cache-busting meta tags will prevent stale HTML
4. You can use `test-deployed-css.sh` to verify remotely

This ensures future deployments always include CSS and makes debugging much easier.
