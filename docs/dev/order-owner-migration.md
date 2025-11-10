<!-- markdownlint-disable MD013 MD031 MD032 MD034 MD040 -->
<!-- Long lines and formatting intentional for command examples and comprehensive documentation -->

# Order Owner Migration Guide

This guide explains how to backfill legacy orders with owner information (`createdByUid` and `createdByEmail` fields) using the migration script.

## Overview

**Purpose:** Add owner information to orders that were created before the owner tracking feature was implemented.

**Script:** `scripts/migrations/backfill-order-owners.mjs`

**Safety:** The script defaults to **dry-run mode** (read-only) and requires explicit `--apply` flag to write changes.

## Prerequisites

- Node.js environment
- Firebase Admin SDK credentials (for production) or emulator (for testing)
- Access to the `vehicles-in-need` Firebase project (for production runs)

## Quick Start

### Dry Run (Recommended First Step)

Preview changes without writing to Firestore:

```bash
node scripts/migrations/backfill-order-owners.mjs --project vehicles-in-need --dry-run
```

**Output Example:**
```
=== Backfill Order Owners Migration ===
Project   : vehicles-in-need
Mode      : DRY-RUN (no writes)
Environment: Production

📊 Fetching data...
Found 45 users
Found 127 legacy orders without owner info

🔍 Analyzing matches...

  Would update order ABC123: John Smith → john.smith@priorityautomotive.com (high, displayName-exact)
  Would update order DEF456: Jane Doe → jane.doe@priorityautomotive.com (medium, email-prefix)
  ⚠  No match for order GHI789: salesperson="Bob Johnson"

=== Migration Summary ===
Total legacy orders: 127
Matched orders: 118
Unmatched orders: 9

💡 Run with --apply to write these changes to Firestore

⚠️  Orders requiring manual review:
  - Order GHI789: salesperson="Bob Johnson", customer="Acme Corp"
  - Order JKL012: salesperson="Sarah Williams", customer="Tech Industries"
  ...

📊 Match confidence:
  High confidence: 95
  Medium confidence: 23

✅ Migration complete!
```

### Apply Changes (Production)

⚠️ **Warning:** This writes to production Firestore. Only run after reviewing dry-run output.

```bash
node scripts/migrations/backfill-order-owners.mjs --project vehicles-in-need --apply
```

**Output Example:**
```
=== Backfill Order Owners Migration ===
Project   : vehicles-in-need
Mode      : APPLY (writes enabled)
Environment: Production

⚠️  WARNING: --apply mode will write to Firestore!
Press Ctrl+C now to cancel, or wait 3 seconds to continue...

📊 Fetching data...
Found 45 users
Found 127 legacy orders without owner info

🔍 Analyzing matches...

✓ Updated order ABC123: John Smith → john.smith@priorityautomotive.com (high)
✓ Updated order DEF456: Jane Doe → jane.doe@priorityautomotive.com (medium)
⚠  No match for order GHI789: salesperson="Bob Johnson"

=== Migration Summary ===
Total legacy orders: 127
Matched orders: 118
Unmatched orders: 9
Successfully updated: 118
```

### Test with Emulator

Test the migration safely against the Firebase Emulator:

```bash
# Start emulator first
firebase emulators:start

# In another terminal, set emulator environment
export FIRESTORE_EMULATOR_HOST='localhost:8080'

# Run migration against emulator
node scripts/migrations/backfill-order-owners.mjs --project demo-project --dry-run
```

## How It Works

### Matching Strategy

The script attempts to match orders to users using the `salesperson` field:

1. **Exact displayName match** (High confidence)
   - Order salesperson: "John Smith"
   - User displayName: "John Smith"
   - ✅ **Perfect match**

2. **Partial displayName match** (Medium confidence)
   - Order salesperson: "John"
   - User displayName: "John Smith"
   - ⚠️ **Fuzzy match** - review recommended

3. **Email prefix match** (Medium confidence)
   - Order salesperson: "john.smith"
   - User email: "john.smith@priorityautomotive.com"
   - ⚠️ **Inferred match** - review recommended

4. **No match** (Requires manual review)
   - Order salesperson: "Bob"
   - No users match any pattern
   - ❌ **Cannot auto-assign** - manual intervention needed

