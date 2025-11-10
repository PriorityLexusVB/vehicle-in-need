# Role-Based UI Examples

This document provides verification artifacts for the manager vs non-manager UI states in the Vehicle Order Tracker application.

## Manager View

When a user with `isManager: true` logs in, they see the following UI elements:

### Navigation Elements

- **Header Badge**: "(Manager)" badge displayed next to username
- **Pill Navigation**: Two-tab navigation visible on the left side of the header
  - "Dashboard" pill (navigates to `/#/`)
  - "User Management" pill with gear icon (navigates to `/#/admin`)
- **Settings Gear Icon**: Clickable gear icon in the top-right corner (navigates to `/#/admin`)
- **Active Order Count**: Badge showing the count of active orders

### Dashboard View (`/#/`)

- **Dashboard Statistics**: Four stat cards showing:
  - Total Active Orders
  - Awaiting Action
  - Ready for Delivery
  - Delivered (Last 30 Days)
- **Add New Order Button**: Blue gradient button to toggle order form
- **Order List**: Table displaying all orders from all users with:
  - Search functionality
  - Status filter dropdown
  - Tab switcher (Active/Delivered)
  - Status update controls
  - Delete button per order

### User Management View (`/#/admin`)

- **User List**: Table showing all users with:
  - Display Name
  - Email
  - Manager Role toggle switch
- **Role Toggle**: Ability to promote/demote other users (except self)
- **Current User Protection**: Cannot change own manager status

### DOM Structure Example (Manager)

```html
<header>
  <div>Vehicle Order Tracker</div>
  <div>(Manager)</div>
  <nav>
    <a href="/#/">Dashboard</a>
    <a href="/#/admin">User Management</a>
  </nav>
  <div>Active Orders: 5</div>
  <button aria-label="Settings">⚙️</button>
</header>
```

## Non-Manager View

When a user with `isManager: false` logs in, they see a simplified UI:

### Non-Manager Navigation Elements

- **No Manager Badge**: No "(Manager)" badge in header
- **No Pill Navigation**: Pill navigation is completely hidden
- **No Settings Gear Icon**: Settings gear icon is not visible
- **No Active Order Count**: Order count badge is not displayed

### Non-Manager Dashboard View (`/#/`)

- **Single Order Form**: Centered form to submit new vehicle requests
- **Form Title**: "Submit a New Vehicle Request"
- **Form Fields**:
  - Customer Name
  - Customer Email
  - Year
  - Make
  - Model
  - VIN (optional)
  - Status (defaults to "Factory Order")
  - Notes (optional)
- **Submit Button**: "Submit Order" button
- **No Order List**: Cannot view other orders or their own past orders
- **No Statistics**: Dashboard stats are not visible

### Non-Manager User Management View (`/#/admin`)

- **Access Denied**: Attempting to navigate to `/#/admin` results in
  automatic redirect to `/#/`
- **ProtectedRoute Guard**: React Router redirects non-managers away from
  protected routes

### DOM Structure Example (Non-Manager)

```html
<header>
  <div>Vehicle Order Tracker</div>
  <!-- No manager badge -->
  <!-- No navigation pills -->
  <!-- No active order count -->
  <!-- No settings gear icon -->
</header>
<main>
  <h2>Submit a New Vehicle Request</h2>
  <form>
    <!-- Order form fields -->
  </form>
</main>
```

## Access Control Matrix

| Feature                  | Manager | Non-Manager |
|--------------------------|---------|-------------|
| View Dashboard Stats     | ✅      | ❌          |
| View All Orders          | ✅      | ❌          |
| Update Order Status      | ✅      | ❌          |
| Delete Orders            | ✅      | ❌          |
| Submit New Orders        | ✅      | ✅          |
| Access User Management   | ✅      | ❌          |
| Toggle User Roles        | ✅      | ❌          |
| See Navigation Pills     | ✅      | ❌          |
| See Settings Gear Icon   | ✅      | ❌          |

## Zero-Manager Warning

When no managers exist in the system and a non-manager user logs in, a
yellow warning banner is displayed:

```text
⚠️ No managers detected. Please contact an administrator to designate
   at least one manager to avoid system lockout.
   [Dismiss X]
```

- **Display Condition**: `hasManagers === false &&
  isCurrentUserManager === false`
- **Dismissible**: User can close the banner with the "X" button
- **Accessibility**: Banner has `role="alert"` and dismiss button has
  `aria-label="Dismiss warning"`
- **Not Shown To**: Managers (they can fix the issue themselves)

## Verification Steps

To manually verify the UI states:

1. **Manager Verification**:
   - Login as a manager user (e.g., <rob.brasco@priorityautomotive.com>)
   - Confirm "(Manager)" badge in header
   - Confirm pill navigation is visible
   - Confirm settings gear icon is visible
   - Click "User Management" → verify navigation to `/#/admin`
   - Confirm user list displays with role toggles
   - Return to Dashboard → verify stats and order list visible

2. **Non-Manager Verification**:
   - Login as a non-manager user
   - Confirm NO "(Manager)" badge in header
   - Confirm NO pill navigation
   - Confirm NO settings gear icon
   - Confirm only order form is visible (no order list)
   - Attempt to navigate to `/#/admin` → verify redirect back to `/#/`

3. **Zero-Manager Warning**:
   - Ensure all users have `isManager: false` in Firestore
   - Login as a non-manager
   - Verify yellow warning banner appears
   - Click dismiss → verify banner disappears
   - Login as a manager → verify banner does NOT appear

## Testing

Automated tests verify these behaviors:

- `components/__tests__/HeaderNav.test.tsx`: Header navigation visibility
- `components/__tests__/AppRouting.test.tsx`: Route protection
- `components/__tests__/ProtectedRoute.test.tsx`: Protected route guard
- `components/__tests__/ZeroManagerWarning.test.tsx`: Zero-manager banner

Run tests:

```bash
npm test -- --run
```

## Related Files

- `App.tsx`: Main application logic and role-based rendering
- `components/Header.tsx`: Header navigation and manager badge
- `components/ProtectedRoute.tsx`: Route protection for `/admin`
- `components/ZeroManagerWarning.tsx`: Zero-manager warning banner
- `constants.ts`: `MANAGER_EMAILS` constant for initial seeding
