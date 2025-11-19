# Firestore Rules: Custom Claims Requirement

## Overview

The Firestore security rules for this application require **custom claims** for manager operations to avoid circular dependency issues. Manager status is determined by the `isManager` custom claim in the Firebase Auth token, not by reading the Firestore `/users/{uid}` document.

## Why Custom Claims?

### The Circular Dependency Problem

When using Firestore document reads (`get()`) to check manager status within security rules, circular dependencies can occur:

**Example Problem:**

1. User tries to update an order
2. Order update rule calls `isManager()` to check if user is a manager
3. `isManager()` calls `get(/users/{uid})` to read user's `isManager` field
4. User read rule evaluates, which may also call `isManager()`
5. **Infinite recursion** → emulator crashes with RESOURCE_EXHAUSTED error

### The Solution: Custom Claims

Custom claims are stored in the Firebase Auth token (`request.auth.token`) and can be checked without any database reads:

```javascript
// ✅ Safe - no database read
request.auth.token.isManager == true

// ❌ Unsafe - causes circular dependency
get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isManager == true
```

## Current Rules Design

### User Collection (`/users/{userId}`)

**Create:**

- Users can create their own document
- Cannot set `isManager: true` on themselves

**Read:**

- Users can read their own document
- Managers (with custom claim) can read any user document

**Update:**

- Managers (with custom claim) can update other users, including changing `isManager`
- Users can update themselves but cannot change `isManager` or `email`

**Delete:**

- Denied for all users

### Orders Collection (`/orders/{orderId}`)

**Create:**

- Authenticated users can create orders with correct ownership fields

**Read:**

- Owners can read their own orders
- Managers (with custom claim) can read any order

**Update:**

- Managers (with custom claim) can update any order
- Owners can update limited fields (`status`, `notes`) on their own orders

**Delete:**

- Managers (with custom claim) only

## Setting Custom Claims

### In Production

Use Firebase Admin SDK to set custom claims:

```javascript
const admin = require('firebase-admin');

// Set manager claim for a user
await admin.auth().setCustomUserClaims(uid, { isManager: true });
```

### In Tests

When using `@firebase/rules-unit-testing`, include custom claims in the auth context:

```typescript
const managerDb = testEnv
  .authenticatedContext('manager123', {
    email: 'manager@example.com',
    isManager: true  // Custom claim
  })
  .firestore();
```

## Synchronizing Firestore and Custom Claims

While security rules use custom claims, the application may still maintain `isManager` in Firestore documents for:

- UI display
- Query filtering
- Historical record

**Best Practice:**

1. Store `isManager` in both Firestore and custom claims
2. Use custom claims for security rule enforcement
3. Use Firestore field for application logic and UI
4. Keep them synchronized using Firebase Functions or admin operations

## Migration from Firestore-based Checks

If migrating from Firestore-based manager checks:

1. **Set custom claims** for all existing managers:

   ```javascript
   const managersSnapshot = await admin.firestore()
     .collection('users')
     .where('isManager', '==', true)
     .get();
   
   for (const doc of managersSnapshot.docs) {
     await admin.auth().setCustomUserClaims(doc.id, { isManager: true });
   }
   ```

2. **Update client code** to refresh tokens after role changes:

   ```javascript
   // After updating user role in Firestore
   await admin.auth().setCustomUserClaims(uid, { isManager: newValue });
   
   // Client must refresh token
   const user = firebase.auth().currentUser;
   await user.getIdToken(true);  // Force refresh
   ```

3. **Test thoroughly** to ensure all manager operations work with custom claims

## Troubleshooting

### "RESOURCE_EXHAUSTED" Error

**Symptom:**

```
8 RESOURCE_EXHAUSTED: Received message larger than max (1697477237 vs 4194304)
```

**Cause:** Circular dependency in rules causing infinite recursion

**Solution:** Ensure all manager checks use `request.auth.token.isManager`, not `get()` calls

### "Permission Denied" for Manager Operations

**Symptom:** Managers cannot perform operations they should be allowed to do

**Cause:** Custom claim not set on user's auth token

**Solution:**

1. Verify custom claim is set: `admin.auth().getUser(uid).then(u => console.log(u.customClaims))`
2. Ensure client refreshes token after claim changes
3. Check that test contexts include `isManager: true` in auth object

### Rules Work in Emulator but Fail in Production

**Symptom:** Tests pass but production fails

**Cause:** Tests may be using Firestore-based checks while production requires custom claims

**Solution:** Update tests to use custom claims as shown in "In Tests" section above

## Related Documentation

- [Firestore Security Rules](./firestore.rules) - Current rules implementation
- [CLOUD_BUILD_TRIGGER_FIX.md](./CLOUD_BUILD_TRIGGER_FIX.md) - Cloud Build configuration
- [Firebase Custom Claims Documentation](https://firebase.google.com/docs/auth/admin/custom-claims)
