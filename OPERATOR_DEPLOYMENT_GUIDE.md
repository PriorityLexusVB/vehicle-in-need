# Operator Deployment Guide

## Overview

This guide provides step-by-step instructions for operators to complete the deployment after merging the stabilization PR. All code changes are complete and tested. The following manual actions are required.

## Prerequisites

- Access to Google Cloud Console with appropriate permissions
- Firebase Admin SDK credentials (for custom claims)
- Appropriate IAM roles:
  - Cloud Build Editor (for trigger configuration)
  - Firebase Admin (for setting custom claims)

## Deployment Steps

### Step 1: Merge the PR ✅

**Action**: Merge the stabilization PR in GitHub

**Verification**: 
- All CI checks pass
- All tests pass (58/58 unit tests, 42/42 Firestore rules tests)
- Code review approved

**Command**: Use GitHub UI or:
```bash
gh pr merge <PR_NUMBER> --squash
```

---

### Step 2: Fix Cloud Build Trigger Configuration

**Issue**: The Cloud Build trigger may have an invalid `SERVICE_URL` substitution variable configured.

**Root Cause**: `SERVICE_URL` is a bash variable computed at runtime, not a Cloud Build substitution.

**Action**: Remove `SERVICE_URL` from trigger substitutions if present

#### Steps:

