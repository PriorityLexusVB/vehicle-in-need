<<<<<<< HEAD
<!-- markdownlint-disable MD013 -->
<!-- Long lines intentional for UI descriptions and formatting consistency -->

=======
>>>>>>> feat/admin-hardening-docs
# UI Navigation Summary

## Header Layout (Manager View)

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ Vehicle Order Tracker v{sha}                    [Active] [Settings] [↓] │
│ Welcome, John Doe (Manager) [isManager: true]     Orders  ⚙️ User Mgmt  │
│                                                       42                 │
│ ┌─────────────────────────────┐                                         │
│ │ Dashboard │ User Management │ ← Pill Navigation (always visible)      │
│ └─────────────────────────────┘                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Navigation Elements

1. **Left Side - Pill Navigation**
   - Background: Light gray rounded pill (`bg-slate-200/80 rounded-full`)
   - "Dashboard" link → Routes to `/#/`
   - "User Management" link → Routes to `/#/admin`
   - Active state: White background with shadow
   - Always visible for managers

2. **Right Side - Quick Actions**
   - Active Orders count badge (large number)
   - Gear icon button → Routes to `/#/admin`
   - "Sign Out" button

3. **Top Line**
   - App title: "Vehicle Order Tracker"
   - Version badge: `v{commit-sha}` (hover shows build time)
   - User greeting: "Welcome, {name} (Manager)"
   - Debug chip: `[isManager: true]`

## Routes

### `/#/` or `/` - Dashboard Route

**Manager View:**

- Dashboard statistics cards
- "Add New Order" button
- Full order list with status management
- Delete capabilities

**Non-Manager View:**

- Single order form
- Submit button
- No order list visibility

### `/#/admin` - User Management Route (Protected)

**Manager Access:**

```text
┌────────────────────────────────────────────┐
│ User Management                            │
│                                            │
│ Use the toggles to grant or revoke...     │
│                                            │
│ ┌──────────────────────────────────────┐  │
│ │ John Doe                       [ON]  │  │
│ │ john.doe@priorityautomotive.com      │  │
│ └──────────────────────────────────────┘  │
│                                            │
│ ┌──────────────────────────────────────┐  │
│ │ Jane Smith                     [OFF] │  │
│ │ jane.smith@priorityautomotive.com    │  │
│ └──────────────────────────────────────┘  │
│                                            │
└────────────────────────────────────────────┘
```

**Non-Manager Access:**

- Automatic redirect to `/#/`
- No error message (silent redirect)

## Component Flow

```text
index.tsx
  └─ <HashRouter>
       └─ <App>
            ├─ <Header>
            │    ├─ <VersionBadge>  ← Reads import.meta.env.VITE_APP_*
            │    └─ <Link> (Router navigation)
            │
            └─ <Routes>
                 ├─ <Route path="/">
                 │    └─ Dashboard/OrderForm (based on isManager)
                 │
                 └─ <Route path="/admin">
                      └─ <ProtectedRoute>  ← Checks user.isManager
                           └─ <SettingsPage>
```

## Authentication Flow

```text
┌─────────────┐
│  Anonymous  │
└──────┬──────┘
       │
       ↓ Login with Google (@priorityautomotive.com)
       │
┌──────┴──────────────────────────────────┐
│                                          │
│  First Login:                            │
│  - Check MANAGER_EMAILS constant         │
│  - Create Firestore user doc             │
│  - Set isManager flag                    │
│                                          │
│  Subsequent Logins:                      │
│  - Read isManager from Firestore         │
│  - Never check MANAGER_EMAILS again      │
│  - Settings changes persist              │
│                                          │
└──────┬───────────────────────────────────┘
       │
       ↓
┌──────┴──────────────────────┐
│                             │
│  Manager (isManager: true)  │
│  - See pill navigation      │
│  - Access /admin            │
│  - View all orders          │
│  - Manage user roles        │
│                             │
└─────────────────────────────┘

       ↓
┌──────┴──────────────────────┐
│                             │
│  Regular User (isManager: false) │
│  - No pill navigation       │
│  - Cannot access /admin     │
│  - Only see order form      │
│  - Submit requests          │
│                             │
└─────────────────────────────┘
```

## Navigation Behavior

### Manager Navigation

1. **From Dashboard to Admin:**
   - Click "User Management" in pill nav → Routes to `/#/admin`
   - Click gear icon in header → Routes to `/#/admin`
   - Type `/#/admin` in URL bar → Loads SettingsPage

2. **From Admin to Dashboard:**
   - Click "Dashboard" in pill nav → Routes to `/#/`
   - Click app title → Routes to `/#/` (if linked)
   - Back button → Returns to `/#/`

3. **Deep Linking:**
   - Load page with `/#/admin` URL
   - Auth resolves
   - User lands on SettingsPage (no redirect)

### Non-Manager Navigation

1. **Attempt to Access Admin:**
   - Type `/#/admin` in URL bar
   - ProtectedRoute checks `user?.isManager`
   - Automatically redirected to `/#/`
   - Dashboard/order form displayed

2. **Standard Flow:**
   - Only see order submission form
   - No admin navigation elements
   - No route changes available

## Version Badge Implementation

### Display Format

```text
Vehicle Order Tracker v{commit-sha}
                      ↑
                      Hover shows:
                      "Built: Nov 6, 2025, 01:54 AM UTC"
```

### Data Flow

```text
Docker Build Args:
  COMMIT_SHA=abc1234
  BUILD_TIME=2025-11-06T01:54:00Z
       ↓
Dockerfile ENV:
  VITE_APP_COMMIT_SHA=abc1234
  VITE_APP_BUILD_TIME=2025-11-06T01:54:00Z
       ↓
Vite Config (vite.config.ts):
  - Reads env.VITE_APP_COMMIT_SHA
  - Falls back to: git rev-parse --short HEAD
  - Defines: import.meta.env.VITE_APP_COMMIT_SHA
       ↓
Browser Bundle:
  - Value embedded as string literal
  - Available via import.meta.env.VITE_APP_COMMIT_SHA
       ↓
VersionBadge Component:
  - const version = import.meta.env.VITE_APP_COMMIT_SHA
  - Renders: v{version}
```

## Error Handling

### MutationObserver Guard (index.tsx)

```javascript
window.addEventListener('error', (event) => {
  // Suppress MutationObserver errors from third-party code
  if (message.includes('parameter 1 is not of type Node')) {
    event.preventDefault();
    return;
  }
  // Other errors are NOT suppressed
});
```

### Protected Route Guard (components/ProtectedRoute.tsx)

```typescript
if (!user?.isManager) {
  return <Navigate to="/" replace />;
}
return <>{children}</>;
```

### Domain Restriction (App.tsx)

```typescript
if (authUser && !authUser.email?.endsWith('@priorityautomotive.com')) {
  await signOut(auth);
  alert("Access denied. Please use a '@priorityautomotive.com' email.");
}
```

## Summary

✅ **All navigation requirements met:**

- React Router with HashRouter
- Protected /admin route
- Router Links (not view state)
- Manager UI always visible
- Deep linking support
- MutationObserver guard
- Version badge using import.meta.env

✅ **Production ready:**

- No /index.tsx references
- Service worker intentional
- Proper cache headers
- Security maintained
