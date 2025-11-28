<!-- markdownlint-disable MD013 MD031 MD032 MD034 MD040 -->
<!-- Long lines and formatting intentional for command examples and comprehensive documentation -->

# Emulator Role Testing Guide

This guide explains how to test role-based access control using the Firebase Emulator Suite for local development and testing.

## Prerequisites

- Firebase CLI installed (`npm install -g firebase-tools`)
- Firebase Emulator Suite configured
- Node.js environment

## Quick Start

### 1. Start Firebase Emulators

```bash
firebase emulators:start
```

This starts the following emulators:
- **Firestore Emulator** on `localhost:8080`
- **Authentication Emulator** on `localhost:9099`

### 2. Configure Environment Variables

Point your application to use the emulators:

```bash
export FIRESTORE_EMULATOR_HOST='localhost:8080'
export FIREBASE_AUTH_EMULATOR_HOST='localhost:9099'
```

**For Windows (PowerShell):**
```powershell
$env:FIRESTORE_EMULATOR_HOST='localhost:8080'
$env:FIREBASE_AUTH_EMULATOR_HOST='localhost:9099'
```

### 3. Create Test Users

Use the `auth-impersonate.mjs` script to create test users with specific roles.

#### Manager User: rob.brasco@priorityautomotive.com

```bash
node scripts/auth-impersonate.mjs --email rob.brasco@priorityautomotive.com --manager
```

This creates a user with:
- ✅ Manager permissions
- ✅ Can view all orders (all users)
- ✅ Can access admin settings
- ✅ Can manage other users
- ✅ Full CRUD operations on orders

#### Non-Manager User: ron.jordan@priorityautomotive.com

```bash
node scripts/auth-impersonate.mjs --email ron.jordan@priorityautomotive.com --non-manager
```

This creates a user with:
- ❌ Limited permissions
- ✅ Can only view their own orders (filtered by `createdByUid`)
- ❌ Cannot access admin settings
- ❌ Cannot manage other users
- ✅ Can create new orders
- ❌ Cannot update/delete orders

### 4. Sign In with Custom Token

The script outputs a custom token. Use it to sign in:

#### In Browser Console (Development Mode)

```javascript
import { getAuth, signInWithCustomToken } from 'firebase/auth';

const auth = getAuth();
const token = 'YOUR_CUSTOM_TOKEN_HERE';

await signInWithCustomToken(auth, token);
console.log('Signed in as:', auth.currentUser.email);
```

#### In Test Code

```javascript
import { getAuth, signInWithCustomToken } from 'firebase/auth';
import { initializeApp } from 'firebase/app';

// Initialize with emulator
const app = initializeApp({
  projectId: 'demo-vehicle-in-need'
});

const auth = getAuth(app);
await signInWithCustomToken(auth, customToken);
```

## Expected Behavior

### Manager Role (rob.brasco@priorityautomotive.com)

| Feature | Expected Behavior |
| --- | --- |
| **Dashboard** | Shows statistics for all orders |
| **Order List** | Displays orders from all users |
| **Order Query** | No filter on `createdByUid` |
| **Admin Access** | Can navigate to `/#/admin` |
| **User Management** | Can toggle manager status for other users |
| **Header Navigation** | Shows "Settings" button |
| **Order Creation** | Can create orders |
| **Order Updates** | Can update order status |
| **Order Deletion** | Can delete any order |

### Non-Manager Role (ron.jordan@priorityautomotive.com)

| Feature | Expected Behavior |
| --- | --- |
| **Dashboard** | Shows statistics only for own orders |
| **Order List** | Displays only orders where `createdByUid === currentUser.uid` |
| **Order Query** | Filtered by `createdByUid` |
| **Admin Access** | Redirected to home if trying to access `/#/admin` |
| **User Management** | No access to user management features |
| **Header Navigation** | No "Settings" button visible |
| **Order Creation** | Can create orders (stamped with their UID) |
| **Order Updates** | Cannot update order status |
| **Order Deletion** | Cannot delete orders |

## Firestore Security Rules Validation

The emulator respects your Firestore security rules. Verify that:

### Manager Queries

```javascript
// Should succeed for managers
const ordersRef = collection(db, 'orders');
const q = query(ordersRef, orderBy('createdAt', 'desc'));
const snapshot = await getDocs(q);
```

### Non-Manager Queries

```javascript
// Should succeed for non-managers (filtered to their orders)
const ordersRef = collection(db, 'orders');
const q = query(
  ordersRef,
  where('createdByUid', '==', currentUser.uid),
  orderBy('createdAt', 'desc')
);
const snapshot = await getDocs(q);
```