1. Go to [Google Cloud Console > Cloud Build > Triggers](https://console.cloud.google.com/cloud-build/triggers)

2. Find the trigger named `vehicle-in-need-deploy`

3. Click **Edit** on the trigger

4. In the **Substitution variables** section:
   - ✅ **Keep**: `_REGION` (e.g., `us-west1`)
   - ✅ **Keep**: `_SERVICE` (e.g., `pre-order-dealer-exchange-tracker`)
   - ❌ **Remove**: `SERVICE_URL` (if present)

5. Click **Save**

#### Verification:

Test the trigger configuration:

```bash
gcloud builds submit --config cloudbuild.yaml \
  --substitutions _REGION=us-west1,_SERVICE=pre-order-dealer-exchange-tracker,SHORT_SHA=test-$(date +%Y%m%d-%H%M)
```

Should complete without errors about `SERVICE_URL`.

**Reference**: See [CLOUD_BUILD_TRIGGER_FIX.md](./CLOUD_BUILD_TRIGGER_FIX.md) for details.

---

### Step 3: Set Custom Claims for Production Managers

**Issue**: Firestore security rules require `request.auth.token.isManager` custom claim for manager operations.

**Root Cause**: Previous implementation used `get()` calls to check Firestore documents, causing circular dependencies.

**Action**: Set custom claims for all production managers

#### Option A: Use the Helper Script (Recommended)

We provide a script that sets both Firestore fields AND custom claims:

```bash
# Authenticate with Application Default Credentials
gcloud auth application-default login

# Dry run to preview changes
node scripts/set-manager-custom-claims.mjs \
  --project vehicles-in-need \
  --dry-run \
  --emails manager1@priorityautomotive.com,manager2@priorityautomotive.com

# Apply changes
node scripts/set-manager-custom-claims.mjs \
  --project vehicles-in-need \
  --apply \
  --emails manager1@priorityautomotive.com,manager2@priorityautomotive.com

# OR sync all existing managers from Firestore
node scripts/set-manager-custom-claims.mjs \
  --project vehicles-in-need \
  --apply \
  --sync-from-firestore
```

#### Option B: Manual Approach (Firebase Admin SDK)

If you prefer to use the Firebase Admin SDK directly:

```javascript
const admin = require('firebase-admin');

// Initialize (if not already done)
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: 'vehicles-in-need'
});

// Set manager claim for a specific user
async function setManagerClaim(uid) {
  await admin.auth().setCustomUserClaims(uid, { isManager: true });
  console.log(`✅ Set custom claim for user ${uid}`);
}

// Example: Set claim for a user by email
async function setManagerByEmail(email) {
  const user = await admin.auth().getUserByEmail(email);
  await admin.auth().setCustomUserClaims(user.uid, { isManager: true });
  console.log(`✅ Set custom claim for ${email} (${user.uid})`);
}

// Verify custom claim was set
async function verifyManagerClaim(uid) {
  const user = await admin.auth().getUser(uid);
  console.log('Custom claims:', user.customClaims);
  // Should output: { isManager: true }
}
```

#### Important Notes:

⚠️ **Client Token Refresh Required**: After setting custom claims, users MUST refresh their auth token:

```javascript
// In client code (users must do this)
const user = firebase.auth().currentUser;
await user.getIdToken(true);  // Force refresh token

// OR: Sign out and sign back in
await firebase.auth().signOut();
```

⚠️ **Domain Restriction**: Only `@priorityautomotive.com` emails are allowed by the helper script.

#### Verification:

1. Check that custom claim is set:
   ```javascript
   const user = await admin.auth().getUser(uid);
   console.log(user.customClaims); // Should show { isManager: true }
   ```

2. Test in application:
   - Manager user signs out and back in
   - Manager should be able to:
     - View all users
     - Update user roles
     - View, update, and delete all orders

**Reference**: See [FIRESTORE_RULES_CUSTOM_CLAIMS.md](./FIRESTORE_RULES_CUSTOM_CLAIMS.md) for details.

---

### Step 4: Deploy to Production

**Action**: Deploy the application to Cloud Run

#### Command:

```bash
gcloud builds submit --config cloudbuild.yaml \
  --substitutions _REGION=us-west1,_SERVICE=pre-order-dealer-exchange-tracker
```

#### What This Does:

1. ✅ Checks for merge conflict markers
2. 🏗️ Builds Docker container image
3. 📤 Pushes image to Artifact Registry
4. 🚀 Deploys to Cloud Run service
5. ✅ Verifies CSS files are accessible

#### Expected Output:

```
✓ No conflict markers detected
✓ Built Docker image
✓ Pushed to Artifact Registry
✓ Deployed to Cloud Run
✓ CSS verification passed!
   HTTP Status: 200
   Size: ~10KB
   Contains Tailwind: YES

🎉 Deployment verification complete!
```

#### Verification:

1. Check Cloud Run service is running:
   ```bash
   gcloud run services describe pre-order-dealer-exchange-tracker \
     --region=us-west1 \
     --format='value(status.url)'
   ```

2. Test the deployed application:
   ```bash
   # Get service URL
   SERVICE_URL=$(gcloud run services describe pre-order-dealer-exchange-tracker \
     --region=us-west1 \
     --format='value(status.url)')
   
   # Test health endpoint
   curl "$SERVICE_URL/health"
   # Should return: {"status":"healthy","timestamp":"...","uptime":...}
   
   # Test CSS is accessible
   curl -I "$SERVICE_URL/assets/index-*.css"
   # Should return: HTTP/2 200
   ```

3. Manual smoke test:
   - Open the application URL in browser
   - Verify CSS is loaded (app should look styled)
   - Sign in as a regular user
   - Sign in as a manager (after custom claims are set)
   - Test manager operations

---

## Rollback Plan

If issues are discovered after deployment:

### Rollback Cloud Run Deployment

```bash
# List recent revisions
gcloud run revisions list \
  --service=pre-order-dealer-exchange-tracker \
  --region=us-west1

# Rollback to previous revision
gcloud run services update-traffic pre-order-dealer-exchange-tracker \
  --region=us-west1 \
  --to-revisions=<PREVIOUS_REVISION>=100
```

### Revert Custom Claims (if needed)

```bash
# Remove custom claim
const admin = require('firebase-admin');
await admin.auth().setCustomUserClaims(uid, { isManager: false });
# OR
await admin.auth().setCustomUserClaims(uid, null);
```

---

## Troubleshooting

### Issue: "SERVICE_URL is not a valid built-in substitution"

**Solution**: Remove `SERVICE_URL` from Cloud Build trigger configuration (Step 2)

**Reference**: [CLOUD_BUILD_TRIGGER_FIX.md](./CLOUD_BUILD_TRIGGER_FIX.md)

---

### Issue: Manager operations fail with "PERMISSION_DENIED"

**Symptoms**:
- Managers cannot view all users
- Managers cannot update orders
- Firestore returns permission denied errors

**Solution**: 
1. Verify custom claim is set (Step 3)
2. Ensure user has refreshed their auth token
3. Check Firestore rules are deployed

**Verification**:
```javascript
// Check custom claim
const user = await admin.auth().getUser(uid);
console.log(user.customClaims); // Should show { isManager: true }

// Check token in browser console
const token = await firebase.auth().currentUser.getIdTokenResult();
console.log(token.claims); // Should show { isManager: true }
```

**Reference**: [FIRESTORE_RULES_CUSTOM_CLAIMS.md](./FIRESTORE_RULES_CUSTOM_CLAIMS.md)

---

### Issue: CSS not loading after deployment

**Symptoms**:
- Application appears unstyled
- Browser console shows 404 errors for CSS files

**Solution**: CSS verification is built into the deployment process. If you see this issue:

1. Check deployment logs for CSS verification step
2. Verify nginx.conf is correctly configured
3. Verify vite build includes CSS files

**Manual Check**:
```bash
# Test deployed CSS
SERVICE_URL=$(gcloud run services describe pre-order-dealer-exchange-tracker \
  --region=us-west1 \
  --format='value(status.url)')

# Fetch index.html
curl "$SERVICE_URL/" | grep -o '/assets/index-[^"]*\.css'

# Test CSS file
curl -I "$SERVICE_URL/assets/index-HASH.css"
# Should return HTTP 200
```

**Reference**: [CSS_IMPLEMENTATION_SUMMARY.md](./CSS_IMPLEMENTATION_SUMMARY.md)

---

## Post-Deployment Checklist

- [ ] Step 1: PR merged successfully
- [ ] Step 2: Cloud Build trigger updated (SERVICE_URL removed)
- [ ] Step 3: Custom claims set for all managers
- [ ] Step 4: Deployed to Cloud Run successfully
- [ ] Verification: Service is accessible
- [ ] Verification: CSS is loading correctly
- [ ] Verification: Regular users can sign in and create orders
- [ ] Verification: Managers can view/update all orders
- [ ] Verification: Managers can view/update user roles
- [ ] Monitoring: No error spikes in Cloud Logging
- [ ] Monitoring: No performance regressions

---

## Additional Resources

- [STABILIZATION_COMPLETE_SUMMARY.md](./STABILIZATION_COMPLETE_SUMMARY.md) - Technical summary
- [FIRESTORE_RULES_CUSTOM_CLAIMS.md](./FIRESTORE_RULES_CUSTOM_CLAIMS.md) - Custom claims details
- [CLOUD_BUILD_TRIGGER_FIX.md](./CLOUD_BUILD_TRIGGER_FIX.md) - Trigger configuration
- [CONTAINER_DEPLOYMENT_GUIDE.md](./CONTAINER_DEPLOYMENT_GUIDE.md) - Deployment details
- [README.md](./README.md) - Application documentation

---

## Support

If you encounter issues not covered in this guide:

1. Check the troubleshooting section above
2. Review the referenced documentation files
3. Check Cloud Build logs: https://console.cloud.google.com/cloud-build/builds
4. Check Cloud Run logs: https://console.cloud.google.com/run
5. Check Firestore rules: https://console.firebase.google.com/

---

**Version**: 1.0.0  
**Last Updated**: November 18, 2025  
**Status**: Ready for Production Deployment
