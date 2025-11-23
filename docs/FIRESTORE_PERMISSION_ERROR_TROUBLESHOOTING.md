# Firestore Permission Error Troubleshooting Guide

## Problem

Users encounter "Missing or insufficient permissions" error when creating orders despite being authenticated.

```
Error adding order: FirebaseError: Missing or insufficient permissions.
```

## Quick Diagnosis Steps

### 1. Verify User Authentication

Check browser console for:
```javascript
✅ Auth Complete - Final AppUser State
isManager: true
email: rob.brasco@priorityautomotive.com
```

If auth is complete but order creation fails, proceed to step 2.

### 2. Check Deployed Firestore Rules

Run the verification script:
```bash
npm run verify:rules
```

Compare the local rules with production rules in [Firebase Console](https://console.firebase.google.com/project/vehicles-in-need/firestore/rules).

**Key rules to verify (lines 108-114):**
```javascript
allow create: if isSignedIn()
  && request.resource.data.keys().hasAll(['createdByUid', 'createdByEmail', 'createdAt'])
  && request.resource.data.createdByUid == request.auth.uid
  && request.resource.data.createdByEmail == request.auth.token.email
  && request.resource.data.status in ['Factory Order', 'Locate', 'Dealer Exchange', 'Received', 'Delivered'];
```

### 3. Verify Debug Logs

With the enhanced logging (commit 675370e), check for:

```javascript
📝 Creating Order - Payload Details
User UID: SsFh10SrFqfjRpIzJlN0GJ1hjRw2
User Email: rob.brasco@priorityautomotive.com
Auth Current User: { uid: '...', email: '...' }
Order Status: Factory Order
Payload keys: [...]
```

**Look for:**
- ❌ `auth.currentUser` is null → Auth state not synced
- ❌ Email mismatch between app and auth → State sync issue
- ❌ Missing required keys → Payload construction error
- ❌ Invalid status value → Enum/string mismatch

### 4. Test with Firebase Emulator

Run local tests to verify rules work correctly:
```bash
npm run test:rules
```

Expected: All 42 tests should pass ✅

## Common Causes & Solutions

### Cause 1: Rules Not Deployed to Production

**Symptom:** Rules tests pass locally, but production fails.

**Solution:**
```bash
firebase deploy --only firestore:rules
```

**Verify:**
```bash
npm run verify:rules
```

### Cause 2: Auth State Race Condition

**Symptom:** Error occurs immediately after login, especially with popup sign-in.

**Solution:** The enhanced code (commit 675370e) adds checks for `auth.currentUser` and email matching. If logs show null or mismatch:

1. User should refresh the page after login
2. Or we need to add a token refresh:
   ```javascript
   await auth.currentUser.getIdToken(true); // Force token refresh
   ```

### Cause 3: Email Claim Missing from Auth Token

**Symptom:** `auth.currentUser.email` is null or undefined.

**Solution:** This is rare, but if it happens:
1. Check Firebase Authentication settings
2. Ensure email is verified
3. Check for custom domain authentication issues

### Cause 4: ServerTimestamp() Behavior with hasAll()

**Symptom:** `createdAt` field check fails despite using `serverTimestamp()`.

**Solution:** This is unlikely (Firebase documentation confirms it works), but if suspected:
1. Check if production Firebase SDK version differs from local
2. Temporarily test with `new Date()` instead of `serverTimestamp()`

## Deployment Verification Checklist

After deploying a fix:

- [ ] Verify rules are deployed: `npm run verify:rules`
- [ ] Test locally with emulator: `npm run test:rules`
- [ ] Deploy to production
- [ ] Check deployed version in console:
  ```javascript
  App Version: [commit-sha]
  Build Time: [uuid]
  ```
- [ ] Have user attempt order creation
- [ ] Capture and analyze debug logs from console

## Advanced Debugging

### Enable Firestore Debug Logging

In browser console:
```javascript
firebase.firestore.setLogLevel('debug');
```

### Check Auth Token Claims

In browser console:
```javascript
const user = firebase.auth().currentUser;
const token = await user.getIdToken();
const decoded = JSON.parse(atob(token.split('.')[1]));
console.log('Token claims:', decoded);
```

Look for:
- `email` claim
- `user_id` or `uid` claim
- Custom claims like `isManager` (if using custom claims)

### Test Rules in Firebase Console

1. Go to [Firestore Rules](https://console.firebase.google.com/project/vehicles-in-need/firestore/rules)
2. Click "Rules Playground"
3. Test the exact operation:
   ```
   Operation: create
   Path: orders/test-order-123
   Auth: Use authenticated user
   Data: {
     "createdByUid": "user-uid",
     "createdByEmail": "user@priorityautomotive.com",
     "createdAt": [server timestamp],
     "status": "Factory Order",
     "salesperson": "John Doe",
     ...
   }
   ```

## Fix History

### PR #118 (Merged: 2025-11-23)
- Added validation to ensure `user.uid` and `user.email` are present
- Removed optional chaining to prevent undefined values
- Improved error messages

**Status:** Deployed to commit 5e608c5, but issue persists in production

### Current PR (In Progress)
- Added comprehensive debug logging
- Added `auth.currentUser` validation
- Added email verification between auth states
- Added rules verification script

**Status:** Testing and diagnosis phase

## Production Environment

- **Firebase Project:** vehicles-in-need
- **Deployed URL:** https://pre-order-dealer-exchange-tracker-842946218691.us-west1.run.app/
- **Firestore Rules:** [Console Link](https://console.firebase.google.com/project/vehicles-in-need/firestore/rules)
- **Current Version:** Check console logs for `App Version`

## Contact & Support

If issue persists after following this guide:
1. Capture full browser console logs
2. Note the exact steps to reproduce
3. Check Firebase Console for any error patterns
4. Review Cloud Run logs for server-side issues
