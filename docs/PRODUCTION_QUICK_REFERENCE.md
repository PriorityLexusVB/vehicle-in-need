# Production Deployment - Quick Reference

This document provides quick reference commands for verifying and managing the production deployment.

## Production URL

**Important**: Cloud Run URLs are dynamic and can change if the service is recreated.

**To get the current production URL:**
```bash
gcloud run services describe pre-order-dealer-exchange-tracker \
  --region=us-west1 \
  --project=gen-lang-client-0615287333 \
  --format='value(status.url)'
```

**Example URL**: `https://pre-order-dealer-exchange-tracker-rbnzfidp7q-uw.a.run.app`

This URL is automatically updated when code is pushed to the `main` branch.

---

## Quick Verification Commands

### Verify Everything
```bash
# Run comprehensive production state verification
npm run verify:production
```

### Verify Specific Aspects

```bash
# Check if production matches local code
npm run verify:parity

# Verify CSS in local build
npm run build
npm run verify:css

# Test deployed CSS accessibility
bash scripts/test-deployed-css.sh https://pre-order-dealer-exchange-tracker-842946218691.us-west1.run.app/

# Check Cloud Build trigger configuration
npm run cloudbuild:verify-trigger

# List all Cloud Build triggers
npm run cloudbuild:list-triggers
```

---

## Deployment Process

### Automatic (Recommended)

1. Commit code to a feature branch
2. Open PR to `main`
3. Wait for CI checks to pass
4. Merge PR to `main`
5. Cloud Build automatically triggers
6. Deployment completes in ~5-10 minutes

**Monitor deployment:**
```bash
# View recent builds
gcloud builds list --project=gen-lang-client-0615287333 --limit=5

# Follow specific build
gcloud builds log <BUILD_ID> --stream
```

### Manual (If Needed)

```bash
# Ensure on main branch
git checkout main
git pull origin main

# Build locally to verify
npm ci
npm run build

# Submit to Cloud Build
SHORT_SHA=$(git rev-parse --short HEAD)
gcloud builds submit \
  --config=cloudbuild.yaml \
  --substitutions=_REGION=us-west1,_SERVICE=pre-order-dealer-exchange-tracker,SHORT_SHA=$SHORT_SHA
```

---

## Verification After Deployment

```bash
# 1. Check service health
curl -I https://pre-order-dealer-exchange-tracker-842946218691.us-west1.run.app/health
# Expected: HTTP/2 200

# 2. Check deployed version
curl -s https://pre-order-dealer-exchange-tracker-842946218691.us-west1.run.app/api/status | jq
# Expected: {"version":"<commit-sha>","environment":"production",...}

# 3. Verify CSS is accessible
npm run verify:production
# Expected: All checks pass

# 4. Visual check in browser
# Open: https://pre-order-dealer-exchange-tracker-842946218691.us-west1.run.app/
# Verify: Tailwind styles applied (not unstyled HTML)
```

---

## Troubleshooting

### Build Failures

**Check build logs:**
```bash
gcloud builds list --project=gen-lang-client-0615287333 --limit=1
gcloud builds log <BUILD_ID>
```

**Common issues:**
- Merge conflict markers in code → Fix conflicts and commit
- CSS verification failed → Check Tailwind config and postcss setup
- SERVICE_URL error → Remove SERVICE_URL from trigger substitutions

### CSS Not Showing

**Verify CSS in build:**
```bash
npm run build
npm run verify:css
```

**Check production CSS:**
```bash
bash scripts/test-deployed-css.sh https://pre-order-dealer-exchange-tracker-842946218691.us-west1.run.app/
```

**If CSS missing:**
1. Check `tailwind.config.js` content paths
2. Verify `src/index.css` has `@tailwind` directives
3. Confirm `postcss.config.js` has `@tailwindcss/postcss`
4. Rebuild and redeploy

### Version Mismatch

**Check deployed version:**
```bash
curl -s https://pre-order-dealer-exchange-tracker-842946218691.us-west1.run.app/api/status | jq -r '.version'
```

**Check local version:**
```bash
git rev-parse --short HEAD
```

**If mismatch:**
- Wait for current deployment to complete (check Cloud Build)
- Verify trigger is enabled and working
- Check if deployment failed (review build logs)

### Rollback

**If production has issues:**
```bash
# List recent revisions
gcloud run revisions list \
  --service=pre-order-dealer-exchange-tracker \
  --region=us-west1 \
  --limit=10

# Rollback to previous revision
gcloud run services update-traffic pre-order-dealer-exchange-tracker \
  --region=us-west1 \
  --to-revisions=<PREVIOUS_REVISION>=100
```

---

## Key Files

### Configuration
- `cloudbuild.yaml` - Cloud Build pipeline
- `Dockerfile` - Container image build
- `tailwind.config.js` - Tailwind CSS config
- `vite.config.ts` - Vite build config
- `package.json` - Build scripts

### Verification Scripts
- `scripts/verify-production-state.sh` - Comprehensive verification
- `scripts/verify-css-in-build.sh` - Post-build CSS check
- `scripts/test-deployed-css.sh` - Production CSS test
- `scripts/verify-deploy-parity.cjs` - Version verification
- `scripts/verify-cloud-build-config.sh` - Trigger config check

### Documentation
- `docs/DEPLOYMENT_RUNBOOK.md` - Complete deployment guide
- `docs/CSS_EXECUTION_FINAL.md` - CSS & deployment summary
- `docs/operations/CLOUD_BUILD_TRIGGER_RUNBOOK.md` - Trigger management
- `DEPLOYMENT_GUIDE.md` - High-level guide

---

## Support

**For issues:**
1. Check this guide
2. Review runbooks in `docs/operations/`
3. Run `npm run verify:production` for diagnostics
4. Check Cloud Build logs in GCP Console
5. Open GitHub issue with logs and error details

**GCP Project**: gen-lang-client-0615287333  
**Repository**: https://github.com/PriorityLexusVB/vehicle-in-need
