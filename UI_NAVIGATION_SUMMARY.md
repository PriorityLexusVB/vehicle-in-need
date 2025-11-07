# UI Navigation Summary

## Header Layout (Manager View)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Vehicle Order Tracker v{sha}                    [Active] [Settings] [↓] │
│ Welcome, John Doe (Manager) [isManager: true]     Orders  ⚙️ Settings   │
│                                                       42                 │
│ ┌───────────────────────┐                                               │
│ │ Dashboard │ Settings  │ ← Pill Navigation (always visible)            │
│ └───────────────────────┘                                               │
└─────────────────────────────────────────────────────────────────────────┘
```

### Navigation Elements

1. **Left Side - Pill Navigation** (`data-testid="pill-admin-link"`)
   - Background: Light gray rounded pill (`bg-slate-200/80 rounded-full`)
   - "Dashboard" link → Routes to `/#/`
   - "Settings" link → Routes to `/#/admin` (formerly "User Management")
   - Active state: White background with shadow
   - Always visible for managers
   - **Testable**: Settings link has `data-testid="pill-admin-link"`

2. **Right Side - Quick Actions**
   - Active Orders count badge (large number)
   - Gear icon button (`data-testid="header-admin-gear"`) → Routes to `/#/admin`
   - Label: "Settings" with tooltip "Settings (Admin)"
   - "Sign Out" button

3. **Top Line**
   - App title: "Vehicle Order Tracker"
   - Version badge: `v{commit-sha}` (hover shows build time)
   - User greeting: "Welcome, {name} (Manager)"
   - Debug chip: `[isManager: true]`

## Navbar (Manager View)

The top navigation bar includes:
- "Home" link → Routes to `/#/`
- "Admin" button (`data-testid="navbar-admin-link"`) → Routes to `/#/admin`
- Gradient background: `from-sky-600 to-sky-700`
- **Testable**: Admin button has `data-testid="navbar-admin-link"`

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

### `/#/admin` - Settings Route (Protected)
**Manager Access:**
```
┌────────────────────────────────────────────┐
│ Dashboard > Settings  ← Breadcrumb         │
│                                            │
│ Settings                                   │
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

```
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

```
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
1. **From Dashboard to Settings (Admin):**
   - Click "Settings" in pill nav (`data-testid="pill-admin-link"`) → Routes to `/#/admin`
   - Click gear icon in header (`data-testid="header-admin-gear"`) → Routes to `/#/admin`
   - Click "Admin" button in navbar (`data-testid="navbar-admin-link"`) → Routes to `/#/admin`
   - Type `/#/admin` in URL bar → Loads SettingsPage

2. **From Settings to Dashboard:**
   - Click "Dashboard" in pill nav → Routes to `/#/`
   - Click "Home" in navbar → Routes to `/#/`
   - Back button → Returns to `/#/`

3. **Deep Linking:**
   - Load page with `/#/admin` URL
   - Auth resolves
   - User lands on SettingsPage (no redirect)

### Non-Manager Navigation
1. **Attempt to Access Settings:**
   - Type `/#/admin` in URL bar
   - ProtectedRoute checks `user?.isManager`
   - Automatically redirected to `/#/`
   - Dashboard/order form displayed

2. **Standard Flow:**
   - Only see order submission form
   - No admin navigation elements
   - No route changes available

## Version and Status Verification

### Client-side Version Display
```
Vehicle Order Tracker v{commit-sha}
                      ↑
                      Hover shows:
                      "Built: Nov 6, 2025, 01:54 AM UTC"
```

### Server-side API Status Endpoint
**URL:** `GET /api/status`

**Response:**
```json
{
  "geminiEnabled": true,
  "version": "abc1234",
  "appVersion": "abc1234",
  "commitSha": "abc1234",
  "buildTime": "2025-11-07T18:00:00Z",
  "kRevision": "pre-order-dealer-exchange-tracker-00123-xyz",
  "timestamp": "2025-11-07T18:23:45.309Z"
}
```

**Fields:**
- `version` / `appVersion` / `commitSha`: Git commit short SHA
- `buildTime`: ISO 8601 timestamp of when the Docker image was built
- `kRevision`: Cloud Run revision name (if running on Cloud Run)
- `timestamp`: Current server time

**Console Logs:**
```
[Server] App Version: abc1234
[Server] Build Time: 2025-11-07T18:00:00Z
```

## Version Badge Implementation

### Display Format
```
Vehicle Order Tracker v{commit-sha}
                      ↑
                      Hover shows:
                      "Built: Nov 6, 2025, 01:54 AM UTC"
```

### Data Flow
```
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
