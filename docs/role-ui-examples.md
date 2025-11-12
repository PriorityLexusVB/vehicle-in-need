<!-- markdownlint-disable MD013 MD031 MD032 -->
<!-- Long lines intentional for readability and detailed descriptions -->
<!-- Allow lists and code blocks without surrounding blank lines for readability -->

# Role-Based UI Examples

This document illustrates the different user experiences for managers and non-managers in the Vehicle Order Tracker application.

## Overview

The application provides two distinct user experiences based on role:

- **Managers**: Full access to all orders, dashboard statistics, and user management
- **Non-Managers**: Streamlined experience focused on creating and viewing their own orders

## Manager Experience

### Home Page (Dashboard)

When a manager logs in, they see:

**Header:**
- Company logo
- User name with "(Manager)" badge
- Admin navigation pill: `Dashboard | User Management`
- Settings gear icon (links to `/#/admin`)
- Active orders count badge
- Logout button

**Main Content:**
- Dashboard statistics cards:
  - Total Active Orders
  - Awaiting Action
  - Ready for Delivery
  - Delivered Last 30 Days
- "All Orders" heading
- "Add New Order" button (toggles form visibility)
- Order list with full controls:
  - Search and filter functionality
  - Active/Delivered tabs
  - Status filter buttons
  - Export button
  - All orders from all users visible

**Order Card Controls (when expanded):**
- Status dropdown (for active orders)
- "Mark as Received" button
- "Mark as Delivered" button
- "Delete" button
- AI email generation

### User Management Page (`/#/admin`)

**Header:**
- Same as home page

**Main Content:**
- "User Management" heading
- Description: "Use the toggles to grant or revoke manager permissions..."
- User list with:
  - User's display name
  - User's email
  - Manager toggle switch
  - Own toggle is disabled (cannot change own role)

### Order Creation Flow

1. Click "Add New Order" button
2. Order form appears with all fields
3. Fill out order details
4. Submit
5. Order appears in "All Orders" list
6. Order is stamped with:
   - `createdByUid`: Manager's UID
   - `createdByEmail`: Manager's email
   - `createdAt`: Server timestamp

## Non-Manager Experience

### Home Page (Main View)

When a non-manager logs in, they see:

**Header:**
- Company logo
- User name (NO manager badge)
- NO admin navigation pill
- NO settings gear icon
- NO active orders count
- Logout button

**Main Content:**
- "Submit a New Vehicle Request" heading
- Description: "Fill out the form below to create a new pre-order or dealer exchange request."
- Order form (always visible, no toggle)
- "Your Orders" heading (below form)
- Order list filtered to only their orders:
  - Search and filter functionality
  - Active/Delivered tabs
  - Status filter buttons
  - Export button
  - Only orders created by this user visible

**Order Card Controls (when expanded):**
- Status display (read-only, no dropdown)
- NO "Mark as Received" button
- NO "Mark as Delivered" button
- NO "Delete" button
- AI email generation (same as manager)

### Restricted Access

**Cannot access:**
- `/#/admin` route (automatically redirected to `/#/`)
- User Management page
- Other users' orders
- Dashboard statistics

**Can access:**
- Order creation form
- View own orders
- Generate AI emails for own orders
- Search and filter own orders
- Export own orders to CSV

### Non-Manager Order Creation Flow

1. Order form is always visible at top of page
2. Fill out order details
3. Submit
4. Success message appears
5. Form resets
6. New order appears in "Your Orders" section below
7. Order is stamped with:
   - `createdByUid`: Non-manager's UID
   - `createdByEmail`: Non-manager's email
   - `createdAt`: Server timestamp

## Role Comparison Table

| Feature | Manager | Non-Manager |
|---------|---------|-------------|
| **Navigation** | | |
| Admin navigation pill | ✅ Yes | ❌ No |
| Settings gear icon | ✅ Yes | ❌ No |
| Active orders badge | ✅ Yes | ❌ No |
| **Dashboard** | | |
| View all orders | ✅ Yes | ❌ No (own only) |
| View statistics | ✅ Yes | ❌ No |
| Dashboard cards | ✅ Yes | ❌ No |
| **Order Management** | | |
| Create orders | ✅ Yes | ✅ Yes |
| View own orders | ✅ Yes | ✅ Yes |
| View others' orders | ✅ Yes | ❌ No |
| Update order status | ✅ Yes | ❌ No |
| Delete orders | ✅ Yes | ❌ No |
| Generate AI emails | ✅ Yes | ✅ Yes (own orders) |
| Export orders | ✅ Yes (all) | ✅ Yes (own only) |
| **User Management** | | |
| Access admin page | ✅ Yes | ❌ No (redirected) |
| View user list | ✅ Yes | ❌ No |
| Toggle user roles | ✅ Yes | ❌ No |
| Change own role | ❌ No | ❌ No |
| **UI Elements** | | |
| Order form visibility | Toggle button | Always visible |
| Order list heading | "All Orders" | "Your Orders" |
| Status controls | Dropdown/buttons | Read-only display |

## Order Ownership

### How It Works

Every order created in the system is automatically stamped with three fields:

```typescript
{
  createdByUid: string;      // UID of the user who created the order
  createdByEmail: string;    // Email of the user who created the order
  createdAt: Timestamp;      // Server timestamp when created
}
```

### Query Behavior

**Manager queries:**
```javascript
// Firestore query for managers (all orders)
query(
  collection(db, "orders"),
  orderBy("createdAt", "desc")
)
```