### Fields Updated

For each matched order, the script adds:

```javascript
{
  createdByUid: "user-uid-12345",           // User's Firebase UID
  createdByEmail: "user@priorityautomotive.com"  // User's email
}
```

**Note:** The `createdAt` timestamp is NOT modified. If it doesn't exist, it will remain missing (can be fixed separately).

## Migration Workflow

### Step 1: Preparation

1. **Backup production data** (optional but recommended)
   ```bash
   # Export Firestore data
   gcloud firestore export gs://your-backup-bucket/backup-$(date +%Y%m%d)
   ```

2. **Review existing users**
   - Verify all active salespeople have user accounts
   - Check that displayNames match salesperson names in orders
   - Update user profiles if needed before migration

3. **Create test data in emulator**
   - Add sample users and legacy orders
   - Run migration against emulator to verify behavior

### Step 2: Dry Run Review

1. Run dry-run against production:
   ```bash
   node scripts/migrations/backfill-order-owners.mjs --project vehicles-in-need --dry-run > migration-preview.txt
   ```

2. Review the output:
   - Check matched orders (high confidence should be accurate)
   - Verify medium confidence matches aren't false positives
   - Note all unmatched orders for manual processing

3. Validate match accuracy:
   - Spot-check 5-10 high confidence matches
   - Verify all medium confidence matches
   - Confirm unmatched orders truly have no matching user

### Step 3: Manual Remediation (If Needed)

If there are unmatched orders or incorrect matches, create a CSV mapping file:

**`salesperson-mapping.csv`:**
```csv
salesperson,userEmail
Bob Johnson,robert.johnson@priorityautomotive.com
Sarah Williams,s.williams@priorityautomotive.com
Mike Davis,michael.davis@priorityautomotive.com
```

**Manual update script** (create as needed):
```javascript
// scripts/migrations/manual-order-assignment.mjs
import admin from 'firebase-admin';
import fs from 'fs';

admin.initializeApp();
const db = admin.firestore();

const mapping = {
  "Bob Johnson": "robert.johnson@priorityautomotive.com",
  // ... more mappings
};

// Read orders, match manually, update
// (Implementation left as exercise - follow backfill-order-owners.mjs pattern)
```

### Step 4: Apply Migration

Once satisfied with dry-run results:

```bash
node scripts/migrations/backfill-order-owners.mjs --project vehicles-in-need --apply
```

Monitor output for any errors. The script logs each update, so you can track progress.

### Step 5: Verification

After migration, verify results:

#### Check Updated Orders

```javascript
// In Firestore Console or Firebase Admin SDK
const ordersRef = db.collection('orders');
const snapshot = await ordersRef.where('createdByUid', '==', null).get();
console.log(`Remaining legacy orders: ${snapshot.size}`);
```

#### Verify User Assignment

```javascript
// Check a specific user's orders
const userOrders = await ordersRef
  .where('createdByUid', '==', 'user-uid-12345')
  .get();

console.log(`User has ${userOrders.size} orders`);
userOrders.forEach(doc => {
  const order = doc.data();
  console.log(`Order ${doc.id}: ${order.salesperson} → ${order.createdByEmail}`);
});
```

#### Test in Application

1. Sign in as a non-manager user
2. Navigate to orders list
3. Verify orders are filtered correctly (only showing own orders)
4. Verify no permission errors

## Expected Output Format

### Successful Match

```
✓ Updated order XYZ789: John Smith → john.smith@priorityautomotive.com (high)
```

- `✓` = Success
- `XYZ789` = Order ID
- `John Smith` = Original salesperson field
- `john.smith@priorityautomotive.com` = Matched user email
- `(high)` = Confidence level

### Unmatched Order

```
⚠  No match for order ABC123: salesperson="Bob Johnson"
```

- `⚠` = Warning (manual review needed)
- `ABC123` = Order ID
- `Bob Johnson` = Salesperson name that couldn't be matched

### Summary Statistics

```
Total legacy orders: 127      # Orders without createdByUid
Matched orders: 118           # Orders that were successfully matched to users
Unmatched orders: 9           # Orders requiring manual assignment
Successfully updated: 118     # Orders actually written (only in --apply mode)
```

### Confidence Breakdown

