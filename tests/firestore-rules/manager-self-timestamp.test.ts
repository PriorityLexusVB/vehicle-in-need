import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  assertSucceeds,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { setDoc, doc, updateDoc } from 'firebase/firestore';
import { getTestEnv, clearTestData } from './test-env';

let testEnv: RulesTestEnvironment;

/**
 * Manager self-update timestamp tests
 * 
 * These tests verify that managers (and regular users) can update their own
 * user documents with the `updatedAt` field, as done by App.tsx on login.
 * 
 * NOTE: Tests use `new Date()` instead of `serverTimestamp()` because:
 * 1. The Firestore emulator accepts both Date objects and Timestamps
 * 2. This matches the pattern used by all other tests in this codebase
 * 3. The security rules don't validate timestamp type, just presence and allowed keys
 * 4. Using Date provides predictable, deterministic test behavior
 */
describe('Manager self-update timestamp - App.tsx flow', () => {
  beforeAll(async () => {
    testEnv = await getTestEnv();
  });

  afterAll(async () => {
    // Cleanup handled globally
  });

  beforeEach(async () => {
    await clearTestData();
  });

  it('should allow manager (with custom claim) to update own updatedAt timestamp', async () => {
    // This simulates the App.tsx scenario for a manager with custom claims
    const managerId = 'manager123';
    
    // Setup: Create manager user document
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'users', managerId), {
        email: 'manager@priorityautomotive.com',
        displayName: 'Manager User',
        isManager: true,
      });
    });

    // Test: Manager tries to do partial update with just updatedAt
    const managerDb = testEnv
      .authenticatedContext(managerId, { 
        email: 'manager@priorityautomotive.com',
        isManager: true  // Custom claim
      })
      .firestore();
    const userRef = doc(managerDb, 'users', managerId);
    
    const now = new Date();
    // This is what App.tsx actually does
    await assertSucceeds(
      updateDoc(userRef, {
        updatedAt: now,
      })
    );
  });

  it('should allow manager (without custom claim, Firestore only) to update own updatedAt timestamp', async () => {
    // This simulates the App.tsx scenario for a manager WITHOUT custom claims
    // but with isManager: true in Firestore document
    const managerId = 'manager123';
    
    // Setup: Create manager user document in Firestore
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'users', managerId), {
        email: 'manager@priorityautomotive.com',
        displayName: 'Manager User',
        isManager: true,
      });
    });

    // Test: Manager WITHOUT custom claim tries to do partial update
    const managerDb = testEnv
      .authenticatedContext(managerId, { 
        email: 'manager@priorityautomotive.com'
        // NOTE: No isManager custom claim - only Firestore document
      })
      .firestore();
    const userRef = doc(managerDb, 'users', managerId);
    
    const now = new Date();
    // This is what App.tsx actually does
    await assertSucceeds(
      updateDoc(userRef, {
        updatedAt: now,
      })
    );
  });
  
  it('should allow manager to update own updatedAt and displayName together', async () => {
    // This simulates the App.tsx scenario when displayName changes
    const managerId = 'manager123';
    
    // Setup: Create manager user document
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'users', managerId), {
        email: 'manager@priorityautomotive.com',
        displayName: 'Manager User',
        isManager: true,
      });
    });

    // Test: Manager tries to do partial update with updatedAt and displayName
    const managerDb = testEnv
      .authenticatedContext(managerId, { 
        email: 'manager@priorityautomotive.com',
        isManager: true  // Custom claim
      })
      .firestore();
    const userRef = doc(managerDb, 'users', managerId);
    
    const now = new Date();
    await assertSucceeds(
      updateDoc(userRef, {
        updatedAt: now,
        displayName: 'Updated Manager Name',
      })
    );
  });

  it('should allow manager with isActive field to update own updatedAt timestamp', async () => {
    // This tests when the user document has isActive field (e.g., set by another manager)
    const managerId = 'manager123';
    
    // Setup: Create manager user document WITH isActive field
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'users', managerId), {
        email: 'manager@priorityautomotive.com',
        displayName: 'Manager User',
        isManager: true,
        isActive: true,  // This field might be set by another manager
      });
    });

    // Test: Manager tries to do partial update with just updatedAt
    const managerDb = testEnv
      .authenticatedContext(managerId, { 
        email: 'manager@priorityautomotive.com',
        isManager: true  // Custom claim
      })
      .firestore();
    const userRef = doc(managerDb, 'users', managerId);
    
    const now = new Date();
    await assertSucceeds(
      updateDoc(userRef, {
        updatedAt: now,
      })
    );
  });

  it('should allow user with uid field to update own updatedAt timestamp', async () => {
    // This tests when the user document has the uid field
    const userId = 'user123';
    
    // Setup: Create user document WITH uid field (like App.tsx creates)
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'users', userId), {
        uid: userId,  // App.tsx stores uid in the document
        email: 'user@priorityautomotive.com',
        displayName: 'Test User',
        isManager: false,
      });
    });

    // Test: User tries to do partial update with just updatedAt
    const userDb = testEnv
      .authenticatedContext(userId, { 
        email: 'user@priorityautomotive.com'
      })
      .firestore();
    const userRef = doc(userDb, 'users', userId);
    
    const now = new Date();
    await assertSucceeds(
      updateDoc(userRef, {
        updatedAt: now,
      })
    );
  });

  it('should allow manager with full document (all fields) to update own updatedAt', async () => {
    // This tests the exact production scenario: a manager with ALL fields populated
    const managerId = 'SsFh10SrFqfjRpIzJlN0GJ1hjRw2'; // Using actual UID pattern from production
    
    // Setup: Create manager user document with ALL fields that might exist in production
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'users', managerId), {
        uid: managerId,
        email: 'rob.brasco@priorityautomotive.com',
        displayName: 'Rob Brasco',
        isManager: true,
        isActive: true,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-06-01'),
      });
    });

    // Test: Manager WITHOUT custom claim tries to do partial update
    // This simulates the case where custom claims haven't been synced
    const managerDb = testEnv
      .authenticatedContext(managerId, { 
        email: 'rob.brasco@priorityautomotive.com'
        // NOTE: No isManager custom claim - Firestore document is source of truth
      })
      .firestore();
    const userRef = doc(managerDb, 'users', managerId);
    
    const now = new Date();
    await assertSucceeds(
      updateDoc(userRef, {
        updatedAt: now,
      })
    );
  });

  it('should allow manager with full document and custom claim to update own updatedAt', async () => {
    // This tests with both custom claims AND full document
    const managerId = 'SsFh10SrFqfjRpIzJlN0GJ1hjRw2';
    
    // Setup: Create manager user document with ALL fields
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'users', managerId), {
        uid: managerId,
        email: 'rob.brasco@priorityautomotive.com',
        displayName: 'Rob Brasco',
        isManager: true,
        isActive: true,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-06-01'),
      });
    });

    // Test: Manager WITH custom claim tries to do partial update
    const managerDb = testEnv
      .authenticatedContext(managerId, { 
        email: 'rob.brasco@priorityautomotive.com',
        isManager: true  // Has custom claim
      })
      .firestore();
    const userRef = doc(managerDb, 'users', managerId);
    
    const now = new Date();
    await assertSucceeds(
      updateDoc(userRef, {
        updatedAt: now,
      })
    );
  });

  it('should allow manager to update displayName when it changed in Firebase Auth', async () => {
    // This simulates when the user changes their display name in Google and logs in again
    const managerId = 'manager123';
    
    // Setup: Create manager user document with old displayName
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'users', managerId), {
        uid: managerId,
        email: 'manager@priorityautomotive.com',
        displayName: 'Old Manager Name',
        isManager: true,
        isActive: true,
        createdAt: new Date('2024-01-01'),
      });
    });

    // Test: Manager updates both updatedAt AND displayName
    const managerDb = testEnv
      .authenticatedContext(managerId, { 
        email: 'manager@priorityautomotive.com',
        isManager: true
      })
      .firestore();
    const userRef = doc(managerDb, 'users', managerId);
    
    await assertSucceeds(
      updateDoc(userRef, {
        updatedAt: new Date(),
        displayName: 'New Manager Name',
      })
    );
  });
});
