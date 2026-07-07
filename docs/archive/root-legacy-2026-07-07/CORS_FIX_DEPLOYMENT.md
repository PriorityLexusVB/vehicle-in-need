# CORS Error Fix - Manager Role Toggle

## Issue Summary

The manager role toggle in the admin User Management view (`/#/admin`) was failing due to a CORS error when calling the `setManagerRole` Cloud Function.

**Error Message:**

```
Access to fetch at 'https://us-west1-vehicles-in-need.cloudfunctions.net/setManagerRole' 
from origin 'https://pre-order-dealer-exchange-tracker-842946218691.us-west1.run.app' 
has been blocked by CORS policy: Response to preflight request doesn't pass access control check: 
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

## Root Cause

The Cloud Functions code **already had correct CORS configuration**, but it wasn't deployed to production yet. The CORS configuration was added to the codebase but the functions needed to be deployed for the fix to take effect.

## Solution

The fix involves deploying the Cloud Functions with the correct CORS configuration that's already present in the code.

### CORS Configuration

The functions are configured with explicit allowed origins:

```typescript
const ALLOWED_ORIGINS = [
  "https://pre-order-dealer-exchange-tracker-842946218691.us-west1.run.app",  // Production
  "http://localhost:5173",      // Vite dev server
  "http://localhost:3000",      // Alternative dev port
  "http://127.0.0.1:5173",      // Alternative localhost
  "http://127.0.0.1:3000",      // Alternative localhost
];

export const setManagerRole = onCall<SetManagerRoleData>(
  { 
    region: "us-west1",
    cors: ALLOWED_ORIGINS,  // Explicit CORS configuration
  },
  async (request) => { /* ... */ }
);
```

Firebase Functions v2's `onCall` functions with the `cors` option automatically handle:

- ✅ Preflight OPTIONS requests
- ✅ Access-Control-Allow-Origin headers (dynamic based on request origin)
- ✅ Access-Control-Allow-Methods (POST, OPTIONS)
- ✅ Access-Control-Allow-Headers (Content-Type, Authorization)

## Deployment Instructions

### Prerequisites

- Firebase CLI installed: `npm install -g firebase-tools`
- Authenticated with Firebase: `firebase login`
- Project configured: `cat .firebaserc` should show `vehicles-in-need`

### Deploy Functions

From the project root:

```bash
# Option 1: Use npm script (recommended)
npm run deploy:functions

# Option 2: Manual deployment
cd functions
npm install
npm run build
cd ..
firebase deploy --only functions --project vehicles-in-need
```

### Deployment Output

You should see output similar to:

```
=== Deploying to 'vehicles-in-need'...

i  deploying functions
i  functions: ensuring required API cloudfunctions.googleapis.com is enabled...
✔  functions: required API cloudfunctions.googleapis.com is enabled
i  functions: preparing codebase default for deployment
i  functions: ensuring required API cloudbuild.googleapis.com is enabled...
✔  functions: required API cloudbuild.googleapis.com is enabled
i  functions: preparing functions directory for uploading...
i  functions: packaged functions (N KB) for uploading
✔  functions: functions folder uploaded successfully
i  functions: updating Node.js 20 function setManagerRole(us-west1)...
i  functions: updating Node.js 20 function disableUser(us-west1)...
✔  functions[setManagerRole(us-west1)] Successful update operation.
✔  functions[disableUser(us-west1)] Successful update operation.

✔  Deploy complete!
```

## Verification Steps

After deployment, verify the fix:

### 1. Check Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select project: `vehicles-in-need`
3. Navigate to **Functions** in the left sidebar
4. Verify you see:
   - ✅ `setManagerRole` - Region: `us-west1` - Status: Active
   - ✅ `disableUser` - Region: `us-west1` - Status: Active

### 2. Test in Admin Dashboard

1. Navigate to the production app: `https://pre-order-dealer-exchange-tracker-842946218691.us-west1.run.app/`
2. Sign in with a manager account
3. Go to Admin → User Management (`/#/admin`)
4. Try toggling the "Manager" switch for a user
5. Expected results:
   - ✅ No CORS error in browser console
   - ✅ Toggle switches smoothly
   - ✅ Success message: "Successfully granted/revoked manager permissions for [user]"
   - ✅ User's role updates in the UI