### Required Firestore Index

For per-user order queries, you need a composite index:

```
Collection: orders
Fields:
  - createdByUid (Ascending)
  - createdAt (Descending)
```

The emulator may auto-create this index, but production requires explicit deployment.
See [Firestore Index Documentation](../README.md#firestore-indexes) for deployment instructions.

## Testing Workflow

### Test Scenario 1: Manager Can View All Orders

1. Start emulators
2. Create manager user: `rob.brasco@priorityautomotive.com`
3. Sign in with custom token
4. Navigate to orders list
5. ✅ Verify all orders are visible (regardless of creator)
6. ✅ Verify admin navigation is visible

### Test Scenario 2: Non-Manager Views Only Own Orders

1. Start emulators (or continue from previous test)
2. Create non-manager user: `ron.jordan@priorityautomotive.com`
3. Sign out manager and sign in as non-manager
4. Navigate to orders list
5. ✅ Verify only orders with `createdByUid === currentUser.uid` are visible
6. ❌ Verify admin navigation is not visible
7. ❌ Verify cannot access `/#/admin` (redirected)

### Test Scenario 3: Order Creation with Owner Stamping

1. Sign in as non-manager
2. Create a new order
3. ✅ Verify order is saved with:
   - `createdByUid` = current user's UID
   - `createdByEmail` = current user's email
   - `createdAt` = server timestamp
4. ✅ Verify order appears in non-manager's order list

### Test Scenario 4: Cross-User Data Isolation

1. Create order as non-manager A
2. Sign out and sign in as non-manager B
3. ❌ Verify non-manager B cannot see non-manager A's orders
4. Sign in as manager
5. ✅ Verify manager can see orders from both non-managers

## Troubleshooting

### Issue: "Missing index" Error

**Symptom:**
```
The query requires an index. You can create it here: https://console.firebase.google.com/...
```

**Solution:**
1. The emulator usually auto-creates indexes
2. For production, deploy indexes: `firebase deploy --only firestore:indexes`
3. Or click the provided link to create via Firebase Console

### Issue: Cannot Connect to Emulator

**Symptom:**
```
Error: Could not reach Firestore backend
```

**Solution:**
1. Verify emulators are running: `firebase emulators:start`
2. Check environment variables are set correctly
3. Ensure ports 8080 and 9099 are not blocked by firewall

### Issue: Custom Token Expired

**Symptom:**
```
auth/invalid-custom-token
```

**Solution:**
- Custom tokens expire after 1 hour
- Regenerate a fresh token using the auth-impersonate script

### Issue: User Role Not Applied

**Symptom:**
- User shows as manager when they should be non-manager (or vice versa)

**Solution:**
1. Sign out completely
2. Clear local storage: `localStorage.clear()`
3. Regenerate custom token with correct `--manager` or `--non-manager` flag
4. Sign in again with new token

## Emulator Data Persistence

By default, emulator data is **not persisted** between sessions. To persist data:

```bash
firebase emulators:start --import=./emulator-data --export-on-exit=./emulator-data
```

This allows you to:
- Save test users between sessions
- Keep test orders for consistent testing
- Export/import data snapshots

## Advanced: Automated Testing

### Playwright E2E Tests

See `e2e/role-based-access.spec.ts` for automated role-based access control tests.

Run with:
```bash
npm run test:e2e
```

### Vitest Unit Tests

Component tests can use Firebase emulators via environment variables:

```typescript
beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
});
```

Run with:
```bash
npm run test
```

## Security Best Practices

- ✅ **Always use emulators for testing** - Never test roles against production data
- ✅ **Use test emails** - All test emails should end with `@priorityautomotive.com`
- ✅ **Clear data regularly** - Reset emulator data between major test sessions
- ✅ **Validate security rules** - Test that non-managers cannot access admin functions
- ❌ **Never use production credentials** - The emulator does not require real credentials

## Related Documentation

- [Order Owner Migration](./order-owner-migration.md) - Backfilling legacy orders with owner information
- [Branching Policy](./branching-policy.md) - Git workflow and branch hygiene
- [README: Role-Based Access Control](../../README.md#role-based-access-control) - Overview of RBAC features

## Support

For issues with the emulator or role testing:
1. Check [Firebase Emulator documentation](https://firebase.google.com/docs/emulator-suite)
2. Review [Firestore security rules](https://firebase.google.com/docs/firestore/security/get-started)
3. Examine application logs in browser DevTools console
