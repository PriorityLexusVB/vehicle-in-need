import { describe, it, beforeAll, beforeEach } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { setDoc, doc, getDoc } from 'firebase/firestore';
import { getTestEnv, clearTestData } from './test-env';

let testEnv: RulesTestEnvironment;

/**
 * Proves the @priorityautomotive.com domain gate holds even for MANAGER-shaped
 * accounts. Before 2026-07-13, isManager() was `hasManagerClaim() ||
 * hasManagerInFirestore()` with no domain check, so a non-domain account with a
 * stray isManager custom claim OR users/{uid}.isManager doc inherited full
 * manager access (Codex-found). isManager() is now `isPriorityUser() && (...)`.
 * A historical (isLatest=false) allocation snapshot is manager-only-readable, so
 * it's the cleanest probe of the isManager() gate.
 */
describe('Firestore Security Rules - domain enforcement (manager path)', () => {
  beforeAll(async () => {
    testEnv = await getTestEnv();
  });

  beforeEach(async () => {
    await clearTestData();

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();

      // A non-domain account that has been (wrongly) given a manager doc.
      await setDoc(doc(adminDb, 'users', 'evil-doc-mgr'), {
        uid: 'evil-doc-mgr',
        email: 'evil@gmail.com',
        displayName: 'Outsider',
        isManager: true,
      });

      // Manager-only-readable historical snapshot (isLatest=false).
      await setDoc(doc(adminDb, 'allocationSnapshots', 'old-snapshot'), {
        reportDate: '2026-02-20',
        publishedByUid: 'manager-1',
        publishedByEmail: 'manager@priorityautomotive.com',
        itemCount: 1,
        summary: { units: 1, value: 48000, hybridMix: 0 },
        vehicles: [],
        isLatest: false,
      });

      // An order + note whose owner UID is a NON-domain account (e.g. an
      // Admin-SDK-created historical order) — proves canReadOrder()'s owner
      // branch is domain-gated for the /orders/{id}/notes subcollection.
      await setDoc(doc(adminDb, 'orders', 'order-notes-x'), {
        createdByUid: 'evil-owner',
        createdByEmail: 'evil@gmail.com',
        createdAt: new Date(),
        status: 'Factory Order',
      });
      await setDoc(doc(adminDb, 'orders', 'order-notes-x', 'notes', 'note-1'), {
        text: 'internal note',
        createdAt: new Date(),
        createdByUid: 'manager-1',
        createdByName: 'Manager',
        createdByRole: 'manager',
      });
    });
  });

  it('DENIES a NON-domain account with an isManager CUSTOM CLAIM (manager bypass closed)', async () => {
    const evilClaimDb = testEnv
      .authenticatedContext('evil-claim-mgr', { email: 'evil@gmail.com', isManager: true })
      .firestore();

    // Historical snapshot requires isManager() — must be denied for non-domain.
    await assertFails(getDoc(doc(evilClaimDb, 'allocationSnapshots', 'old-snapshot')));
  });

  it('DENIES a NON-domain account with an isManager FIRESTORE DOC (manager bypass closed)', async () => {
    const evilDocDb = testEnv
      .authenticatedContext('evil-doc-mgr', { email: 'evil@gmail.com' })
      .firestore();

    await assertFails(getDoc(doc(evilDocDb, 'allocationSnapshots', 'old-snapshot')));
  });

  it('ALLOWS a priority-domain manager to read the historical snapshot (positive control)', async () => {
    const managerDb = testEnv
      .authenticatedContext('manager-1', { email: 'manager@priorityautomotive.com', isManager: true })
      .firestore();

    await assertSucceeds(getDoc(doc(managerDb, 'allocationSnapshots', 'old-snapshot')));
  });

  it('DENIES a NON-domain owner-uid reading an order note (canReadOrder domain-gated)', async () => {
    // Same uid as the order's createdByUid, but a non-domain email → denied.
    const evilOwnerDb = testEnv
      .authenticatedContext('evil-owner', { email: 'evil@gmail.com' })
      .firestore();

    await assertFails(getDoc(doc(evilOwnerDb, 'orders', 'order-notes-x', 'notes', 'note-1')));
  });

  it('ALLOWS a priority-domain manager to read an order note (positive control)', async () => {
    const managerDb = testEnv
      .authenticatedContext('manager-1', { email: 'manager@priorityautomotive.com', isManager: true })
      .firestore();

    await assertSucceeds(getDoc(doc(managerDb, 'orders', 'order-notes-x', 'notes', 'note-1')));
  });
});
