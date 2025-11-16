# UI/UX Matrix - Manager vs Non-Manager

This document provides a clear comparison of the user interface and available actions between Manager and Non-Manager users.

## Quick Reference Matrix

| Feature | Manager | Non-Manager |
|---------|---------|-------------|
| **Header - Pill Navigation** | ✅ Yes (Dashboard + User Management) | ❌ No |
| **Header - Active Orders Count** | ✅ Yes | ❌ No |
| **Header - Gear Icon (Admin)** | ✅ Yes | ❌ No |
| **Header - Sign Out Button** | ✅ Yes | ✅ Yes |
| **Header - Version Badge** | ✅ Yes | ✅ Yes |
| **Header - Welcome Message** | ✅ Yes (with "Manager" tag) | ✅ Yes |
| **Dashboard - View** | All Orders (system-wide) | Your Orders (user-specific) |
| **Dashboard - DashboardStats** | ✅ Yes | ❌ No |
| **Dashboard - Add Order Button** | ✅ Yes (toggles form) | ❌ No (form always visible) |
| **Dashboard - OrderForm** | Toggleable (hide/show) | Always visible |
| **OrderList - Active Orders Tab** | ✅ Yes | ✅ Yes |
| **OrderList - Delivered History Tab** | ✅ Yes | ✅ Yes |
| **OrderList - Search** | ✅ Yes | ✅ Yes |
| **OrderList - Status Filters** | ✅ Yes | ✅ Yes |
| **OrderList - CSV Export** | ✅ Yes | ✅ Yes |
| **OrderCard - View Details** | ✅ Yes | ✅ Yes |
| **OrderCard - Change Status Dropdown** | ✅ Yes | ❌ No (read-only) |
| **OrderCard - Mark as Received** | ✅ Yes | ❌ No |
| **OrderCard - Mark as Delivered** | ✅ Yes | ❌ No |
| **OrderCard - Delete Order** | ✅ Yes | ❌ No |
| **OrderCard - AI Email Generation** | ✅ Yes | ✅ Yes |
| **Admin Route - Access** | ✅ Allowed | ❌ Redirected to `/` |
| **Admin - User Management Page** | ✅ Yes | ❌ No access |
| **Admin - Toggle User Roles** | ✅ Yes (except own role) | ❌ N/A |
| **Deep Linking to /admin** | ✅ Works | ❌ Redirected to `/` |

## Detailed Behavior

### Header Component

#### Manager View
```
┌──────────────────────────────────────────────────────────────────┐
│ Vehicle Order Tracker v{sha}        [42 Active] ⚙️  Sign Out     │
│ Welcome, John Doe (Manager) [isManager: true]     Orders          │
│ ┌───────────────────────────┐                                    │
│ │ Dashboard │ User Management│ ← Pill Navigation                 │
│ └───────────────────────────┘                                    │
└──────────────────────────────────────────────────────────────────┘
```

#### Non-Manager View
```
┌──────────────────────────────────────────────────────────────────┐
│ Vehicle Order Tracker v{sha}                          Sign Out   │
│ Welcome, Jane Smith [isManager: false]                           │
└──────────────────────────────────────────────────────────────────┘
```

### Dashboard Route (`/`)

#### Manager Dashboard
- **Top Section**: DashboardStats cards showing:
  - Total Active Orders
  - Awaiting Action
  - Ready for Delivery
  - Delivered (Last 30d)

- **Toolbar**: 
  - Left: "All Orders" heading
  - Right: "Add New Order" button (toggles OrderForm)

- **OrderForm**: 
  - Hidden by default
  - Shows when "Add New Order" clicked
  - Closes automatically on successful submit
  - All sections visible and editable

- **OrderList**:
  - Shows ALL orders (system-wide)
  - Full CRUD capabilities
  - Status management controls
  - Delete functionality

#### Non-Manager Dashboard
- **Top Section**: Hero heading
  - Title: "Submit a New Vehicle Request"
  - Subtitle: "Fill out the form below to create a new pre-order or dealer exchange request."

- **OrderForm**: 
  - Always visible (centered, max-width)
  - All sections visible and editable
  - Does NOT close on submit (stays open for next submission)

- **OrderList**:
  - Title: "Your Orders"
  - Shows only user's own orders (filtered by `createdByUid`)
  - Read-only view (can expand/collapse)
  - NO status change controls
  - NO delete functionality
  - Can still use AI email generation

### OrderForm Sections (Both Roles)

All sections are identical for both managers and non-managers:

1. **Staff & Date**
   - Salesperson* (pre-filled with current user)
   - Manager*
   - Date* (defaults to today)

2. **Customer & Deal**
   - Customer Name*
   - Deal #*
   - Stock #
   - VIN (Last 8)

3. **Vehicle Specification**
   - Year* (dropdown)
   - Model*
   - Model #* (4 chars, hint: "4-character code, e.g., 350H")
   - Exterior Color #* (4 chars, hint: "4-character code, e.g., 01UL")
   - Interior Color #* (4 chars, hint: "4-character code, e.g., LA40")
   - Ext. Option 1/2 # (optional, 4 chars each)
   - Int. Option 1/2 # (optional, 4 chars each)

4. **Financials**
   - MSRP*
   - Selling Price
   - Gross
   - Deposit Amount*

5. **Status & Notes**
   - Status* (pill buttons, excludes Delivered/Received)
   - Options* (textarea, hint: "Key packages and accessories")
   - Internal Notes (textarea)

### OrderList Component

#### Shared Features (Both Roles)
- **Tabs**: Active Orders / Delivered History
- **Search**: By Customer Name, Deal #, Stock #, or VIN
- **Status Filters**: All Active + individual status pills (Active tab only)
- **CSV Export**: Exports filtered results
- **Empty States**: Context-specific messages

