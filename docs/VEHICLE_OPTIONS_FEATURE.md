# Vehicle Options Management

This document describes the vehicle options management feature that allows managers to configure the available option codes for vehicle orders.

## Overview

Previously, the four option fields (Ext. Option 1, Ext. Option 2, Int. Option 1, Int. Option 2) were free-text inputs. Now, these options are managed from the admin interface and presented as dropdown selects when creating orders.

## Features

### For Managers

Managers can access the Vehicle Options management interface at `/#/admin` → "Vehicle Options" tab.

**Available actions:**
- **Add Options**: Create new exterior or interior option codes
- **Delete Options**: Remove options that are no longer needed
- **View Options**: See all configured options organized by type

Each option has:
- **Code**: A 4-character identifier (e.g., "PW01", "LA40")
- **Name**: A descriptive name (e.g., "Premium Wheel Package", "Leather Package - Black")
- **Type**: Either "exterior" or "interior"

### For All Users

When creating a vehicle order:
- Option fields now display as dropdown selects
- Each dropdown shows options in the format: "CODE - Description"
- Empty option (no selection) is allowed for optional fields
- Selected options automatically display with full descriptions in order cards and exports

## Setup Instructions

### 1. Deploy Firestore Rules and Indexes

Deploy the updated Firestore rules and indexes:

```bash
# Deploy rules
firebase deploy --only firestore:rules --project vehicles-in-need

# Deploy indexes
firebase deploy --only firestore:indexes --project vehicles-in-need
```

### 2. Seed Default Options

The repository includes a seed script with common Lexus options:

```bash
# Preview what will be added (dry run)
npm run seed:options:dry-run

# Apply the default options
npm run seed:options:apply
```

**Default options included:**

**Exterior Options:**
- PW01 - Premium Wheel Package
- SPW1 - Sport Wheel Package
- CF01 - Carbon Fiber Package
- PAIN - Premium Paint
- ROOF - Panoramic Roof
- SPOR - Sport Package
- TOWH - Tow Hitch
- CHRM - Chrome Package

**Interior Options:**
- LA40 - Leather Package - Black
- LA41 - Leather Package - Tan
- LA42 - Leather Package - Gray
- PREM - Premium Interior Package
- NAV1 - Navigation System
- MARK - Mark Levinson Audio
- HEAD - Head-Up Display
- HEAT - Heated/Ventilated Seats
- MASS - Massage Seats
- WOOD - Wood Trim Package

### 3. Verify Setup

1. Log in as a manager user
2. Navigate to `/#/admin`
3. Click "Vehicle Options" tab
4. Verify that seeded options appear in the list
5. Try adding a new option
6. Try deleting an option

## Usage

### Managing Options (Managers)

1. **Add a New Option:**
   - Navigate to `/#/admin` → "Vehicle Options"
   - Select either "Exterior Options" or "Interior Options" tab
   - Click "Add Exterior/Interior Option"
   - Enter a code (4 characters max) and descriptive name
   - Click "Add Option"

2. **Delete an Option:**
   - Find the option in the list
   - Click the "Delete" button
   - Confirm the deletion

### Creating Orders with Options

1. When filling out the order form, scroll to the "Vehicle Specification" section
2. Four dropdown fields are available:
   - Ext. Option 1
   - Ext. Option 2
   - Int. Option 1
   - Int. Option 2
3. Select options from the dropdowns or leave empty if not applicable
4. Submit the order

### Viewing Orders with Options

- **Order Cards**: Options display in the format "CODE - Description"
- **CSV Export**: Options are exported with full descriptions for better readability

## Technical Details

### Data Model

**VehicleOption Interface:**
```typescript
interface VehicleOption {
  id: string;
  code: string;           // 4-character code
  name: string;           // Descriptive name
  type: 'exterior' | 'interior';
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
```

### Firestore Structure

```
vehicleOptions (collection)
  └── {documentId}
      ├── code: string
      ├── name: string
      ├── type: 'exterior' | 'interior'
      ├── createdAt: timestamp
      └── updatedAt: timestamp
```

### Firestore Rules

- **Read**: All authenticated users can read vehicle options
- **Write**: Only managers can create, update, or delete options

### Firestore Indexes

Composite index for querying options:
- `type` (Ascending)
- `code` (Ascending)

This allows efficient sorting of options by type and then by code.

## Migration from Legacy Data

If you have existing orders with manually entered option codes:

1. Those codes will still be stored and displayed
2. If a code matches an option in the database, the full description will show
3. If a code doesn't match, only the code will be displayed
4. No data migration is needed - the system handles both cases

## Troubleshooting

### Options not appearing in dropdowns

**Cause**: Firestore indexes not deployed or options not seeded

**Solution**:
```bash
firebase deploy --only firestore:indexes --project vehicles-in-need
npm run seed:options:apply
```

### "Permission denied" when adding options

**Cause**: User doesn't have manager permissions

**Solution**: Ensure the user has `isManager: true` in Firestore users collection

### Duplicate code errors when adding option

**Cause**: An option with that code already exists for that type

**Solution**: Use a different code or delete the existing option first

## Future Enhancements

Potential improvements for future versions:

1. **Bulk Import**: Upload options from CSV
2. **Option Categories**: Group options by package type
3. **Option Pricing**: Associate costs with options
4. **Option History**: Track when options were added/modified
5. **Option Search**: Filter options in admin interface
6. **Option Dependencies**: Define which options require others

## API Reference

### Component Props

**VehicleOptionsManager**
```typescript
interface VehicleOptionsManagerProps {
  options: VehicleOption[];
  onAddOption: (option: Omit<VehicleOption, 'id'>) => Promise<void>;
  onDeleteOption: (optionId: string) => Promise<void>;
}
```

**OrderForm**
```typescript
interface OrderFormProps {
  onAddOrder: (order: Omit<Order, 'id'>) => Promise<boolean>;
  currentUser?: AppUser | null;
  vehicleOptions: VehicleOption[];  // New prop
}
```

**OrderCard**
```typescript
interface OrderCardProps {
  order: Order;
  onUpdateStatus: (orderId: string, status: OrderStatus) => void;
  onDeleteOrder: (orderId: string) => void;
  currentUser?: AppUser | null;
  vehicleOptions?: VehicleOption[];  // New prop
}
```

**OrderList**
```typescript
interface OrderListProps {
  orders: Order[];
  onUpdateStatus: (orderId: string, status: OrderStatus) => void;
  onDeleteOrder: (orderId: string) => void;
  currentUser?: AppUser | null;
  vehicleOptions?: VehicleOption[];  // New prop
}
```
