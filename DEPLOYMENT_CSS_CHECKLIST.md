# Deployment CSS Troubleshooting Checklist

## Problem
Tailwind CSS styles not appearing in deployed Cloud Run application, causing UI to fall back to default browser styles (purple links, black borders).

## Root Cause Analysis

The issue occurs when:
1. CSS file is generated during build but not deployed
2. Stale Docker image is deployed with old asset hashes
3. Service worker or browser cache serves outdated bundles
4. Static file serving is misconfigured

## Pre-Deployment Verification

### 1. Verify Local Build
```bash
npm run build
```

Expected output:
```
dist/assets/index-<hash>.css    ~10 kB │ gzip: ~2 kB
```

The `postbuild` script automatically verifies CSS presence.

### 2. Check CSS Content
```bash
head -20 dist/assets/index-*.css
```

Should see Tailwind utility classes starting with `tw-` or CSS custom properties like `--tw-rotate-x`.

### 3. Verify HTML References CSS
```bash
grep "\.css" dist/index.html
```

Should show:
```html
<link rel="stylesheet" crossorigin href="/assets/index-<hash>.css">
```

## Deployment Steps

### 1. Build Docker Image
```bash
gcloud builds submit --config cloudbuild.yaml \
  --substitutions _REGION=us-west1,_SERVICE=pre-order-dealer-exchange-tracker,SHORT_SHA=$(git rev-parse --short HEAD)
```

The Dockerfile includes:
- `RUN npm run build` in builder stage (includes CSS verification)
- `COPY --from=builder /app/dist ./dist` to include assets

### 2. Verify Image Contains CSS
```bash
# Get the latest image
IMAGE="us-west1-docker.pkg.dev/gen-lang-client-0615287333/vehicle-in-need/pre-order-dealer-exchange-tracker:latest"

# Check container contents (if you can run locally)
docker run --rm -it $IMAGE sh -c "ls -lah /app/dist/assets/*.css"
```

### 3. Check Deployed Service
After deployment completes:

```bash
# Get service URL
URL=$(gcloud run services describe pre-order-dealer-exchange-tracker \
  --region=us-west1 --format='value(status.url)')

# Check if CSS file is accessible
curl -I "$URL/assets/index-<hash>.css"
```

Should return `HTTP/2 200` with `Content-Type: text/css`.

## Post-Deployment Verification

### 1. Browser DevTools Check
1. Open the deployed app in browser
2. Open DevTools → Network tab
3. Hard refresh (Ctrl+Shift+R)
4. Filter by "CSS"
5. Verify you see `index-<hash>.css` with Status 200

### 2. Check Console Logs
Look for:
```
🚀 Application Bundle Info
Version: <commit-sha>
Build Time: <build-id>
```

If Version shows "unknown" or "dev", the build didn't inject version info correctly.

### 3. Verify Asset Hashes Match
The CSS filename hash should match the JS filename hash pattern.

Example:
- ✅ GOOD: `index-DNzTS1Bl.css` and `index-CPSmv2js.js` (both recent)
- ❌ BAD: `index-PBlrTBeX.css` and `index-CPSmv2js.js` (mismatched = stale)

## Common Issues & Solutions

### Issue 1: CSS File Not Generated
**Symptoms**: No `*.css` files in `dist/assets/`

**Solutions**:
1. Check `postcss.config.js` has `@tailwindcss/postcss` plugin
2. Verify `tailwind.config.js` content paths include all component files
3. Ensure `src/index.css` imports Tailwind directives
4. Check for PostCSS/Tailwind version conflicts

### Issue 2: CSS Not Copied to Docker Image
**Symptoms**: Build succeeds but deployed app has no CSS

**Solutions**:
1. Verify Dockerfile builder stage runs `npm run build`
2. Check `COPY --from=builder /app/dist ./dist` includes `/app/dist/assets`
3. Don't add `dist/` to `.dockerignore`

### Issue 3: Stale Deployment
**Symptoms**: Different asset hashes in deployed version vs local build

**Solutions**:
1. Deploy with new tag: `SHORT_SHA=$(date +%Y%m%d-%H%M%S)`
2. Clear Cloud Run cache by deploying with `--no-traffic` then migrate traffic
3. Force new image pull by updating Cloud Run revision

### Issue 4: Browser/Service Worker Cache
**Symptoms**: CSS works in Incognito but not in normal browser

**Solutions**:
1. Hard refresh: Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (Mac)
2. Clear site data: DevTools → Application → Clear storage
3. The app includes SW cleanup code in `index.html` and `src/main.tsx`

### Issue 5: Static File Serving Misconfigured
**Symptoms**: CSS file exists but returns 404

**Solutions**:
1. Check `server/index.cjs` has `express.static(distPath)`
2. Verify cache headers don't prevent asset loading
3. Check nginx.conf if using nginx (not applicable for Node server)

## Monitoring & Logging

### Server-Side Logs
Check Cloud Run logs for static file requests:
```bash
gcloud logging read "resource.type=cloud_run_revision AND \
  resource.labels.service_name=pre-order-dealer-exchange-tracker" \
  --limit 50 --format json | jq '.[] | select(.httpRequest.requestUrl | contains(".css"))'
```

### Client-Side Diagnostics
Add to browser console:
```javascript
// Check if CSS loaded
const cssLinks = document.querySelectorAll('link[rel="stylesheet"]');
console.log('CSS Links:', Array.from(cssLinks).map(l => ({
  href: l.href,
  loaded: l.sheet !== null,
  disabled: l.disabled
})));

// Check Tailwind classes applied
const body = document.body;
const computedStyle = getComputedStyle(body);
console.log('Body background:', computedStyle.backgroundColor);
// Should be slate-100: rgb(241, 245, 249)
```

## Quick Fix for Stale Deployment

If you need to force a fresh deployment immediately:

```bash
# 1. Rebuild with new timestamp
npm run build

# 2. Deploy with fresh tag
gcloud builds submit --config cloudbuild.yaml \
  --substitutions SHORT_SHA="force-$(date +%Y%m%d-%H%M%S)"

# 3. Wait for deployment
gcloud run services wait pre-order-dealer-exchange-tracker --region=us-west1

# 4. Test in Incognito window
echo "Test URL: $(gcloud run services describe pre-order-dealer-exchange-tracker \
  --region=us-west1 --format='value(status.url)')"
```

## Prevention

To avoid this issue in future deployments:

1. ✅ Always run `npm run build` to verify CSS locally
2. ✅ Check Cloud Build logs for "postbuild" script output
3. ✅ Use commit SHA as image tag (already configured)
4. ✅ Test in Incognito window after each deployment
5. ✅ Monitor asset hash patterns in console logs
6. ✅ Set up automated E2E tests that check for CSS (future enhancement)

## Related Files

- `package.json` - Build scripts with CSS verification
- `scripts/verify-css-in-build.sh` - Post-build CSS validation
- `vite.config.ts` - Build configuration
- `postcss.config.js` - PostCSS/Tailwind processing
- `tailwind.config.js` - Tailwind content paths
- `src/index.css` - Tailwind directives
- `src/main.tsx` - CSS import and bundle info logging
- `Dockerfile` - Multi-stage build with CSS
- `server/index.cjs` - Static file serving
- `cloudbuild.yaml` - Cloud Build deployment
