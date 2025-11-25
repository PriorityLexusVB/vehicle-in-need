# Firestore Rules Status and Recommendations

> **Note**: This document was last updated to reflect the current state after significant improvements. The rules are now production-ready with full test coverage.

## Current Status

The Firestore security rules are **production-ready** and thoroughly tested. All 56 tests pass consistently:

- **56/56 tests pass** (100% success rate)
- Manager access works via both custom claims AND Firestore document fallback
- Collection queries (list operations) are fully supported for managers

## Implemented Features

1. ✅ **Manager Access via Custom Claims**: `hasManagerClaim()` checks `request.auth.token.isManager` for best performance
2. ✅ **Manager Access via Firestore Fallback**: `hasManagerInFirestore()` checks the user's Firestore document for `isManager: true`
3. ✅ **Combined Manager Check**: `isManager()` returns `hasManagerClaim() || hasManagerInFirestore()` for maximum compatibility
4. ✅ **Collection Queries**: Managers can list all users and orders via collection queries
5. ✅ **Self-Escalation Prevention**: Users cannot grant themselves manager role on creation
6. ✅ **User Document Schema**: Validates `uid` field matches document path, email matches auth token
7. ✅ **Order Ownership**: Orders track `createdByUid`, `createdByEmail`, and `createdAt`

## Manager Check Behavior

The `isManager()` helper function provides a two-tier authorization system:

```javascript
// Custom claims are checked first as they're more performant
function isManager() {
  return hasManagerClaim() || hasManagerInFirestore();
}

function hasManagerClaim() {
  return isSignedIn() 
    && ('isManager' in request.auth.token) 
    && request.auth.token.isManager == true;
}

function hasManagerInFirestore() {
  return isSignedIn()
    && exists(/databases/$(database)/documents/users/$(request.auth.uid))
    && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isManager == true;
}
```

### Performance Note

The Firestore document fallback (`hasManagerInFirestore()`) incurs an additional read per permission check. For best performance in production:

1. Run the `set-manager-custom-claims.mjs` script to sync custom claims with Firestore
2. When custom claims are set, `hasManagerClaim()` is checked first and the Firestore read is skipped

## Best Practices

### Setting Up a Manager User

1. **Via Firestore** (works immediately):
   - Set `isManager: true` in the user's document at `/users/{uid}`
   - The Firestore fallback will grant manager access

2. **Via Custom Claims** (recommended for production):
   - Run `node scripts/set-manager-custom-claims.mjs --uid <user-uid>`
   - Custom claims are more performant (no extra Firestore reads)
   - User may need to sign out and back in to pick up new claims

### Testing Manager Access

```bash
# Run all Firestore rules tests
npm run test:rules

# Run in watch mode for development
npm run test:rules:watch
```

## Collections Supported

### `/users/{userId}`

| Operation | User (self) | Manager | Other Users |
|-----------|-------------|---------|-------------|
| Create    | ✅ (own doc only, cannot set `isManager: true`) | N/A | ❌ |
| Read      | ✅ | ✅ | ❌ |
| Update    | ✅ (cannot change `isManager` or `email`) | ✅ (other users only) | ❌ |
| Delete    | ❌ | ❌ | ❌ |
| List      | ❌ | ✅ | ❌ |

### `/orders/{orderId}`

| Operation | Owner | Manager | Other Users |
|-----------|-------|---------|-------------|
| Create    | ✅ (must set ownership correctly) | ✅ | ✅ |
| Read      | ✅ | ✅ | ❌ |
| Update    | ✅ (limited fields) | ✅ | ❌ |
| Delete    | ❌ | ✅ | ❌ |
| List (all)| ❌ | ✅ | ❌ |
| List (own)| ✅ | ✅ | N/A |

## Test Results Summary

| Category | Tests | Status |
|----------|-------|--------|
| User Unauthenticated Access | 4 | ✅ All pass |
| User Creation | 7 | ✅ All pass |
| User Read | 3 | ✅ All pass |
| User Update | 5 | ✅ All pass |
| User Delete | 2 | ✅ All pass |
| User Manager Firestore Fallback | 2 | ✅ All pass |
| User Collection Queries | 3 | ✅ All pass |
| Order Unauthenticated Access | 4 | ✅ All pass |
| Order Creation | 7 | ✅ All pass |
| Order Read | 3 | ✅ All pass |
| Order Update | 6 | ✅ All pass |
| Order Delete | 3 | ✅ All pass |
| Order Manager Firestore Fallback | 3 | ✅ All pass |
| Order Collection Queries | 4 | ✅ All pass |
| **Total** | **56/56** | **100% Pass Rate** |

## Conclusion

The Firestore rules are **production-ready** with:

- ✅ Full manager access via custom claims OR Firestore document
- ✅ Complete test coverage (56 tests, 100% pass rate)
- ✅ Self-escalation prevention
- ✅ Collection query support for managers
- ✅ Proper ownership enforcement for orders

For best performance, use custom claims. The Firestore document fallback ensures managers work even without custom claims being set.
