import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { setDoc, doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ID = 'test-firestore-rules';
const RULES_PATH = path.join(__dirname, '../../firestore.rules');

let testEnv: RulesTestEnvironment;

describe('Firestore Security Rules - Users Collection', () => {
  beforeAll(async () => {
    // Initialize test environment with rules
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: fs.readFileSync(RULES_PATH, 'utf8'),
      },
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
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

      // Test: Manager can read user's document
      const managerDb = testEnv
        .authenticatedContext(managerId, { email: 'manager@example.com' })
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

      // Test: Manager can update user's isManager
      const managerDb = testEnv
        .authenticatedContext(managerId, { email: 'manager@example.com' })
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
        .authenticatedContext(managerId, { email: 'manager@example.com' })
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
        .authenticatedContext(managerId, { email: 'manager@example.com' })
        .firestore();
      const userRef = doc(managerDb, 'users', userId);
      
      await assertFails(deleteDoc(userRef));
    });
  });
});
