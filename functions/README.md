# Firebase Cloud Functions - Vehicle Order Tracker

This directory contains Firebase Cloud Functions for the Vehicle Order Tracker application.

## Functions Overview

### 1. `setManagerRole`
**Purpose:** Toggle manager status for users  
**Region:** us-west1  
**CORS:** Configured with explicit allowed origins  
**Auth:** Requires manager privileges

**Use Cases:**
- Promote users to manager role
- Demote managers to regular users
- Administrative user management

**Security:**
- Caller must be authenticated
- Caller must have manager privileges
- Cannot modify own role
- Cannot demote the last manager (lockout prevention)

### 2. `disableUser`
**Purpose:** Enable or disable user accounts  
**Region:** us-west1  
**CORS:** Configured with explicit allowed origins  
**Auth:** Requires manager privileges

**Use Cases:**
- Temporarily disable user accounts
- Re-enable previously disabled accounts
- Administrative user management

**Security:**
- Caller must be authenticated
- Caller must have manager privileges
- Cannot disable own account
- Cannot disable the only active manager

## CORS Configuration

Both functions are configured with explicit CORS origins to ensure secure cross-origin requests.

### Allowed Origins

The following origins are permitted to call these functions:

- **Production:** `https://pre-order-dealer-exchange-tracker-842946218691.us-west1.run.app`
- **Local Development:** 
  - `http://localhost:5173` (Vite dev server default)
  - `http://localhost:3000` (alternative dev port)
  - `http://127.0.0.1:5173`
  - `http://127.0.0.1:3000`

### How CORS Works

Firebase Functions v2 `onCall` functions automatically handle CORS when the `cors` option is provided:

1. **Preflight Requests:** OPTIONS requests are automatically handled
2. **Headers:** Appropriate `Access-Control-Allow-*` headers are set automatically
3. **Origin Matching:** Only exact matches from the allowed origins list will succeed
4. **Browser Security:** CORS errors occur at the browser level for unauthorized origins

### Modifying CORS Origins

To add or modify allowed origins:

1. Edit `ALLOWED_ORIGINS` array in `src/index.ts`
2. Rebuild: `npm run build`
3. Deploy: `firebase deploy --only functions --project vehicles-in-need`
4. Verify deployment in Firebase Console

**Important:** After deployment, the new CORS configuration takes effect immediately.

## Development

### Prerequisites

- Node.js 20 or later
- npm 10 or later
- Firebase CLI: `npm install -g firebase-tools`

### Setup

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run tests
npm test

# Watch mode for tests
npm run test:watch
```

### Local Development with Emulator

```bash
# From project root, start emulators
firebase emulators:start

# Or, serve functions only
cd functions && npm run serve
```

The functions will be available at:
- `http://localhost:5001/vehicles-in-need/us-west1/setManagerRole`
- `http://localhost:5001/vehicles-in-need/us-west1/disableUser`

## Deployment

### Deploy to Production

**⚠️ Important:** Always test functions locally before deploying to production.

```bash
# From project root
npm run deploy:functions

# Or, manually
cd functions && npm run build && cd .. && firebase deploy --only functions --project vehicles-in-need
```

### Deployment Checklist

- [ ] All tests passing (`npm test`)
- [ ] Code builds successfully (`npm run build`)
- [ ] CORS origins verified in `src/index.ts`
- [ ] Functions tested locally with emulator
- [ ] Firebase project confirmed (`--project vehicles-in-need`)
- [ ] Post-deployment verification (test functions from production app)

### Verify Deployment

After deployment, verify the functions are working:

1. Check Firebase Console → Functions for deployment status
2. Test from production app (admin dashboard)
3. Monitor function logs in Firebase Console
4. Verify CORS by testing from allowed origins

## Troubleshooting

### CORS Errors

**Symptom:** Browser console shows CORS error: "No 'Access-Control-Allow-Origin' header"

**Causes:**
1. Functions not deployed with latest CORS configuration
2. Origin URL doesn't exactly match (check protocol, domain, port)
3. Browser cache issue

**Solutions:**
1. Redeploy functions: `npm run deploy:functions`
2. Verify origin URL exactly matches entry in `ALLOWED_ORIGINS` (no trailing slash)
3. Clear browser cache and hard refresh (Ctrl+Shift+R)
4. Check browser console for exact origin being sent
5. Review Firebase Functions logs for CORS-related messages