```
High confidence: 95           # Exact displayName matches
Medium confidence: 23         # Fuzzy or email prefix matches
```

**Recommendation:**
- High confidence: Usually safe to apply automatically
- Medium confidence: Review before applying
- Unmatched: Always requires manual review

## Troubleshooting

### Issue: All Orders Show as "No Match"

**Symptom:**
```
Found 127 legacy orders without owner info
Matched orders: 0
Unmatched orders: 127
```

**Possible Causes:**
1. User displayNames don't match order salesperson fields
2. Users collection is empty
3. Salesperson field is empty in orders

**Solution:**
```bash
# Check users collection
firebase firestore:get users --limit 5

# Check order salesperson fields
firebase firestore:get orders --limit 5

# Update user displayNames to match salesperson conventions
```

### Issue: Permission Denied

**Symptom:**
```
Error: Missing or insufficient permissions
```

**Solution:**
- For production: Ensure you have Firebase Admin credentials
  ```bash
  gcloud auth application-default login
  ```
- For emulator: Verify `FIRESTORE_EMULATOR_HOST` is set

### Issue: Script Hangs or Times Out

**Symptom:**
- Script runs for a long time without output
- Connection timeouts

**Solution:**
- Large datasets may take time - be patient
- Add logging to track progress
- Consider batching if > 1000 orders:
  ```javascript
  // Modify script to process in batches of 100
  ```

### Issue: Wrong User Assigned

**Symptom:**
- Order shows incorrect owner after migration

**Solution:**
1. Manually correct in Firestore Console:
   ```
   orders/ORDER_ID
   └─ createdByUid: "correct-uid"
   └─ createdByEmail: "correct@email.com"
   ```

2. Or use Firebase Admin SDK:
   ```javascript
   await db.collection('orders').doc('ORDER_ID').update({
     createdByUid: 'correct-uid',
     createdByEmail: 'correct@email.com'
   });
   ```

## Manual Remediation Steps

For orders that couldn't be automatically matched:

### Option 1: Update User DisplayNames

If users exist but displayNames don't match:

```javascript
// Update user displayName in Firestore
await db.collection('users').doc('USER_UID').update({
  displayName: 'Exact Salesperson Name'
});

// Re-run migration
```

### Option 2: Manually Assign in Firestore Console

1. Open Firebase Console → Firestore Database
2. Navigate to `orders` collection
3. Find the unmatched order
4. Add fields:
   - `createdByUid`: (copy from users collection)
   - `createdByEmail`: (user's email)
5. Save

### Option 3: Custom Mapping Script

Create a CSV with manual mappings and write a custom script:

```javascript
import admin from 'firebase-admin';
import { parse } from 'csv-parse/sync';
import fs from 'fs';

admin.initializeApp();
const db = admin.firestore();

const csvContent = fs.readFileSync('mappings.csv', 'utf-8');
const mappings = parse(csvContent, { columns: true });

for (const mapping of mappings) {
  const orderRef = db.collection('orders').doc(mapping.orderId);
  await orderRef.update({
    createdByUid: mapping.userId,
    createdByEmail: mapping.userEmail
  });
  console.log(`Updated ${mapping.orderId}`);
}
```

## Best Practices

- ✅ **Always run dry-run first** - Never apply without reviewing matches
- ✅ **Backup production data** - Export before major migrations
- ✅ **Test with emulator** - Validate script behavior with test data
- ✅ **Review medium confidence** - Don't blindly trust fuzzy matches
- ✅ **Document unmatched orders** - Keep a record of manual assignments
- ✅ **Verify after migration** - Test application behavior with migrated data
- ❌ **Don't run multiple times** - Orders already updated won't be processed again (but no harm if you do)

## Related Documentation

- [Emulator Role Testing](./emulator-role-testing.md) - Testing role-based access with migrated data
- [README: Order Ownership](../../README.md#order-ownership) - Overview of order ownership feature
- [Firebase Admin SDK](https://firebase.google.com/docs/admin/setup) - Setting up Admin credentials

## Support

For migration issues:
1. Review script source code: `scripts/migrations/backfill-order-owners.mjs`
2. Check Firebase Admin SDK logs
3. Test against emulator to isolate issues
4. Verify user data is correctly formatted in Firestore
