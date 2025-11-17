/**
 * Shared test environment for Firestore rules tests
 * 
 * This module provides a singleton test environment to prevent
 * race conditions and transaction lock timeouts that occur when
 * multiple test files create their own environments.
 */

import {
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ID = 'test-firestore-rules';
const RULES_PATH = path.join(__dirname, '../../firestore.rules');

let testEnv: RulesTestEnvironment | null = null;

/**
 * Get or create the shared test environment
 * This ensures only one test environment exists across all test files
 */
export async function getTestEnv(): Promise<RulesTestEnvironment> {
  if (!testEnv) {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: fs.readFileSync(RULES_PATH, 'utf8'),
      },
    });
  }
  return testEnv;
}

/**
 * Cleanup the test environment
 * Should be called once after all tests complete
 */
export async function cleanupTestEnv(): Promise<void> {
  if (testEnv) {
    await testEnv.cleanup();
    testEnv = null;
  }
}

/**
 * Clear all data from Firestore
 * Safe to call from beforeEach hooks in tests
 */
export async function clearTestData(): Promise<void> {
  const env = await getTestEnv();
  await env.clearFirestore();
}
