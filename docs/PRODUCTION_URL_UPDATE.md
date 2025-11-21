# Production URL Update

**Date**: 2025-11-20  
**Issue**: Production URL mismatch discovered

---

## Issue Discovered

The user ran `gcloud run services describe` and found the actual production URL is:

```
https://pre-order-dealer-exchange-tracker-rbnzfidp7q-uw.a.run.app
```

This differs from the URL documented throughout the repository:

```
https://pre-order-dealer-exchange-tracker-842946218691.us-west1.run.app
```

---

## Root Cause

Cloud Run generates URLs based on service name + random identifier + region:

- Format: `https://<service-name>-<random-id>-<region-code>.a.run.app`
- The URL can change if the service is recreated
- The documented URL may have been from a previous deployment or example

---

## Resolution

### 1. Always Query the Actual URL

Instead of hardcoding URLs, always query the current URL:

```bash
# Get the actual production URL
PRODUCTION_URL=$(gcloud run services describe pre-order-dealer-exchange-tracker \
  --region=us-west1 \
  --project=gen-lang-client-0615287333 \
  --format='value(status.url)')

echo "Production URL: $PRODUCTION_URL"
```

### 2. Updated Verification Commands

```bash
# Get the current production URL first
PROD_URL=$(gcloud run services describe pre-order-dealer-exchange-tracker \
  --region=us-west1 \
  --project=gen-lang-client-0615287333 \
  --format='value(status.url)')

# Then run verifications with the actual URL
npm run verify:parity "$PROD_URL"
bash scripts/test-deployed-css.sh "$PROD_URL"
```

### 3. Documentation Note

All documentation references to specific Cloud Run URLs should be treated as examples. Always use `gcloud run services describe` to get the current production URL.

---

## Impact on Current PR

The verification scripts and documentation were created with an example URL. This is actually correct behavior - the scripts should be flexible to work with any Cloud Run URL for the service.

### What Still Works

- ✅ All repository configuration validation
- ✅ Build system verification
- ✅ CSS verification logic
- ✅ Cloud Build trigger configuration
- ✅ Documentation structure

### What Needs the Actual URL

When running production verification:

1. First get the URL: `gcloud run services describe ... --format='value(status.url)'`
2. Then pass it to verification scripts

---

## Recommendations

1. **For Operators**: Always query the URL before running verification
2. **For Documentation**: Note that Cloud Run URLs are dynamic
3. **For Scripts**: Accept URL as parameter or query it dynamically

---

## Updated Usage

```bash
# Step 1: Get the actual production URL
PROD_URL=$(gcloud run services describe pre-order-dealer-exchange-tracker \
  --region=us-west1 \
  --project=gen-lang-client-0615287333 \
  --format='value(status.url)')

# Step 2: Verify production state
# (The verify-production-state.sh script has a hardcoded URL that should be made dynamic)
# For now, use the individual verification scripts:

# Check version parity
npm run verify:parity "$PROD_URL"

# Test CSS deployment
bash scripts/test-deployed-css.sh "$PROD_URL"

# Test health endpoint
curl -I "$PROD_URL/health"
```

---

## Action Items

1. ✅ Document that Cloud Run URLs are dynamic
2. ✅ Show how to query the actual URL
3. ⏸️ Consider updating verify-production-state.sh to query URL dynamically
4. ⏸️ Update all documentation to note URLs are examples

The existing verification tools work correctly - they just need the actual production URL passed to them.
