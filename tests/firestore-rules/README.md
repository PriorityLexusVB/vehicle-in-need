# Firestore Security Rules Tests

This directory contains comprehensive tests for Firestore security rules that enforce access control and data integrity.

## Prerequisites

- Node.js and npm installed
- Java Runtime Environment (JRE) version 11 or higher
- Internet connection (for initial emulator download)

## Running the Tests

### First Time Setup

The tests use the Firebase Firestore Emulator, which will be automatically downloaded on first run (approximately 40-50 MB). The emulator is cached in `~/.cache/firebase/emulators/`.

### Run Tests

```bash
# Run rules tests (starts emulator automatically)
npm run test:rules

# Run tests in watch mode
npm run test:rules:watch
```

### CI/CD Environments

For CI/CD pipelines, consider caching the emulator directory to speed up builds:

```yaml
# Example for GitHub Actions
- name: Cache Firebase Emulator
  uses: actions/cache@v3
  with:
    path: ~/.cache/firebase/emulators
    key: firebase-emulators-${{ runner.os }}
```

## Test Coverage

### Users Collection (`users.test.ts`)

Tests security rules for user documents:

- ✅ **Unauthenticated Access**: Denies all operations
- ✅ **Self-Escalation Prevention**: Users cannot grant themselves manager role on creation
- ✅ **Read Access**: Users can read their own document; managers can read any
- ✅ **Update Protection**:
  - Users cannot change their own `isManager` field
  - Email addresses are immutable
  - Managers can update other users but not their own `isManager`
- ✅ **Deletion**: Blocked from client for all users

### Orders Collection (`orders.test.ts`)

Tests security rules for order documents:

- ✅ **Unauthenticated Access**: Denies all operations
- ✅ **Ownership Enforcement**: Orders must include correct `createdByUid`, `createdByEmail`, and `createdAt`
- ✅ **Read Access**:
  - Owners can read their own orders
  - Non-owners cannot read other users' orders
  - Managers can read all orders
- ✅ **Update Protection**:
  - Owners cannot change ownership fields (`createdByUid`, `createdByEmail`)
  - Owners can only update allowed fields (status, notes)
  - Managers can update any order
- ✅ **Deletion**: Only managers can delete orders

## Troubleshooting

### Emulator Download Fails

If the emulator fails to download due to network restrictions:

1. Download manually from [Firebase Emulator Suite](https://firebase.google.com/docs/emulator-suite/install_and_configure)
2. Place the JAR file in `~/.cache/firebase/emulators/`
3. Run tests again

### Port Already in Use

If port 8080 is already in use, update `firebase.json`:

```json
{
  "emulators": {
    "firestore": {
      "port": 8081
    }
  }
}
```

And update the test files to use the new port.

### Tests Timeout

If tests timeout, increase the timeout in `vitest.rules.config.ts`:

```typescript
{
  test: {
    testTimeout: 60000,  // Increase to 60 seconds
    hookTimeout: 60000
  }
}
```

## Integration with CI

The tests are designed to run in CI environments. Make sure your CI configuration:

1. Has Java 11+ installed
2. Can access the internet to download the emulator (on first run)
3. Caches the emulator directory for faster subsequent runs

## Security Principles Tested

1. **Principle of Least Privilege**: Users only have access to their own data
2. **Role-Based Access Control**: Managers have elevated permissions
3. **Data Integrity**: Ownership and email fields are immutable
4. **Self-Escalation Prevention**: Users cannot grant themselves elevated roles
5. **Audit Trail**: All orders must track creator information
