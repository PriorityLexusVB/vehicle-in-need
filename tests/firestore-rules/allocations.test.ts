import { describe, it, beforeAll, beforeEach } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { setDoc, doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { getTestEnv, clearTestData } from './test-env';

let testEnv: RulesTestEnvironment;

describe('Firestore Security Rules - allocationSnapshots', () => {
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

      await setDoc(doc(adminDb, 'users', 'consultant-1'), {
        uid: 'consultant-1',
        email: 'consultant@priorityautomotive.com',
        displayName: 'Consultant',
        isManager: false,
      });

      await setDoc(doc(adminDb, 'allocationSnapshots', 'latest'), {
        reportDate: '2026-03-01',
        publishedByUid: 'manager-1',
        publishedByEmail: 'manager@priorityautomotive.com',
        itemCount: 1,
        summary: { units: 1, value: 50000, hybridMix: 0 },
        vehicles: [],
        isLatest: true,
      });

      await setDoc(doc(adminDb, 'allocationSnapshots', 'old-snapshot'), {
        reportDate: '2026-02-20',
        publishedByUid: 'manager-1',
        publishedByEmail: 'manager@priorityautomotive.com',
        itemCount: 1,
        summary: { units: 1, value: 48000, hybridMix: 0 },
        vehicles: [],
        isLatest: false,
      });
    });
  });

  it('allows authenticated consultant to read latest snapshot', async () => {
    const consultantDb = testEnv
      .authenticatedContext('consultant-1', { email: 'consultant@priorityautomotive.com' })
      .firestore();

    await assertSucceeds(getDoc(doc(consultantDb, 'allocationSnapshots', 'latest')));
  });

  it('denies authenticated consultant reading historical snapshot', async () => {
    const consultantDb = testEnv
      .authenticatedContext('consultant-1', { email: 'consultant@priorityautomotive.com' })
      .firestore();

    await assertFails(getDoc(doc(consultantDb, 'allocationSnapshots', 'old-snapshot')));
  });

  it('denies consultant create, update, and delete', async () => {
    const consultantDb = testEnv
      .authenticatedContext('consultant-1', { email: 'consultant@priorityautomotive.com' })
      .firestore();

    await assertFails(
      setDoc(doc(consultantDb, 'allocationSnapshots', 'new-snapshot'), {
        reportDate: '2026-03-05',
        publishedByUid: 'consultant-1',
        publishedByEmail: 'consultant@priorityautomotive.com',
        itemCount: 1,
        summary: { units: 1, value: 40000, hybridMix: 0 },
        vehicles: [],
        isLatest: true,
      }),
    );

    await assertFails(
      updateDoc(doc(consultantDb, 'allocationSnapshots', 'latest'), {
        isLatest: false,
      }),
    );

    await assertFails(deleteDoc(doc(consultantDb, 'allocationSnapshots', 'latest')));
  });

  it('allows manager create, update, and delete', async () => {
    const managerDb = testEnv
      .authenticatedContext('manager-1', {
        email: 'manager@priorityautomotive.com',
        isManager: true,
      })
      .firestore();

    await assertSucceeds(
      setDoc(doc(managerDb, 'allocationSnapshots', 'new-snapshot'), {
        reportDate: '2026-03-05',
        publishedByUid: 'manager-1',
        publishedByEmail: 'manager@priorityautomotive.com',
        itemCount: 1,
        summary: { units: 1, value: 40000, hybridMix: 0 },
        vehicles: [],
        isLatest: true,
      }),
    );

    await assertSucceeds(
      updateDoc(doc(managerDb, 'allocationSnapshots', 'latest'), {
        isLatest: false,
      }),
    );

    await assertSucceeds(deleteDoc(doc(managerDb, 'allocationSnapshots', 'new-snapshot')));
  });
});