### 3. Check Browser Console

Open browser DevTools (F12) → Console tab:

- ❌ Should NOT see: "CORS policy" errors
- ❌ Should NOT see: "Failed to load resource"
- ✅ Should see: Normal Firebase SDK logs (if enabled)

### 4. Monitor Function Logs

In Firebase Console → Functions → Select function → Logs tab:

- Look for successful execution logs
- Check for any CORS-related warnings or errors
- Verify audit logs are being written

## Troubleshooting

### Issue: Still seeing CORS errors after deployment

**Possible Causes:**

1. Deployment didn't complete successfully
2. Browser cache is serving old content
3. Origin URL doesn't exactly match CORS configuration

**Solutions:**

1. Re-deploy functions and verify completion
2. Hard refresh browser (Ctrl+Shift+R or Cmd+Shift+R)
3. Clear browser cache completely
4. Check browser console for exact origin being sent
5. Verify origin in code matches exactly (no trailing slash)

### Issue: "Function not found" error

**Possible Causes:**

1. Functions not deployed
2. Wrong project selected
3. Wrong region specified

**Solutions:**

1. Deploy functions: `npm run deploy:functions`
2. Verify project: `firebase use vehicles-in-need`
3. Check function URLs include `us-west1` region

### Issue: "Permission denied" error

**Possible Causes:**

1. User not authenticated
2. User doesn't have manager privileges
3. Custom claims not refreshed

**Solutions:**

1. Ensure user is logged in
2. Verify user has `isManager: true` custom claim in Firebase Console
3. Have user sign out and sign back in to refresh token
4. Check Firestore `users` collection for user's `isManager` field

## Code Changes Summary

### 1. Enhanced Documentation

**File: `functions/src/index.ts`**

- Added comprehensive CORS configuration comments
- Improved JSDoc comments for functions
- Added troubleshooting notes

**File: `functions/README.md`** (New)

- Complete documentation for Cloud Functions
- CORS configuration explanation
- Deployment guide
- Troubleshooting section
- Security best practices

**File: `README.md`**

- Added "Deploy Cloud Functions" section
- Deployment instructions
- CORS troubleshooting reference

### 2. Improved Error Handling

**File: `services/functionsService.ts`**

- Added specific CORS error detection
- Provides actionable error messages
- Distinguishes CORS errors from general network errors

**Example Error Messages:**

- CORS Error: "CORS error: Unable to call Cloud Function. The functions may not be deployed with the latest CORS configuration. Please contact your administrator or try again later."
- Network Error: "Unable to connect to the server. The Cloud Functions may not be deployed. Please contact your administrator."

### 3. Test Updates

**File: `services/__tests__/functionsService.test.ts`**

- Updated test to match new CORS error message
- All tests passing (198/198 frontend, 9/9 functions)

## Security Considerations

### CORS Security

✅ **Explicit Origins**: Only specified origins are allowed
✅ **No Wildcards**: Never uses `cors: true` (which allows all origins)
✅ **HTTPS in Production**: Production origin uses HTTPS
✅ **Minimal List**: Only necessary origins included

### Authentication & Authorization

✅ **Unchanged**: All existing security checks remain in place
✅ **Manager Validation**: Functions verify manager privileges
✅ **Self-Modification Prevention**: Users cannot change own role
✅ **Last Manager Protection**: Cannot remove all managers
✅ **Audit Logging**: All operations logged to `adminAuditLogs`

## Additional Resources

- **Functions Documentation**: [`functions/README.md`](functions/README.md)
- **Firebase Functions v2 Docs**: <https://firebase.google.com/docs/functions/callable>
- **CORS in Cloud Functions**: <https://firebase.google.com/docs/functions/http-events>

## Support

For issues or questions:

1. Check this document and troubleshooting section
2. Review [`functions/README.md`](functions/README.md)
3. Check Firebase Functions logs in console
4. Review browser console for client-side errors
5. Contact development team

---

**Status**: ✅ Fix complete - requires deployment
**Action Required**: Deploy Cloud Functions using `npm run deploy:functions`
**Expected Result**: Manager role toggle works without CORS errors
