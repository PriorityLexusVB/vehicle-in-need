import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { setDoc, doc, updateDoc } from 'firebase/firestore';
import { getTestEnv, clearTestData } from './test-env';

let testEnv: RulesTestEnvironment;

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
});
