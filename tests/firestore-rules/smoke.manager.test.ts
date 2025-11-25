/**
 * Smoke test placeholder for manager access using the existing rules test harness.
 *
 * If your repo has a Firestore rules test harness (tests/firestore-rules/setup.ts), implement
 * a small test here that creates a manager user document and verifies collection/list queries succeed.
 *
 * This file intentionally contains a skipped test to avoid breaking CI in case the harness differs.
 */

import { describe, test } from 'vitest';

describe.skip('smoke: manager access (placeholder)', () => {
  test('implement a smoke test that asserts manager can list orders and users', async () => {
    // TODO: implement using your test harness
  });
});
