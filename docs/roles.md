# Role Management System

This document explains the role management system in the Vehicle Order Tracker application.

## Overview

The application has two types of users:

1. **Managers**: Can view all orders, manage user roles, and deactivate users
2. **Non-managers (Regular Users)**: Can only view and manage their own orders

## Role Concepts

### Manager Role

Managers have elevated privileges that allow them to:

- View **all orders** in the system (not just their own)
- Update the status of any order
- Delete any order
- Access the **User Management** page
- Grant or revoke manager permissions for other users
- Deactivate/reactivate user accounts

### Non-Manager Role

Regular users (non-managers) can:

- Submit new vehicle orders
- View their own orders
- Update their own order details

They **cannot**:

- View other users' orders
- Access the User Management page
- Change user roles or deactivate accounts

## How Role Changes Work

### Granting Manager Access

1. Sign in as a manager
2. Navigate to **User Management** (via the header navigation)
3. Find the user you want to promote
4. Toggle the **Manager** switch to the ON position
5. The change is saved automatically

**Important**: The affected user must **sign out and sign back in** for the role change to take effect. This is because Firebase custom claims (which control permissions) are cached in the user's authentication token.

### Revoking Manager Access

1. Sign in as a manager
2. Navigate to **User Management**
3. Find the manager you want to demote
4. Toggle the **Manager** switch to the OFF position

**Safeguards**:

- You cannot demote yourself (prevents accidental lockout)
- You cannot demote the last remaining manager (ensures at least one manager always exists)

## Deactivating Users

Managers can deactivate user accounts, which prevents them from signing in.

### To Deactivate a User

1. Sign in as a manager
2. Navigate to **User Management**
3. Click the **Deactivate** button next to the user
4. Confirm the action in the modal dialog

### To Reactivate a User

1. Sign in as a manager
2. Navigate to **User Management**
3. Enable "Show deactivated users" if hidden
4. Click the **Reactivate** button next to the deactivated user
5. Confirm the action in the modal dialog

**Safeguards**:

- You cannot deactivate your own account

## Technical Details

### How Roles Are Stored

The manager role is stored in two places:

1. **Firebase Custom Claims**: The `isManager` claim on the user's authentication token. This is the primary source for permission checks in Firestore security rules.

2. **Firestore Document**: The `users/{uid}.isManager` field. This serves as a fallback and is the source of truth displayed in the UI.

Both are kept in sync by the backend callable functions.

### Backend Functions

Role management is handled by secure Firebase Cloud Functions:

#### `setManagerRole`

- **Input**: `{ uid: string, isManager: boolean }`
- **Requirements**: Caller must be a manager
- **Behavior**:
  - Validates input
  - Prevents self-modification
  - Prevents demoting the last manager
  - Updates both custom claims and Firestore
  - Logs the action for auditing

#### `disableUser`

- **Input**: `{ uid: string, disabled: boolean }`
- **Requirements**: Caller must be a manager
- **Behavior**:
  - Validates input
  - Prevents self-disable
  - Disables/enables the Firebase Auth account
  - Updates Firestore with `isActive`, `disabledAt`, `disabledBy` fields
  - Logs the action for auditing

### Audit Logging

All role and status changes are logged to the `adminAuditLogs` collection with:

- Action performed (`setManagerRole` or `disableUser`)
- Performer's UID and email
- Target user's UID and email
- Previous and new values
- Timestamp
- Success/failure status

## Recovery Tools

### Using the CLI Script

If you need to grant manager access to a user outside of the UI (e.g., during initial setup or recovery), you can use the `set-manager-custom-claims.mjs` script:

```bash
# Dry run (no changes)
node scripts/set-manager-custom-claims.mjs --project vehicles-in-need --dry-run --emails user@priorityautomotive.com

# Apply changes
node scripts/set-manager-custom-claims.mjs --project vehicles-in-need --apply --emails user@priorityautomotive.com

# Sync all existing managers from Firestore
node scripts/set-manager-custom-claims.mjs --project vehicles-in-need --apply --sync-from-firestore
```

**Requirements**:

- Node.js 20+
- Google Cloud credentials (run `gcloud auth application-default login`)
- Firebase Admin permissions

### Initial Manager Setup

For a new deployment, add the initial manager email to the `MANAGER_EMAILS` array in `constants.ts`. When that user first signs in, they will automatically be granted manager status.

## Security Rules

Firestore security rules enforce the following:

### Users Collection (`users/{userId}`)

- Users can create their own profile (but cannot set `isManager: true`)
- Users can read their own document
- Managers can read any user document
- Managers can update other users' `isManager`, `isActive`, etc.
- Users cannot change their own `isManager` field
- No client can delete user documents

### Orders Collection (`orders/{orderId}`)

- Any authenticated user can create orders (with ownership fields)
- Owners can read their own orders
- Managers can read all orders
- Managers can update/delete any order
- Owners can update limited fields on their own orders

### Admin Audit Logs (`adminAuditLogs/{logId}`)

- Only managers can read audit logs
- No client can write to audit logs (only server-side Admin SDK)

## Environment Configuration

### Firebase Functions

The callable functions are deployed to the `us-west1` region. To use the Firebase Emulator in development:

1. Set `VITE_USE_EMULATORS=true` in your `.env` file
2. Start the emulators: `firebase emulators:start`

### Deploying Functions

```bash
cd functions
npm install
npm run build
firebase deploy --only functions
```

## Troubleshooting

### "Permission denied" errors

1. Ensure the user has signed out and signed back in after a role change
2. Check that custom claims are set correctly using the CLI script
3. Verify Firestore security rules are deployed

### Manager cannot see all orders

1. Check if custom claims are set: Run the sync script
2. Verify `isManager` field in Firestore document
3. Have the user sign out and sign back in

### Cannot change a user's role

1. Verify you are logged in as a manager
2. You cannot change your own role
3. Check if the user is the last remaining manager (cannot demote)
