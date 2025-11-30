import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { setDoc, doc, getDoc, updateDoc, deleteDoc, collection, getDocs, query, orderBy } from 'firebase/firestore';
import { getTestEnv, clearTestData } from './test-env';

let testEnv: RulesTestEnvironment;

describe('Firestore Security Rules - Users Collection', () => {
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
    it('should deny unauthenticated user creating a user document', async () => {
      const unauthedDb = testEnv.unauthenticatedContext().firestore();
      const userRef = doc(unauthedDb, 'users', 'user123');
      
      await assertFails(
        setDoc(userRef, {
          email: 'test@example.com',
          displayName: 'Test User',
          isManager: false,
        })
      );
    });

    it('should deny unauthenticated user reading a user document', async () => {
      const unauthedDb = testEnv.unauthenticatedContext().firestore();
      const userRef = doc(unauthedDb, 'users', 'user123');
      
      await assertFails(getDoc(userRef));
    });

    it('should deny unauthenticated user updating a user document', async () => {
      const unauthedDb = testEnv.unauthenticatedContext().firestore();
      const userRef = doc(unauthedDb, 'users', 'user123');
      
      await assertFails(
        updateDoc(userRef, {
          displayName: 'Updated Name',
        })
      );
    });

    it('should deny unauthenticated user deleting a user document', async () => {
      const unauthedDb = testEnv.unauthenticatedContext().firestore();
      const userRef = doc(unauthedDb, 'users', 'user123');
      
      await assertFails(deleteDoc(userRef));
    });
  });

  describe('User Creation - Self-Escalation Prevention', () => {
    it('should allow user to create their own document with isManager omitted', async () => {
      const userId = 'user123';
      const userDb = testEnv
        .authenticatedContext(userId, { email: 'user@example.com' })
        .firestore();
      const userRef = doc(userDb, 'users', userId);
      
      await assertSucceeds(
        setDoc(userRef, {
          email: 'user@example.com',
          displayName: 'Test User',
        })
      );
    });

    it('should allow user to create their own document with uid field included', async () => {
      // This tests the exact pattern used by the production app (App.tsx)
      // which stores uid, email, displayName, and isManager in the user document
      const userId = 'user123';
      const userDb = testEnv
        .authenticatedContext(userId, { email: 'user@example.com' })
        .firestore();
      const userRef = doc(userDb, 'users', userId);
      
      await assertSucceeds(
        setDoc(userRef, {
          uid: userId,  // This is the pattern App.tsx uses
          email: 'user@example.com',
          displayName: 'Test User',
          isManager: false,
        })
      );
    });

    it('should deny user creating document with uid mismatch', async () => {
      // uid field must match the document path userId
      const userId = 'user123';
      const userDb = testEnv
        .authenticatedContext(userId, { email: 'user@example.com' })
        .firestore();
      const userRef = doc(userDb, 'users', userId);
      
      await assertFails(
        setDoc(userRef, {
          uid: 'differentUid',  // Mismatch!
          email: 'user@example.com',
          displayName: 'Test User',
          isManager: false,
        })
      );
    });

    it('should allow user to create their own document with isManager: false', async () => {
      const userId = 'user123';
      const userDb = testEnv
        .authenticatedContext(userId, { email: 'user@example.com' })
        .firestore();
      const userRef = doc(userDb, 'users', userId);
      
      await assertSucceeds(
        setDoc(userRef, {
          email: 'user@example.com',
          displayName: 'Test User',
          isManager: false,
        })
      );
    });

    it('should deny user creating their own document with isManager: true', async () => {
      const userId = 'user123';
      const userDb = testEnv
        .authenticatedContext(userId, { email: 'user@example.com' })
        .firestore();
      const userRef = doc(userDb, 'users', userId);
      
      await assertFails(
        setDoc(userRef, {
          email: 'user@example.com',
          displayName: 'Test User',
          isManager: true,
        })
      );
    });

    it('should deny user creating document with email mismatch', async () => {
      const userId = 'user123';
      const userDb = testEnv
        .authenticatedContext(userId, { email: 'user@example.com' })
        .firestore();
      const userRef = doc(userDb, 'users', userId);
      
      await assertFails(
        setDoc(userRef, {
          email: 'different@example.com',
          displayName: 'Test User',
          isManager: false,
        })
      );
    });

    it('should deny user creating another user\'s document', async () => {
      const userId = 'user123';
      const userDb = testEnv
        .authenticatedContext(userId, { email: 'user@example.com' })
        .firestore();
      const otherUserRef = doc(userDb, 'users', 'otherUser');
      
      await assertFails(
        setDoc(otherUserRef, {
          email: 'user@example.com',
          displayName: 'Other User',
          isManager: false,
        })
      );
    });

    it('should allow user to create document with displayName: null (Firebase Auth can return null)', async () => {
      // This tests the exact scenario from App.tsx where authUser.displayName may be null
      const userId = 'userWithNullName';
      const userDb = testEnv
        .authenticatedContext(userId, { email: 'nullname@example.com' })
        .firestore();
      const userRef = doc(userDb, 'users', userId);
      
      await assertSucceeds(
        setDoc(userRef, {
          uid: userId,
          email: 'nullname@example.com',
          displayName: null,  // Firebase Auth can return null for displayName
          isManager: false,
        })
      );
    });

    it('should allow user to create document with createdAt and updatedAt timestamps', async () => {
      // This tests the updated App.tsx flow that includes timestamps
      const userId = 'userWithTimestamps';
      const userDb = testEnv
        .authenticatedContext(userId, { email: 'timestamps@example.com' })
        .firestore();
      const userRef = doc(userDb, 'users', userId);
      
      // Use Firestore serverTimestamp() equivalent for testing
      const now = new Date();
      await assertSucceeds(
        setDoc(userRef, {
          uid: userId,
          email: 'timestamps@example.com',
          displayName: 'Test User',
          isManager: false,
          createdAt: now,
          updatedAt: now,
        })
      );
    });
  });

  describe('User Read Access', () => {
    it('should allow user to read their own document', async () => {
      const userId = 'user123';
      
      // Setup: Create user document as admin
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, 'users', userId), {
          email: 'user@example.com',
          displayName: 'Test User',
          isManager: false,
        });
      });

      // Test: User can read their own document
      const userDb = testEnv
        .authenticatedContext(userId, { email: 'user@example.com' })
        .firestore();
      const userRef = doc(userDb, 'users', userId);
      
      await assertSucceeds(getDoc(userRef));
    });

    it('should deny user reading another user\'s document', async () => {
      const userId = 'user123';
      const otherUserId = 'user456';
      
      // Setup: Create other user document as admin
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, 'users', otherUserId), {
          email: 'other@example.com',
          displayName: 'Other User',
          isManager: false,
        });
      });

      // Test: User cannot read another user's document
      const userDb = testEnv
        .authenticatedContext(userId, { email: 'user@example.com' })
        .firestore();
      const otherUserRef = doc(userDb, 'users', otherUserId);
      
      await assertFails(getDoc(otherUserRef));
    });

    it('should allow manager to read any user document', async () => {
      const managerId = 'manager123';
      const userId = 'user123';
      
      // Setup: Create manager and user documents
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, 'users', managerId), {
          email: 'manager@example.com',
          displayName: 'Manager',
          isManager: true,
        });
        await setDoc(doc(adminDb, 'users', userId), {
          email: 'user@example.com',
          displayName: 'User',
          isManager: false,
        });
      });

      // Test: Manager can read user's document (using custom claim)
      const managerDb = testEnv
        .authenticatedContext(managerId, { 
          email: 'manager@example.com',
          isManager: true  // Custom claim
        })
        .firestore();
      const userRef = doc(managerDb, 'users', userId);
      
      await assertSucceeds(getDoc(userRef));
    });
  });

  describe('User Update - Role and Email Protection', () => {
    it('should allow user to update their own displayName', async () => {
      const userId = 'user123';
      
      // Setup: Create user document
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, 'users', userId), {
          email: 'user@example.com',
          displayName: 'Test User',
          isManager: false,
        });
      });

      // Test: User can update displayName
      const userDb = testEnv
        .authenticatedContext(userId, { email: 'user@example.com' })
        .firestore();
      const userRef = doc(userDb, 'users', userId);
      
      await assertSucceeds(
        updateDoc(userRef, {
          email: 'user@example.com',
          displayName: 'Updated Name',
          isManager: false,
        })
      );
    });

    it('should allow user to add updatedAt timestamp on update', async () => {
      // This tests the App.tsx flow where returning users get updatedAt set
      const userId = 'user123';
      
      // Setup: Create user document without updatedAt
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, 'users', userId), {
          email: 'user@example.com',
          displayName: 'Test User',
          isManager: false,
        });
      });

      // Test: User can add updatedAt field on update
      const userDb = testEnv
        .authenticatedContext(userId, { email: 'user@example.com' })
        .firestore();
      const userRef = doc(userDb, 'users', userId);
      
      const now = new Date();
      await assertSucceeds(
        updateDoc(userRef, {
          email: 'user@example.com',
          displayName: 'Test User',
          isManager: false,
          updatedAt: now,  // Can add updatedAt even if it doesn't exist
        })
      );
    });

    it('should deny user changing their own isManager field', async () => {
      const userId = 'user123';
      
      // Setup: Create user document
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, 'users', userId), {
          email: 'user@example.com',
          displayName: 'Test User',
          isManager: false,
        });
      });

      // Test: User cannot change their own isManager
      const userDb = testEnv
        .authenticatedContext(userId, { email: 'user@example.com' })
        .firestore();
      const userRef = doc(userDb, 'users', userId);
      
      await assertFails(
        updateDoc(userRef, {
          email: 'user@example.com',
          displayName: 'Test User',
          isManager: true,
        })
      );
    });

    it('should deny user changing their email', async () => {
      const userId = 'user123';
      
      // Setup: Create user document
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, 'users', userId), {
          email: 'user@example.com',
          displayName: 'Test User',
          isManager: false,
        });
      });

      // Test: User cannot change their email
      const userDb = testEnv
        .authenticatedContext(userId, { email: 'user@example.com' })
        .firestore();
      const userRef = doc(userDb, 'users', userId);
      
      await assertFails(
        updateDoc(userRef, {
          email: 'newemail@example.com',
          displayName: 'Test User',
          isManager: false,
        })
      );
    });

    it('should allow manager to update another user\'s isManager field', async () => {
      const managerId = 'manager123';
      const userId = 'user123';
      
      // Setup: Create manager and user documents
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, 'users', managerId), {
          email: 'manager@example.com',
          displayName: 'Manager',
          isManager: true,
        });
        await setDoc(doc(adminDb, 'users', userId), {
          email: 'user@example.com',
          displayName: 'User',
          isManager: false,
        });
      });

      // Test: Manager can update user's isManager (using custom claim)
      const managerDb = testEnv
        .authenticatedContext(managerId, { 
          email: 'manager@example.com',
          isManager: true  // Custom claim
        })
        .firestore();
      const userRef = doc(managerDb, 'users', userId);
      
      await assertSucceeds(
        updateDoc(userRef, {
          email: 'user@example.com',
          displayName: 'User',
          isManager: true,
        })
      );
    });

    it('should deny manager changing their own isManager field', async () => {
      const managerId = 'manager123';
      
      // Setup: Create manager document
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, 'users', managerId), {
          email: 'manager@example.com',
          displayName: 'Manager',
          isManager: true,
        });
      });

      // Test: Manager cannot demote themselves
      const managerDb = testEnv
        .authenticatedContext(managerId, { 
          email: 'manager@example.com',
          isManager: true  // Custom claim
        })
        .firestore();
      const managerRef = doc(managerDb, 'users', managerId);
      
      await assertFails(
        updateDoc(managerRef, {
          email: 'manager@example.com',
          displayName: 'Manager',
          isManager: false,
        })
      );
    });
  });

  describe('User Deletion', () => {
    it('should deny user deleting their own document', async () => {
      const userId = 'user123';
      
      // Setup: Create user document
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, 'users', userId), {
          email: 'user@example.com',
          displayName: 'Test User',
          isManager: false,
        });
      });

      // Test: User cannot delete their own document
      const userDb = testEnv
        .authenticatedContext(userId, { email: 'user@example.com' })
        .firestore();
      const userRef = doc(userDb, 'users', userId);
      
      await assertFails(deleteDoc(userRef));
    });

    it('should deny manager deleting any user document', async () => {
      const managerId = 'manager123';
      const userId = 'user123';
      
      // Setup: Create manager and user documents
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, 'users', managerId), {
          email: 'manager@example.com',
          displayName: 'Manager',
          isManager: true,
        });
        await setDoc(doc(adminDb, 'users', userId), {
          email: 'user@example.com',
          displayName: 'User',
          isManager: false,
        });
      });

      // Test: Manager cannot delete user document
      const managerDb = testEnv
        .authenticatedContext(managerId, { 
          email: 'manager@example.com',
          isManager: true  // Custom claim
        })
        .firestore();
      const userRef = doc(managerDb, 'users', userId);
      
      await assertFails(deleteDoc(userRef));
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
      // Setup: Create users
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
      });
    });

    it('should allow manager via Firestore document to read any user', async () => {
      // Manager WITHOUT custom claim (only Firestore document has isManager: true)
      const managerDb = testEnv
        .authenticatedContext('firestoreManager', { 
          email: 'firestoremanager@example.com'
          // NOTE: No isManager custom claim!
        })
        .firestore();
      
      // Can read own user document
      const ownRef = doc(managerDb, 'users', 'firestoreManager');
      await assertSucceeds(getDoc(ownRef));
      
      // Can read another user's document
      const otherRef = doc(managerDb, 'users', 'regularUser');
      await assertSucceeds(getDoc(otherRef));
    });

    it('should allow manager via Firestore document to update another user\'s role', async () => {
      const managerDb = testEnv
        .authenticatedContext('firestoreManager', { 
          email: 'firestoremanager@example.com'
          // NOTE: No isManager custom claim!
        })
        .firestore();
      
      const userRef = doc(managerDb, 'users', 'regularUser');
      
      await assertSucceeds(
        updateDoc(userRef, {
          email: 'regular@example.com',
          displayName: 'Regular User',
          isManager: true,  // Promote to manager
        })
      );
    });
  });

  describe('Collection Queries - Manager Access', () => {
    // Tests that verify collection queries (list operations) work for managers.
    // The production app uses queries like:
    //   query(collection(db, "users"), orderBy("displayName", "asc"))
    // to populate the user management view for managers.
    
    beforeEach(async () => {
      // Setup: Create multiple users
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
        
        // Create regular users
        await setDoc(doc(adminDb, 'users', 'regularUser1'), {
          email: 'regular1@example.com',
          displayName: 'Regular User 1',
          isManager: false,
        });
        await setDoc(doc(adminDb, 'users', 'regularUser2'), {
          email: 'regular2@example.com',
          displayName: 'Regular User 2',
          isManager: false,
        });
      });
    });

    it('should allow manager with custom claims to list all users', async () => {
      const managerDb = testEnv
        .authenticatedContext('claimManager', { 
          email: 'claimmanager@example.com',
          isManager: true  // Custom claim
        })
        .firestore();
      
      // This is the exact query pattern used by the production app for managers
      const usersQuery = query(
        collection(managerDb, 'users'),
        orderBy('displayName', 'asc')
      );
      
      await assertSucceeds(getDocs(usersQuery));
    });

    it('should allow manager via Firestore document to list all users', async () => {
      // Manager WITHOUT custom claim (only Firestore document has isManager: true)
      const managerDb = testEnv
        .authenticatedContext('firestoreManager', { 
          email: 'firestoremanager@example.com'
          // NOTE: No isManager custom claim!
        })
        .firestore();
      
      // This is the exact query pattern used by the production app for managers
      const usersQuery = query(
        collection(managerDb, 'users'),
        orderBy('displayName', 'asc')
      );
      
      await assertSucceeds(getDocs(usersQuery));
    });

    it('should deny regular user listing all users', async () => {
      const userDb = testEnv
        .authenticatedContext('regularUser1', { 
          email: 'regular1@example.com'
        })
        .firestore();
      
      // Non-manager trying to list all users should fail
      const usersQuery = query(
        collection(userDb, 'users'),
        orderBy('displayName', 'asc')
      );
      
      await assertFails(getDocs(usersQuery));
    });
  });
});
