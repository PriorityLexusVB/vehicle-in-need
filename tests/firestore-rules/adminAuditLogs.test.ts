import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { setDoc, doc, collection, getDocs, query, addDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { getTestEnv, clearTestData } from './test-env';

let testEnv: RulesTestEnvironment;

describe('Firestore Security Rules - Admin Audit Logs Collection', () => {
  beforeAll(async () => {
    testEnv = await getTestEnv();
  });

  afterAll(async () => {
    // Note: cleanup is handled globally after all test files complete
  });

  beforeEach(async () => {
    await clearTestData();
  });

  describe('Read Access', () => {
    beforeEach(async () => {
      // Setup: Create audit log entries and users
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        
        // Create a manager
        await setDoc(doc(adminDb, 'users', 'manager123'), {
          email: 'manager@example.com',
          displayName: 'Manager',
          isManager: true,
        });
        
        // Create a regular user
        await setDoc(doc(adminDb, 'users', 'regularUser'), {
          email: 'regular@example.com',
          displayName: 'Regular User',
          isManager: false,
        });
        
        // Create audit log entries
        await addDoc(collection(adminDb, 'adminAuditLogs'), {
          action: 'setManagerRole',
          performedByUid: 'admin1',
          performedByEmail: 'admin1@example.com',
          targetUid: 'user1',
          targetEmail: 'user1@example.com',
          previousValue: { isManager: false },
          newValue: { isManager: true },
          timestamp: new Date(),
          success: true,
        });
        
        await addDoc(collection(adminDb, 'adminAuditLogs'), {
          action: 'disableUser',
          performedByUid: 'admin2',
          performedByEmail: 'admin2@example.com',
          targetUid: 'user2',
          targetEmail: 'user2@example.com',
          previousValue: { disabled: false },
          newValue: { disabled: true },
          timestamp: new Date(),
          success: true,
        });
      });
    });

    it('should allow manager with custom claims to read audit logs', async () => {
      const managerDb = testEnv
        .authenticatedContext('manager123', { 
          email: 'manager@example.com',
          isManager: true  // Custom claim
        })
        .firestore();
      
      const logsQuery = query(collection(managerDb, 'adminAuditLogs'));
      await assertSucceeds(getDocs(logsQuery));
    });

    it('should allow manager via Firestore document to read audit logs', async () => {
      // Manager WITHOUT custom claim (only Firestore document has isManager: true)
      const managerDb = testEnv
        .authenticatedContext('manager123', { 
          email: 'manager@example.com'
          // NOTE: No isManager custom claim!
        })
        .firestore();
      
      const logsQuery = query(collection(managerDb, 'adminAuditLogs'));
      await assertSucceeds(getDocs(logsQuery));
    });

    it('should deny non-manager from reading audit logs', async () => {
      const userDb = testEnv
        .authenticatedContext('regularUser', { 
          email: 'regular@example.com'
        })
        .firestore();
      
      const logsQuery = query(collection(userDb, 'adminAuditLogs'));
      await assertFails(getDocs(logsQuery));
    });

    it('should deny unauthenticated user from reading audit logs', async () => {
      const unauthedDb = testEnv.unauthenticatedContext().firestore();
      
      const logsQuery = query(collection(unauthedDb, 'adminAuditLogs'));
      await assertFails(getDocs(logsQuery));
    });
  });

  describe('Write Access - All Blocked', () => {
    beforeEach(async () => {
      // Setup: Create a manager
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        
        await setDoc(doc(adminDb, 'users', 'manager123'), {
          email: 'manager@example.com',
          displayName: 'Manager',
          isManager: true,
        });
        
        // Create an existing audit log entry for update/delete tests
        await setDoc(doc(adminDb, 'adminAuditLogs', 'existingLog'), {
          action: 'setManagerRole',
          performedByUid: 'admin1',
          performedByEmail: 'admin1@example.com',
          targetUid: 'user1',
          targetEmail: 'user1@example.com',
          previousValue: { isManager: false },
          newValue: { isManager: true },
          timestamp: new Date(),
          success: true,
        });
      });
    });

    it('should deny manager from creating audit log entries', async () => {
      const managerDb = testEnv
        .authenticatedContext('manager123', { 
          email: 'manager@example.com',
          isManager: true
        })
        .firestore();
      
      await assertFails(
        addDoc(collection(managerDb, 'adminAuditLogs'), {
          action: 'setManagerRole',
          performedByUid: 'manager123',
          performedByEmail: 'manager@example.com',
          targetUid: 'someUser',
          targetEmail: 'some@example.com',
          previousValue: { isManager: false },
          newValue: { isManager: true },
          timestamp: new Date(),
          success: true,
        })
      );
    });

    it('should deny manager from updating audit log entries', async () => {
      const managerDb = testEnv
        .authenticatedContext('manager123', { 
          email: 'manager@example.com',
          isManager: true
        })
        .firestore();
      
      const logRef = doc(managerDb, 'adminAuditLogs', 'existingLog');
      await assertFails(
        updateDoc(logRef, { success: false })
      );
    });

    it('should deny manager from deleting audit log entries', async () => {
      const managerDb = testEnv
        .authenticatedContext('manager123', { 
          email: 'manager@example.com',
          isManager: true
        })
        .firestore();
      
      const logRef = doc(managerDb, 'adminAuditLogs', 'existingLog');
      await assertFails(deleteDoc(logRef));
    });

    it('should deny unauthenticated user from creating audit logs', async () => {
      const unauthedDb = testEnv.unauthenticatedContext().firestore();
      
      await assertFails(
        addDoc(collection(unauthedDb, 'adminAuditLogs'), {
          action: 'test',
          timestamp: new Date(),
        })
      );
    });
  });
});
