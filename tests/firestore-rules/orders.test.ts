import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { setDoc, doc, getDoc, updateDoc, deleteDoc, collection, getDocs, query, orderBy, where } from 'firebase/firestore';
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

    it('should allow owner to update allowed fields (notes) but NOT status', async () => {
      const userId = 'user123';
      const userDb = testEnv
        .authenticatedContext(userId, { email: 'user@example.com' })
        .firestore();
      const orderRef = doc(userDb, 'orders', 'order123');
      
      // Owner can update notes without changing status
      await assertSucceeds(
        updateDoc(orderRef, {
          createdByUid: 'user123',
          createdByEmail: 'user@example.com',
          createdAt: new Date(),
          status: 'Factory Order', // Same status - not a change
          notes: 'Updated by owner',
        })
      );
    });

    it('should deny owner changing status (status changes are manager-only)', async () => {
      const userId = 'user123';
      const userDb = testEnv
        .authenticatedContext(userId, { email: 'user@example.com' })
        .firestore();
      const orderRef = doc(userDb, 'orders', 'order123');
      
      // Owner cannot change status - this is a manager-only action
      await assertFails(
        updateDoc(orderRef, {
          createdByUid: 'user123',
          createdByEmail: 'user@example.com',
          createdAt: new Date(),
          status: 'Locate', // Different status - not allowed for non-managers
          notes: 'Original notes',
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
    // 
    // PERFORMANCE NOTE: The Firestore document fallback incurs an additional read
    // for each permission check. For best performance in production, run the
    // set-manager-custom-claims.mjs script to sync custom claims with Firestore.
    // When custom claims are set, hasManagerClaim() is checked first and the
    // Firestore read is skipped.
    
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

  describe('Collection Queries - Manager Access', () => {
    // Tests that verify collection queries (list operations) work for managers.
    // The production app uses queries like:
    //   query(collection(db, "orders"), orderBy("createdAt", "desc"))
    // to populate the manager dashboard.
    
    beforeEach(async () => {
      // Setup: Create users and multiple orders
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        
        // Create a manager with custom claims
        await setDoc(doc(adminDb, 'users', 'claimManager'), {
          email: 'claimmanager@example.com',
          displayName: 'Claims Manager',
          isManager: true,
        });
        
        // Create a manager WITHOUT custom claims (only Firestore document)
        await setDoc(doc(adminDb, 'users', 'firestoreManager'), {
          email: 'firestoremanager@example.com',
          displayName: 'Firestore Manager',
          isManager: true,
        });
        
        // Create a regular user
        await setDoc(doc(adminDb, 'users', 'regularUser'), {
          email: 'regular@example.com',
          displayName: 'Regular User',
          isManager: false,
        });
        
        // Create multiple orders from different users
        await setDoc(doc(adminDb, 'orders', 'order1'), {
          createdByUid: 'regularUser',
          createdByEmail: 'regular@example.com',
          createdAt: new Date('2024-01-01'),
          status: 'Factory Order',
        });
        await setDoc(doc(adminDb, 'orders', 'order2'), {
          createdByUid: 'claimManager',
          createdByEmail: 'claimmanager@example.com',
          createdAt: new Date('2024-01-02'),
          status: 'Locate',
        });
        await setDoc(doc(adminDb, 'orders', 'order3'), {
          createdByUid: 'firestoreManager',
          createdByEmail: 'firestoremanager@example.com',
          createdAt: new Date('2024-01-03'),
          status: 'Delivered',
        });
      });
    });

    it('should allow manager with custom claims to list all orders', async () => {
      const managerDb = testEnv
        .authenticatedContext('claimManager', { 
          email: 'claimmanager@example.com',
          isManager: true  // Custom claim
        })
        .firestore();
      
      // This is the exact query pattern used by the production app for managers
      const ordersQuery = query(
        collection(managerDb, 'orders'),
        orderBy('createdAt', 'desc')
      );
      
      await assertSucceeds(getDocs(ordersQuery));
    });

    it('should allow manager via Firestore document to list all orders', async () => {
      // Manager WITHOUT custom claim (only Firestore document has isManager: true)
      const managerDb = testEnv
        .authenticatedContext('firestoreManager', { 
          email: 'firestoremanager@example.com'
          // NOTE: No isManager custom claim!
        })
        .firestore();
      
      // This is the exact query pattern used by the production app for managers
      const ordersQuery = query(
        collection(managerDb, 'orders'),
        orderBy('createdAt', 'desc')
      );
      
      await assertSucceeds(getDocs(ordersQuery));
    });

    it('should allow regular user to list only their own orders', async () => {
      const userDb = testEnv
        .authenticatedContext('regularUser', { 
          email: 'regular@example.com'
        })
        .firestore();
      
      // This is the exact query pattern used by the production app for non-managers
      const ordersQuery = query(
        collection(userDb, 'orders'),
        where('createdByUid', '==', 'regularUser'),
        orderBy('createdAt', 'desc')
      );
      
      await assertSucceeds(getDocs(ordersQuery));
    });

    it('should deny regular user listing all orders without filter', async () => {
      const userDb = testEnv
        .authenticatedContext('regularUser', { 
          email: 'regular@example.com'
        })
        .firestore();
      
      // Non-manager trying to list all orders (without owner filter) should fail
      const ordersQuery = query(
        collection(userDb, 'orders'),
        orderBy('createdAt', 'desc')
      );
      
      await assertFails(getDocs(ordersQuery));
    });
  });

  describe('Manager-Only Status Changes (Secure/Unsecure Actions)', () => {
    // Tests that verify only managers can change order status.
    // This is essential for the Secure/Unsecure feature which is manager-only.
    
    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        
        // Create a manager with custom claims
        await setDoc(doc(adminDb, 'users', 'manager123'), {
          email: 'manager@example.com',
          displayName: 'Manager',
          isManager: true,
        });
        
        // Create a regular user (order owner)
        await setDoc(doc(adminDb, 'users', 'user123'), {
          email: 'user@example.com',
          displayName: 'Regular User',
          isManager: false,
        });
        
        // Create an active order
        await setDoc(doc(adminDb, 'orders', 'activeOrder'), {
          createdByUid: 'user123',
          createdByEmail: 'user@example.com',
          createdAt: new Date(),
          status: 'Factory Order',
          notes: 'Test order',
        });
        
        // Create a secured order
        await setDoc(doc(adminDb, 'orders', 'securedOrder'), {
          createdByUid: 'user123',
          createdByEmail: 'user@example.com',
          createdAt: new Date(),
          status: 'Delivered',
          notes: 'Secured order',
        });
      });
    });

    it('should allow manager to mark order as secured (status -> Delivered)', async () => {
      const managerDb = testEnv
        .authenticatedContext('manager123', { 
          email: 'manager@example.com',
          isManager: true
        })
        .firestore();
      
      const orderRef = doc(managerDb, 'orders', 'activeOrder');
      
      // Manager can change status from Factory Order to Delivered (secure action)
      await assertSucceeds(
        updateDoc(orderRef, {
          createdByUid: 'user123',
          createdByEmail: 'user@example.com',
          createdAt: new Date(),
          status: 'Delivered',
          notes: 'Test order',
        })
      );
    });

    it('should allow manager to unsecure order (status Delivered -> Factory Order)', async () => {
      const managerDb = testEnv
        .authenticatedContext('manager123', { 
          email: 'manager@example.com',
          isManager: true
        })
        .firestore();
      
      const orderRef = doc(managerDb, 'orders', 'securedOrder');
      
      // Manager can change status from Delivered to Factory Order (unsecure action)
      await assertSucceeds(
        updateDoc(orderRef, {
          createdByUid: 'user123',
          createdByEmail: 'user@example.com',
          createdAt: new Date(),
          status: 'Factory Order',
          notes: 'Secured order',
        })
      );
    });

    it('should deny non-manager owner from marking order as secured', async () => {
      const userDb = testEnv
        .authenticatedContext('user123', { 
          email: 'user@example.com'
        })
        .firestore();
      
      const orderRef = doc(userDb, 'orders', 'activeOrder');
      
      // Owner cannot change status - this is a manager-only action
      await assertFails(
        updateDoc(orderRef, {
          createdByUid: 'user123',
          createdByEmail: 'user@example.com',
          createdAt: new Date(),
          status: 'Delivered',
          notes: 'Test order',
        })
      );
    });

    it('should deny non-manager owner from unsecuring order', async () => {
      const userDb = testEnv
        .authenticatedContext('user123', { 
          email: 'user@example.com'
        })
        .firestore();
      
      const orderRef = doc(userDb, 'orders', 'securedOrder');
      
      // Owner cannot change status - this is a manager-only action
      await assertFails(
        updateDoc(orderRef, {
          createdByUid: 'user123',
          createdByEmail: 'user@example.com',
          createdAt: new Date(),
          status: 'Factory Order',
          notes: 'Secured order',
        })
      );
    });

    it('should allow owner to update notes without changing status', async () => {
      const userDb = testEnv
        .authenticatedContext('user123', { 
          email: 'user@example.com'
        })
        .firestore();
      
      const orderRef = doc(userDb, 'orders', 'activeOrder');
      
      // Owner can update notes as long as status remains unchanged
      await assertSucceeds(
        updateDoc(orderRef, {
          createdByUid: 'user123',
          createdByEmail: 'user@example.com',
          createdAt: new Date(),
          status: 'Factory Order', // Same as original
          notes: 'Updated notes by owner',
        })
      );
    });
  });
});
