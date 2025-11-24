import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { setDoc, doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { getTestEnv, clearTestData } from './test-env';

let testEnv: RulesTestEnvironment;

describe('Firestore Security Rules - Orders Collection', () => {
  beforeAll(async () => {
    // Use shared test environment
    testEnv = await getTestEnv();
  });

  afterAll(async () => {
    // Note: cleanup is handled globally after all test files complete
    // to prevent premature shutdown
  });

  beforeEach(async () => {
    // Use shared clear function to prevent race conditions
    await clearTestData();
  });

  describe('Unauthenticated Access', () => {
    it('should deny unauthenticated user creating an order', async () => {
      const unauthedDb = testEnv.unauthenticatedContext().firestore();
      const orderRef = doc(unauthedDb, 'orders', 'order123');
      
      await assertFails(
        setDoc(orderRef, {
          createdByUid: 'user123',
          createdByEmail: 'user@example.com',
          createdAt: new Date(),
          status: 'Factory Order',
        })
      );
    });

    it('should deny unauthenticated user reading an order', async () => {
      const unauthedDb = testEnv.unauthenticatedContext().firestore();
      const orderRef = doc(unauthedDb, 'orders', 'order123');
      
      await assertFails(getDoc(orderRef));
    });

    it('should deny unauthenticated user updating an order', async () => {
      const unauthedDb = testEnv.unauthenticatedContext().firestore();
      const orderRef = doc(unauthedDb, 'orders', 'order123');
      
      await assertFails(
        updateDoc(orderRef, {
          status: 'Delivered',
        })
      );
    });

    it('should deny unauthenticated user deleting an order', async () => {
      const unauthedDb = testEnv.unauthenticatedContext().firestore();
      const orderRef = doc(unauthedDb, 'orders', 'order123');
      
      await assertFails(deleteDoc(orderRef));
    });
  });

  describe('Order Creation - Ownership Enforcement', () => {
    beforeEach(async () => {
      // Setup: Create user documents for testing
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, 'users', 'user123'), {
          email: 'user@example.com',
          displayName: 'Test User',
          isManager: false,
        });
      });
    });

    it('should allow authenticated user to create order with correct ownership fields', async () => {
      const userId = 'user123';
      const userDb = testEnv
        .authenticatedContext(userId, { email: 'user@example.com' })
        .firestore();
      const orderRef = doc(userDb, 'orders', 'order123');
      
      await assertSucceeds(
        setDoc(orderRef, {
          createdByUid: userId,
          createdByEmail: 'user@example.com',
          createdAt: new Date(),
          status: 'Factory Order',
          salesperson: 'John Doe',
          manager: 'Jane Smith',
          customerName: 'Customer',
          model: 'Model X',
        })
      );
    });

    it('should deny order creation with missing createdByUid', async () => {
      const userId = 'user123';
      const userDb = testEnv
        .authenticatedContext(userId, { email: 'user@example.com' })
        .firestore();
      const orderRef = doc(userDb, 'orders', 'order123');
      
      await assertFails(
        setDoc(orderRef, {
          createdByEmail: 'user@example.com',
          createdAt: new Date(),
          status: 'Factory Order',
        })
      );
    });

    it('should deny order creation with missing createdByEmail', async () => {
      const userId = 'user123';
      const userDb = testEnv
        .authenticatedContext(userId, { email: 'user@example.com' })
        .firestore();
      const orderRef = doc(userDb, 'orders', 'order123');
      
      await assertFails(
        setDoc(orderRef, {
          createdByUid: userId,
          createdAt: new Date(),
          status: 'Factory Order',
        })
      );
    });

    it('should deny order creation with missing createdAt', async () => {
      const userId = 'user123';
      const userDb = testEnv
        .authenticatedContext(userId, { email: 'user@example.com' })
        .firestore();
      const orderRef = doc(userDb, 'orders', 'order123');
      
      await assertFails(
        setDoc(orderRef, {
          createdByUid: userId,
          createdByEmail: 'user@example.com',
          status: 'Factory Order',
        })
      );
    });

    it('should deny order creation with mismatched createdByUid', async () => {
      const userId = 'user123';
      const userDb = testEnv
        .authenticatedContext(userId, { email: 'user@example.com' })
        .firestore();
      const orderRef = doc(userDb, 'orders', 'order123');
      
      await assertFails(
        setDoc(orderRef, {
          createdByUid: 'differentUser',
          createdByEmail: 'user@example.com',
          createdAt: new Date(),
          status: 'Factory Order',
        })
      );
    });

    it('should deny order creation with mismatched createdByEmail', async () => {
      const userId = 'user123';
      const userDb = testEnv
        .authenticatedContext(userId, { email: 'user@example.com' })
        .firestore();
      const orderRef = doc(userDb, 'orders', 'order123');
      
      await assertFails(
        setDoc(orderRef, {
          createdByUid: userId,
          createdByEmail: 'different@example.com',
          createdAt: new Date(),
          status: 'Factory Order',
        })
      );
    });

    it('should deny order creation with invalid status', async () => {
      const userId = 'user123';
      const userDb = testEnv
        .authenticatedContext(userId, { email: 'user@example.com' })
        .firestore();
      const orderRef = doc(userDb, 'orders', 'order123');
      
      await assertFails(
        setDoc(orderRef, {
          createdByUid: userId,
          createdByEmail: 'user@example.com',
          createdAt: new Date(),
          status: 'InvalidStatus',
        })
      );
    });
  });

  describe('Order Read Access', () => {
    beforeEach(async () => {
      // Setup: Create users and orders
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        
        // Create users
        await setDoc(doc(adminDb, 'users', 'user123'), {
          email: 'user@example.com',
          displayName: 'Test User',
          isManager: false,
        });
        await setDoc(doc(adminDb, 'users', 'otherUser'), {
          email: 'other@example.com',
          displayName: 'Other User',
          isManager: false,
        });
        await setDoc(doc(adminDb, 'users', 'manager123'), {
          email: 'manager@example.com',
          displayName: 'Manager',
          isManager: true,
        });
        
        // Create orders
        await setDoc(doc(adminDb, 'orders', 'order123'), {
          createdByUid: 'user123',
          createdByEmail: 'user@example.com',
          createdAt: new Date(),
          status: 'Factory Order',
        });
        await setDoc(doc(adminDb, 'orders', 'orderOther'), {
          createdByUid: 'otherUser',
          createdByEmail: 'other@example.com',
          createdAt: new Date(),
          status: 'Delivered',
        });
      });
    });

    it('should allow owner to read their own order', async () => {
      const userId = 'user123';
      const userDb = testEnv
        .authenticatedContext(userId, { email: 'user@example.com' })
        .firestore();
      const orderRef = doc(userDb, 'orders', 'order123');
      
      await assertSucceeds(getDoc(orderRef));
    });

    it('should deny owner reading another user\'s order', async () => {
      const userId = 'user123';
      const userDb = testEnv
        .authenticatedContext(userId, { email: 'user@example.com' })
        .firestore();
      const orderRef = doc(userDb, 'orders', 'orderOther');
      
      await assertFails(getDoc(orderRef));
    });

    it('should allow manager to read any order', async () => {
      const managerId = 'manager123';
      const managerDb = testEnv
        .authenticatedContext(managerId, { 
          email: 'manager@example.com',
          isManager: true  // Custom claim
        })
        .firestore();
      
      // Manager can read user's order
      const order1Ref = doc(managerDb, 'orders', 'order123');
      await assertSucceeds(getDoc(order1Ref));
      
      // Manager can read other user's order
      const order2Ref = doc(managerDb, 'orders', 'orderOther');
      await assertSucceeds(getDoc(order2Ref));
    });
  });

  describe('Order Update - Ownership and Field Protection', () => {
    beforeEach(async () => {
      // Setup: Create users and orders
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        
        // Create users
        await setDoc(doc(adminDb, 'users', 'user123'), {
          email: 'user@example.com',
          displayName: 'Test User',
          isManager: false,
        });
        await setDoc(doc(adminDb, 'users', 'manager123'), {
          email: 'manager@example.com',
          displayName: 'Manager',
          isManager: true,
        });
        
        // Create order
        await setDoc(doc(adminDb, 'orders', 'order123'), {
          createdByUid: 'user123',
          createdByEmail: 'user@example.com',
          createdAt: new Date(),
          status: 'Factory Order',
          notes: 'Original notes',
        });
      });
    });

    it('should allow manager to update any order', async () => {
      const managerId = 'manager123';
      const managerDb = testEnv
        .authenticatedContext(managerId, { 
          email: 'manager@example.com',
          isManager: true  // Custom claim
        })
        .firestore();
      const orderRef = doc(managerDb, 'orders', 'order123');
      
      await assertSucceeds(
        updateDoc(orderRef, {
          createdByUid: 'user123',
          createdByEmail: 'user@example.com',
          createdAt: new Date(),
          status: 'Delivered',
          notes: 'Updated by manager',
        })
      );
    });

    it('should allow owner to update allowed fields (status, notes)', async () => {
      const userId = 'user123';
      const userDb = testEnv
        .authenticatedContext(userId, { email: 'user@example.com' })
        .firestore();
      const orderRef = doc(userDb, 'orders', 'order123');
      
      await assertSucceeds(
        updateDoc(orderRef, {
          createdByUid: 'user123',
          createdByEmail: 'user@example.com',
          createdAt: new Date(),
          status: 'Locate',
          notes: 'Updated by owner',
        })
      );
    });

    it('should deny owner changing createdByUid', async () => {
      const userId = 'user123';
      const userDb = testEnv
        .authenticatedContext(userId, { email: 'user@example.com' })
        .firestore();
      const orderRef = doc(userDb, 'orders', 'order123');
      
      await assertFails(
        updateDoc(orderRef, {
          createdByUid: 'differentUser',
          createdByEmail: 'user@example.com',
          createdAt: new Date(),
          status: 'Factory Order',
          notes: 'Original notes',
        })
      );
    });

    it('should deny owner changing createdByEmail', async () => {
      const userId = 'user123';
      const userDb = testEnv
        .authenticatedContext(userId, { email: 'user@example.com' })
        .firestore();
      const orderRef = doc(userDb, 'orders', 'order123');
      
      await assertFails(
        updateDoc(orderRef, {
          createdByUid: 'user123',
          createdByEmail: 'different@example.com',
          createdAt: new Date(),
          status: 'Factory Order',
          notes: 'Original notes',
        })
      );
    });

    it('should deny owner updating with invalid status', async () => {
      const userId = 'user123';
      const userDb = testEnv
        .authenticatedContext(userId, { email: 'user@example.com' })
        .firestore();
      const orderRef = doc(userDb, 'orders', 'order123');
      
      await assertFails(
        updateDoc(orderRef, {
          createdByUid: 'user123',
          createdByEmail: 'user@example.com',
          createdAt: new Date(),
          status: 'InvalidStatus',
          notes: 'Original notes',
        })
      );
    });

    it('should deny non-owner updating another user\'s order', async () => {
      // Create another user
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, 'users', 'otherUser'), {
          email: 'other@example.com',
          displayName: 'Other User',
          isManager: false,
        });
      });

      const otherUserId = 'otherUser';
      const otherUserDb = testEnv
        .authenticatedContext(otherUserId, { email: 'other@example.com' })
        .firestore();
      const orderRef = doc(otherUserDb, 'orders', 'order123');
      
      await assertFails(
        updateDoc(orderRef, {
          status: 'Delivered',
        })
      );
    });
  });

  describe('Order Deletion', () => {
    beforeEach(async () => {
      // Setup: Create users and order
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        
        await setDoc(doc(adminDb, 'users', 'user123'), {
          email: 'user@example.com',
          displayName: 'Test User',
          isManager: false,
        });
        await setDoc(doc(adminDb, 'users', 'manager123'), {
          email: 'manager@example.com',
          displayName: 'Manager',
          isManager: true,
        });
        await setDoc(doc(adminDb, 'orders', 'order123'), {
          createdByUid: 'user123',
          createdByEmail: 'user@example.com',
          createdAt: new Date(),
          status: 'Factory Order',
        });
      });
    });

    it('should allow manager to delete any order', async () => {
      const managerId = 'manager123';
      const managerDb = testEnv
        .authenticatedContext(managerId, { 
          email: 'manager@example.com',
          isManager: true  // Custom claim
        })
        .firestore();
      const orderRef = doc(managerDb, 'orders', 'order123');
      
      await assertSucceeds(deleteDoc(orderRef));
    });

    it('should deny owner deleting their own order', async () => {
      const userId = 'user123';
      const userDb = testEnv
        .authenticatedContext(userId, { email: 'user@example.com' })
        .firestore();
      const orderRef = doc(userDb, 'orders', 'order123');
      
      await assertFails(deleteDoc(orderRef));
    });

    it('should deny non-manager deleting any order', async () => {
      // Create another non-manager user
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, 'users', 'otherUser'), {
          email: 'other@example.com',
          displayName: 'Other User',
          isManager: false,
        });
      });

      const otherUserId = 'otherUser';
      const otherUserDb = testEnv
        .authenticatedContext(otherUserId, { email: 'other@example.com' })
        .firestore();
      const orderRef = doc(otherUserDb, 'orders', 'order123');
      
      await assertFails(deleteDoc(orderRef));
    });
  });

  describe('Manager Firestore Document Fallback', () => {
    // Tests that managers with isManager=true in Firestore (but NO custom claim)
    // can still perform manager actions via the Firestore document fallback.
    
    beforeEach(async () => {
      // Setup: Create users and orders
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        
        // Create a manager WITHOUT custom claim (only Firestore document)
        await setDoc(doc(adminDb, 'users', 'firestoreManager'), {
          email: 'firestoremanager@example.com',
          displayName: 'Firestore Manager',
          isManager: true,  // Manager in Firestore only, no custom claim
        });
        
        // Create a regular user
        await setDoc(doc(adminDb, 'users', 'regularUser'), {
          email: 'regular@example.com',
          displayName: 'Regular User',
          isManager: false,
        });
        
        // Create orders by both users
        await setDoc(doc(adminDb, 'orders', 'managerOrder'), {
          createdByUid: 'firestoreManager',
          createdByEmail: 'firestoremanager@example.com',
          createdAt: new Date(),
          status: 'Factory Order',
        });
        await setDoc(doc(adminDb, 'orders', 'userOrder'), {
          createdByUid: 'regularUser',
          createdByEmail: 'regular@example.com',
          createdAt: new Date(),
          status: 'Locate',
        });
      });
    });

    it('should allow manager via Firestore document to read any order', async () => {
      // Manager WITHOUT custom claim (only Firestore document has isManager: true)
      const managerDb = testEnv
        .authenticatedContext('firestoreManager', { 
          email: 'firestoremanager@example.com'
          // NOTE: No isManager custom claim!
        })
        .firestore();
      
      // Can read own order
      const ownOrderRef = doc(managerDb, 'orders', 'managerOrder');
      await assertSucceeds(getDoc(ownOrderRef));
      
      // Can read another user's order
      const otherOrderRef = doc(managerDb, 'orders', 'userOrder');
      await assertSucceeds(getDoc(otherOrderRef));
    });

    it('should allow manager via Firestore document to update any order', async () => {
      const managerDb = testEnv
        .authenticatedContext('firestoreManager', { 
          email: 'firestoremanager@example.com'
          // NOTE: No isManager custom claim!
        })
        .firestore();
      
      const orderRef = doc(managerDb, 'orders', 'userOrder');
      
      await assertSucceeds(
        updateDoc(orderRef, {
          createdByUid: 'regularUser',
          createdByEmail: 'regular@example.com',
          createdAt: new Date(),
          status: 'Delivered',
        })
      );
    });

    it('should allow manager via Firestore document to delete any order', async () => {
      const managerDb = testEnv
        .authenticatedContext('firestoreManager', { 
          email: 'firestoremanager@example.com'
          // NOTE: No isManager custom claim!
        })
        .firestore();
      
      const orderRef = doc(managerDb, 'orders', 'userOrder');
      
      await assertSucceeds(deleteDoc(orderRef));
    });
  });
});