#### Manager-Only Features
- Change status dropdown on each active order
- "Mark as Received" button
- "Mark as Delivered" button
- Delete button with confirmation

#### Non-Manager Restrictions
- Status displayed as read-only text
- No change status controls
- No delete buttons
- Can view all order details
- Can generate AI follow-up emails

### Admin Route (`/admin`)

#### Manager Access
- Full access to User Management page
- Can view all users
- Can toggle `isManager` for other users
- Cannot toggle own `isManager` status (toggle disabled)
- Helper text explains functionality

#### Non-Manager Access
- ProtectedRoute redirects to `/`
- No error message shown
- Navigation elements not visible in header
- Cannot access via deep link

## Accessibility Features

### All Users
- ✅ Semantic HTML elements
- ✅ Proper heading hierarchy
- ✅ Form labels with `htmlFor` matching input `id`
- ✅ ARIA labels on icon buttons
- ✅ Keyboard navigation support
- ✅ Focus states on interactive elements
- ✅ Role and aria-label on button groups

### Manager-Specific
- ✅ Gear icon has `aria-label="User Management"`
- ✅ Status dropdown has proper label
- ✅ Delete button has descriptive text + icon

### Non-Manager Specific
- ✅ Screen reader announces read-only status
- ✅ Disabled controls have proper ARIA states

## Field Validation

All required fields show inline error messages in red below the input when validation fails:

- Salesperson is required
- Manager is required
- Customer name is required
- Deal # is required
- Model is required
- Model # is required
- Exterior Color # is required
- Interior Color # is required
- Options are required
- MSRP is required (must be valid number)
- Deposit Amount is required (must be valid number)

Optional numeric fields (Selling Price, Gross) still validate that if provided, they must be valid numbers.

## Design Decisions

### Why Delivered/Received Excluded from Status Buttons?
These are terminal states managed through dedicated action buttons:
- "Mark as Received" - transitions from any active status
- "Mark as Delivered" - only available after "Received"

This workflow prevents accidental status changes and enforces the order lifecycle.

### Why Non-Managers Can Generate AI Emails?
While non-managers cannot manage orders, they may need to communicate with customers. The AI email feature is a convenience tool that doesn't grant any order management privileges.

### Why Form Stays Open for Non-Managers?
Non-managers typically submit multiple orders in a session. Keeping the form visible reduces clicks and streamlines their primary workflow.

### Why Managers See Form Toggle?
Managers need to toggle between order management and order creation. The dashboard is their primary workspace for viewing all orders, so the form is secondary.

### Why Status Filters Only on Active Tab?
Delivered orders don't need status filtering - they're all in the same "Delivered" state. The filter is designed to help managers prioritize active work.

## Color Scheme

### Primary Colors
- **Sky Blue** (`sky-500/600/700`): Primary actions, active states, links
- **Slate** (`slate-200/300/500/600/800`): Neutral UI, borders, text

### Status Colors
- **Amber** (`amber-100/600/700`): Awaiting action, warnings
- **Green** (`green-100/600/700`): Delivered, success states
- **Blue** (`blue-600/700`): Received, info states
- **Purple** (`purple-100/600/700`): Delivered (last 30d) stat
- **Red** (`red-500/600/800`): Errors, delete actions

### Background Colors
- **White**: Cards, forms, inputs
- **Slate-50**: Section backgrounds, read-only displays
- **Slate-100**: Page background

## Typography

- **Headings**: `text-slate-800`, bold
- **Body Text**: `text-slate-700`
- **Secondary Text**: `text-slate-500`
- **Hints**: `text-slate-400`, text-xs
- **Errors**: `text-red-600`, text-xs

## Responsive Breakpoints

- **Mobile** (`<640px`): Single column, stacked layout
- **Tablet** (`640px-1024px`): 2-column grids, visible text labels
- **Desktop** (`>1024px`): 3-4 column grids, full navigation

## Navigation Patterns

### Manager Navigation
1. **Pill Nav** - Always visible, active state indicated
2. **Gear Icon** - Quick access to admin
3. **App Title** - Clickable, returns to dashboard
4. **Browser Back/Forward** - Works correctly with React Router

### Non-Manager Navigation
1. **App Title** - Clickable, returns to dashboard
2. **No admin controls visible**
3. **Browser Back/Forward** - Limited to home page

## Security Considerations

### Frontend Restrictions
- Admin UI hidden from non-managers
- ProtectedRoute enforces role-based access
- Action buttons conditionally rendered

### Backend Security (Firestore)
- Firestore rules enforce server-side authorization
- Frontend restrictions are UX convenience only
- All mutations validated at database level
- Users can only modify orders they created (non-managers)
- Only managers can change any order status or delete

## Version Information

- **Version Badge**: Displays commit SHA
- **Build Time**: Available on hover tooltip
- **Location**: Header, next to app title
- **Visibility**: All users
- **Format**: `v{short-sha}` e.g., `vdbb7872`

## Future Enhancements (Not Implemented)

These were listed as "time-permitting" and are not yet implemented:

- [ ] LocalStorage persistence for filters/search
- [ ] Inline help modals/tooltips
- [ ] Bulk order actions
- [ ] Advanced filtering (date ranges, multiple status)
- [ ] Export to Excel format
- [ ] Email notifications
- [ ] Order templates

## Testing Coverage

- ✅ Header navigation (manager vs non-manager)
- ✅ ProtectedRoute redirect behavior
- ✅ OrderForm validation
- ✅ OrderList tab switching
- ✅ SettingsPage toggle behavior
- ✅ VersionBadge rendering
- ⚠️ E2E tests (require authentication setup)

---

Last Updated: 2025-11-16
