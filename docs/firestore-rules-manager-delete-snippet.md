# Firestore Security Rules Snippet - Manager Delete Permissions

This document demonstrates how the `isManager` custom claim is used in Firestore
security rules to grant delete permissions for client-side deletions.

**IMPORTANT:** This is a documentation file showing the relevant rules excerpt.
The actual production rules are in the root `firestore.rules` file.

## For changes to production rules

1. Review and test changes locally using Firebase Emulator
2. Submit changes via PR for code review
3. Deploy manually using: `firebase deploy --only firestore:rules --project <project-id>`

## References

- Failing job: `b7bbf4ce81bc133cf79910dea610113b18695186`
- MD060 fixed in PR #134

---

## Firestore Rules Excerpt: Manager Delete Permissions

The following rules demonstrate how manager custom claims are checked:

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    // ─────────────────────────────────────────────────────────────────────
    // HELPER FUNCTIONS
    // ─────────────────────────────────────────────────────────────────────

    function isSignedIn() {
      return request.auth != null;
    }

    // Check if user has manager status via custom claims (PREFERRED)
    // Custom claims are embedded in the ID token and are very fast to check
    function hasManagerClaim() {
      return isSignedIn() 
        && ('isManager' in request.auth.token) 
        && request.auth.token.isManager == true;
    }

    // Alternative claim name - some implementations use 'manager' instead of 'isManager'
    function hasManagerClaimAlt() {
      return isSignedIn() 
        && ('manager' in request.auth.token) 
        && request.auth.token.manager == true;
    }

    // Check if user has manager status via Firestore document (FALLBACK)
    // Note: This incurs an extra Firestore read per rule evaluation
    // For best performance, use the set-manager-custom-claims.mjs script
    // to sync custom claims from Firestore to Firebase Auth
    function hasManagerInFirestore() {
      return isSignedIn()
        && exists(/databases/$(database)/documents/users/$(request.auth.uid))
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isManager == true;
    }

    // Combined manager check: custom claims OR Firestore document
    // Custom claims are checked first as they're more performant
    function isManager() {
      return hasManagerClaim() || hasManagerClaimAlt() || hasManagerInFirestore();
    }

    // ─────────────────────────────────────────────────────────────────────
    // ORDERS COLLECTION - DELETE PERMISSION
    // ─────────────────────────────────────────────────────────────────────

    match /orders/{orderId} {
      
      // ... other rules for read, create, update ...

      // DELETE: Managers only
      // 
      // This rule grants delete permission to users who have:
      // 1. The 'isManager' custom claim set to true, OR
      // 2. The 'manager' custom claim set to true, OR
      // 3. The 'isManager' field set to true in their /users/{uid} document
      //
      // The isManager() function checks all three conditions.
      // Custom claims are preferred as they don't require an additional
      // Firestore read, making the delete operation faster.
      //
      // To grant a user delete permissions:
      // 1. Run: node tools/set-manager-custom-claims.mjs --email user@example.com --apply
      // 2. Have the user sign out and sign back in to refresh their token
      // 3. The delete operation should now succeed
      //
      allow delete: if isManager();
    }
  }
}
```

---

## Troubleshooting: "Missing or insufficient permissions" Error

If managers receive this error when attempting to delete orders:

### 1. Verify Custom Claims Are Set

Run the set-manager-custom-claims.mjs script:

```bash
node tools/set-manager-custom-claims.mjs \
  --email manager@example.com \
  --dry-run
```

If the script shows the user doesn't have the claim, run with `--apply`

### 2. Verify User Has Refreshed Their Token

Custom claims are only included in the ID token after the user:

- Signs out and signs back in, OR
- The app calls: `await user.getIdToken(true);`

ID tokens expire after ~1 hour, so users who don't sign out
may not see the new claims until their token refreshes.

### 3. Check the Token in Browser DevTools

In the browser console:

```javascript
const user = firebase.auth().currentUser;
const token = await user.getIdTokenResult();
console.log('Claims:', token.claims);
```

Look for: `isManager: true` or `manager: true`

### 4. Verify Firestore Rules Are Deployed

Check that the latest rules are deployed:

```bash
firebase deploy --only firestore:rules --project <project-id>
```

Or verify in Firebase Console → Firestore Database → Rules

### 5. Use Server-Side Delete As Alternative

If client-side deletion continues to fail, use the server-side
admin delete endpoint which bypasses security rules:

```
DELETE /api/orders/:orderId
Authorization: Bearer <firebase-id-token>
```

The server uses Admin SDK which has full Firestore access.

---

## Testing Manager Delete in Firebase Emulator

### 1. Start the emulator

```bash
firebase emulators:start --only firestore,auth
```

### 2. Create a test user with manager claim

```javascript
// In test setup
const auth = getAuth();
await auth.signInWithCustomToken(customToken); // Token with manager claim
```

### 3. Attempt to delete an order

```javascript
const db = getFirestore();
await deleteDoc(doc(db, 'orders', orderId));
```

### 4. If using @firebase/rules-unit-testing

```javascript
const testEnv = await initializeTestEnvironment({
  projectId: 'test-project',
  firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') }
});

// Test as manager
const managerContext = testEnv.authenticatedContext('manager-uid', {
  isManager: true
});
await assertSucceeds(
  deleteDoc(doc(managerContext.firestore(), 'orders', orderId))
);

// Test as non-manager (should fail)
const userContext = testEnv.authenticatedContext('user-uid', {});
await assertFails(
  deleteDoc(doc(userContext.firestore(), 'orders', orderId))
);
```
