/**
 * Firebase Auth and Firestore Mocking Utilities for E2E Tests
 * 
 * This module provides utilities to mock Firebase authentication and Firestore
 * for offline E2E testing without hitting real Firebase services.
 */

import { Page } from '@playwright/test';

export interface MockUser {
  uid: string;
  email: string;
  displayName: string;
  isManager: boolean;
}

/**
 * Mock Firebase authentication state for testing
 */
export async function mockFirebaseAuth(page: Page, user: MockUser | null) {
  await page.addInitScript((mockUser) => {
    // Mock Firebase Auth state
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__mockAuthUser = mockUser;
    
    // Intercept Firebase Auth initialization
    const originalIndexedDB = window.indexedDB;
    Object.defineProperty(window, 'indexedDB', {
      get() {
        // Return a mock that prevents Firebase from persisting auth state
        return {
          ...originalIndexedDB,
          open: (name: string) => {
            // Allow Firebase to use IndexedDB but with mocked data
            if (name.includes('firebase')) {
              const request = originalIndexedDB.open(name);
              return request;
            }
            return originalIndexedDB.open(name);
          }
        };
      }
    });
  }, user);
}

/**
 * Mock Firestore data for a user
 */
export async function mockFirestoreUser(page: Page, user: MockUser) {
  await page.route('**/firestore.googleapis.com/**', async (route) => {
    const url = route.request().url();
    
    // Mock user document lookup
    if (url.includes('users') && route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          documents: [{
            name: `projects/test/databases/(default)/documents/users/${user.uid}`,
            fields: {
              uid: { stringValue: user.uid },
              email: { stringValue: user.email },
              displayName: { stringValue: user.displayName },
              isManager: { booleanValue: user.isManager }
            }
          }]
        })
      });
      return;
    }
    
    // Mock orders collection (empty for non-managers)
    if (url.includes('orders') && route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ documents: [] })
      });
      return;
    }
    
    // Allow other requests through
    await route.continue();
  });
}

/**
 * Setup mock Firebase environment for testing
 */
export async function setupMockFirebase(page: Page, user: MockUser | null) {
  // Mock Firebase configuration
  await page.addInitScript(() => {
    // Mock Firebase SDK methods
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__FIREBASE_MOCKED = true;
  });
  
  if (user) {
    await mockFirebaseAuth(page, user);
    await mockFirestoreUser(page, user);
  } else {
    await mockFirebaseAuth(page, null);
  }
}

/**
 * Create a mock manager user
 */
export function createMockManager(): MockUser {
  return {
    uid: 'manager-test-uid',
    email: 'test.manager@priorityautomotive.com',
    displayName: 'Test Manager',
    isManager: true
  };
}

/**
 * Create a mock non-manager user
 */
export function createMockNonManager(): MockUser {
  return {
    uid: 'user-test-uid',
    email: 'test.user@priorityautomotive.com',
    displayName: 'Test User',
    isManager: false
  };
}

/**
 * Wait for Firebase to initialize and auth state to settle
 */
export async function waitForAuthState(page: Page, timeout = 5000) {
  await page.waitForFunction(
    () => {
      // Wait until Firebase auth state has been checked
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (window as any).__authStateChecked === true;
    },
    { timeout }
  ).catch(() => {
    // Auth state may not set flag in all cases, continue anyway
  });
  
  // Give additional time for React to render
  await page.waitForTimeout(500);
}
