import { describe, it, beforeAll, beforeEach } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { setDoc, doc, getDoc, deleteDoc } from 'firebase/firestore';
import { getTestEnv, clearTestData } from './test-env';

let testEnv: RulesTestEnvironment;

describe('Firestore Security Rules - vehicle_links', () => {
  beforeAll(async () => {
    testEnv = await getTestEnv();
  });

  beforeEach(async () => {
    await clearTestData();

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();

      await setDoc(doc(adminDb, 'users', 'manager-1'), {
        uid: 'manager-1',
        email: 'manager@priorityautomotive.com',
        displayName: 'Manager',
        isManager: true,
      });

      await setDoc(doc(adminDb, 'vehicle_links', 'RX350-001'), {
        orderId: 'order-1',
        linkedAt: new Date(),
        linkedByUid: 'manager-1',
      });
    });
  });

  it('allows a priority-domain user to read a vehicle link (board display)', async () => {
    const consultantDb = testEnv
      .authenticatedContext('consultant-1', { email: 'consultant@priorityautomotive.com' })
      .firestore();

    await assertSucceeds(getDoc(doc(consultantDb, 'vehicle_links', 'RX350-001')));
  });

  it('DENIES a non-priority-domain authenticated user reading a vehicle link', async () => {
    // Domain gate: allocation-claim data must not leak to arbitrary Google accounts.
    const outsiderDb = testEnv
      .authenticatedContext('outsider-1', { email: 'outsider@gmail.com' })
      .firestore();

    await assertFails(getDoc(doc(outsiderDb, 'vehicle_links', 'RX350-001')));
  });

  it('DENIES an unauthenticated user reading a vehicle link', async () => {
    const anonDb = testEnv.unauthenticatedContext().firestore();

    await assertFails(getDoc(doc(anonDb, 'vehicle_links', 'RX350-001')));
  });

  it('DENIES a non-manager priority user writing a vehicle link', async () => {
    const consultantDb = testEnv
      .authenticatedContext('consultant-1', { email: 'consultant@priorityautomotive.com' })
      .firestore();

    await assertFails(
      setDoc(doc(consultantDb, 'vehicle_links', 'RX350-002'), {
        orderId: 'order-2',
        linkedAt: new Date(),
        linkedByUid: 'consultant-1',
      }),
    );
  });

  it('allows a manager to create and delete a vehicle link', async () => {
    const managerDb = testEnv
      .authenticatedContext('manager-1', {
        email: 'manager@priorityautomotive.com',
        isManager: true,
      })
      .firestore();

    await assertSucceeds(
      setDoc(doc(managerDb, 'vehicle_links', 'RX350-003'), {
        orderId: 'order-3',
        linkedAt: new Date(),
        linkedByUid: 'manager-1',
      }),
    );

    await assertSucceeds(deleteDoc(doc(managerDb, 'vehicle_links', 'RX350-003')));
  });
});
