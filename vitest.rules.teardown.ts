/**
 * Global teardown for Firestore rules tests
 * 
 * This ensures the test environment is properly cleaned up
 * after all test files have completed.
 */

import { cleanupTestEnv } from './tests/firestore-rules/test-env';

export default async function teardown() {
  await cleanupTestEnv();
}