### Authentication Errors

**Symptom:** "Permission denied" or "Unauthenticated" errors

**Causes:**
1. User not authenticated
2. User doesn't have manager privileges
3. Custom claims not set or expired

**Solutions:**
1. Verify user is logged in
2. Check user has `isManager: true` in custom claims (Firebase Console → Authentication)
3. Have user sign out and sign back in to refresh token
4. Run manager seeding script if needed: `npm run seed:managers:apply`

### Function Not Found (404)

**Symptom:** Function call fails with 404 or "not found"

**Causes:**
1. Functions not deployed
2. Wrong function name or region
3. Firebase project mismatch

**Solutions:**
1. Deploy functions: `npm run deploy:functions`
2. Verify function name matches: `setManagerRole`, `disableUser`
3. Confirm region is `us-west1`
4. Check Firebase project: `cat .firebaserc`

## Testing

### Unit Tests

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch
```

Tests cover:
- Authentication validation
- Input validation
- Authorization checks
- Manager lockout prevention
- Successful operations
- Audit logging

### Manual Testing

Use Firebase Emulator for local testing:

```bash
# Start emulator
firebase emulators:start

# In another terminal, test with curl or Postman
curl -X POST http://localhost:5001/vehicles-in-need/us-west1/setManagerRole \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ID_TOKEN" \
  -d '{"data": {"uid": "target-user-id", "isManager": true}}'
```

## Security Considerations

### CORS Security

- **Never use `cors: true` in production** - this allows ALL origins
- **Always specify explicit origins** - reduces attack surface
- **Keep the list minimal** - only add necessary origins
- **Use HTTPS in production** - HTTP origins should only be for local development

### Authentication & Authorization

- All functions require Firebase Authentication
- Manager privileges verified via custom claims AND Firestore fallback
- Comprehensive audit logging for all operations (success and failure)
- Self-modification prevented (cannot change own role or disable own account)
- Last manager protection (cannot remove all managers from system)

### Data Privacy

- Audit logs include timestamps, user IDs, emails, and action details
- Logs stored in `adminAuditLogs` collection (restricted by Firestore rules)
- Only managers can access audit logs
- Personal data handled according to Firebase security rules

## Architecture

### Flow Diagram

```
Client (Browser) → Firebase SDK → Cloud Function → Firebase Admin SDK
                                         ↓
                                   Firestore
                                   Firebase Auth
```

### CORS Flow

```
1. Browser sends OPTIONS preflight request
2. Cloud Function checks origin against ALLOWED_ORIGINS
3. If allowed, returns CORS headers
4. Browser sends actual POST request
5. Cloud Function processes request and returns response
```

### Error Handling

Functions use Firebase HttpsError for standardized error responses:
- `unauthenticated`: User not logged in
- `permission-denied`: User lacks required privileges
- `invalid-argument`: Invalid input data
- `failed-precondition`: Operation violates business rules
- `not-found`: Target resource doesn't exist
- `internal`: Unexpected server error

## Monitoring & Logs

### Firebase Console

View function logs:
1. Firebase Console → Functions
2. Select function (setManagerRole or disableUser)
3. View logs tab

### Log Formats

**Audit Log:**
```
[AUDIT] setManagerRole by admin@example.com on user@example.com: 
  {"isManager":false} -> {"isManager":true} (success: true)
```

**Operation Log:**
```
[setManagerRole] admin@example.com changed user@example.com manager status: false -> true
```

**Error Log:**
```
Error in setManagerRole: [error details]
```

## Additional Resources

- [Firebase Functions Documentation](https://firebase.google.com/docs/functions)
- [Firebase Functions v2 Migration Guide](https://firebase.google.com/docs/functions/callable)
- [CORS in Cloud Functions](https://firebase.google.com/docs/functions/http-events#using_existing_express_apps)
- [Firebase Authentication Custom Claims](https://firebase.google.com/docs/auth/admin/custom-claims)

## Support

For issues or questions:
1. Check this README and troubleshooting section
2. Review Firebase Functions logs
3. Check browser console for client-side errors
4. Review application error logs
5. Contact development team

---

**Last Updated:** 2024  
**Firebase Functions Version:** v2 (firebase-functions 6.6.0)  
**Node Version:** 20