**Non-manager queries:**
```javascript
// Firestore query for non-managers (filtered to own orders)
query(
  collection(db, "orders"),
  where("createdByUid", "==", currentUser.uid),
  orderBy("createdAt", "desc")
)
```

### Required Firestore Index

For the non-manager query to work, a composite index is required:

- **Collection**: `orders`
- **Fields**:
  1. `createdByUid` (Ascending)
  2. `createdAt` (Descending)

**Create the index:**
1. Firebase Console → Firestore Database → Indexes
2. Click "Create Index"
3. Select collection: `orders`
4. Add indexed fields as above
5. Click "Create Index"

Or wait for the first non-manager query to fail and follow the link in the error message.

## Testing Role Experiences

### Using Firebase Emulator

1. **Start emulator:**
   ```bash
   firebase emulators:start
   ```

2. **Create test users with scripts:**

   **Manager:**
   ```bash
   node scripts/auth-impersonate.mjs --email manager@priorityautomotive.com --manager
   ```

   **Non-Manager:**
   ```bash
   node scripts/auth-impersonate.mjs --email user@priorityautomotive.com --non-manager
   ```

3. **Sign in with custom tokens:**
   - Copy the generated token from the script
   - In browser console:
     ```javascript
     import { getAuth, signInWithCustomToken } from 'firebase/auth';
     const auth = getAuth();
     await signInWithCustomToken(auth, 'YOUR_TOKEN_HERE');
     ```

4. **Test both experiences:**
   - Sign in as manager → verify full dashboard and controls
   - Sign out
   - Sign in as non-manager → verify limited view and own orders only

### Manual Testing Checklist

**As Manager:**
- [ ] Can see "All Orders" heading
- [ ] Can see dashboard statistics
- [ ] Can see admin navigation
- [ ] Can access `/#/admin`
- [ ] Can create orders
- [ ] Can update order status
- [ ] Can delete orders
- [ ] Can see orders from all users

**As Non-Manager:**
- [ ] Can see "Your Orders" heading
- [ ] Cannot see dashboard statistics
- [ ] Cannot see admin navigation
- [ ] Cannot access `/#/admin` (redirected)
- [ ] Can create orders
- [ ] Cannot update order status
- [ ] Cannot delete orders
- [ ] Can only see own orders

## Legacy Order Migration

For existing orders without owner information, use the migration script:

```bash
# Preview changes (dry run)
node scripts/migrations/backfill-order-owners.mjs --project PROJECT_ID --dry-run

# Apply changes
node scripts/migrations/backfill-order-owners.mjs --project PROJECT_ID --apply
```

The script:
- Identifies orders missing `createdByUid`
- Attempts to match by salesperson name
- Provides confidence scores for matches
- Reports unmatched orders for manual review

## Common Scenarios

### Scenario 1: Manager Creates Order for Non-Manager

1. Manager creates order
2. Order is stamped with manager's UID/email
3. Non-manager cannot see this order
4. Only manager can see and manage it

**Solution**: If non-manager needs to see the order, they must create it themselves.

### Scenario 2: Non-Manager Promoted to Manager

1. Non-manager has created several orders
2. User is promoted to manager via settings page
3. User logs out and back in
4. User now sees ALL orders (including their own)
5. User's old orders still have their UID as creator

### Scenario 3: Manager Demoted to Non-Manager

1. Manager has created many orders
2. Manager is demoted via settings page
3. User logs out and back in
4. User now only sees their own orders
5. Cannot see orders created by other users
6. Cannot access admin functions

### Scenario 4: Legacy Orders Without Owner

1. Old orders exist without `createdByUid`
2. Non-manager logs in
3. Legacy orders are NOT visible to non-manager
4. Manager can still see legacy orders

**Solution**: Run the migration script to backfill owner information.

## Security Considerations

### Order Access Control

- **Client-side filtering**: Orders are filtered by query before being sent to client
- **Firestore rules**: Should enforce that non-managers can only read their own orders
- **Server-side validation**: Order creation stamps UID/email server-side

### Recommended Firestore Rules

```javascript
match /orders/{orderId} {
  // Managers can read all orders
  // Non-managers can only read their own orders
  allow read: if request.auth != null && (
    get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isManager == true ||
    resource.data.createdByUid == request.auth.uid
  );
  
  // Only authenticated users can create orders
  // Orders must be stamped with creator's UID
  allow create: if request.auth != null &&
    request.resource.data.createdByUid == request.auth.uid;
  
  // Only managers can update or delete orders
  allow update, delete: if request.auth != null &&
    get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isManager == true;
}
```

## Troubleshooting

### Issue: Non-manager sees no orders

**Possible causes:**
1. No orders created by this user yet
2. Orders missing `createdByUid` field (legacy data)
3. Firestore index not created

**Solutions:**
1. Create a test order as the non-manager user
2. Run migration script to backfill legacy orders
3. Check Firestore console for index creation status

### Issue: Manager sees only their own orders

**Possible causes:**
1. User's `isManager` field is false in Firestore
2. Browser cache showing stale data

**Solutions:**
1. Check Firestore `users` collection for `isManager: true`
2. Clear browser cache and re-login
3. Use seed-manager script to ensure manager role is set

### Issue: Query fails with "missing index" error

**Cause:** Composite index not created in Firestore

**Solution:**
1. Click the link in the Firebase error message
2. Or manually create index in Firebase Console
3. Wait 5-10 minutes for index to build

---

**Last Updated:** 2025-11-10  
**Version:** 1.0  
**Maintained By:** Development Team
