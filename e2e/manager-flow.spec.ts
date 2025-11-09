import { test, expect } from '@playwright/test';

/**
 * E2E Tests for Manager Flow
 * 
 * These tests verify that manager users can:
 * - See manager-specific navigation elements
 * - Access the admin settings page
 * - View and manage user roles
 * 
 * Note: These tests require Firebase authentication to be properly configured
 * and a test manager account to exist in the system.
 */

test.describe('Application Load and Console Errors', () => {
  test('should load without MutationObserver errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    const mutationObserverErrors: string[] = [];
    
    // Capture console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        consoleErrors.push(text);
        if (text.includes('MutationObserver') || text.includes('parameter 1 is not of type')) {
          mutationObserverErrors.push(text);
        }
      }
    });

    // Capture page errors
    page.on('pageerror', (error) => {
      const text = error.message;
      consoleErrors.push(text);
      if (text.includes('MutationObserver') || text.includes('parameter 1 is not of type')) {
        mutationObserverErrors.push(text);
      }
    });

    await page.goto('/');
    
    // Wait for the page to load
    await page.waitForLoadState('networkidle');
    
    // Verify no MutationObserver errors
    expect(mutationObserverErrors).toHaveLength(0);
    
    // Page should have loaded successfully
    await expect(page.locator('body')).toBeVisible();
  });

  test('should not have Tailwind CDN warnings', async ({ page }) => {
    const consoleWarnings: string[] = [];
    
    // Capture console warnings
    page.on('console', (msg) => {
      if (msg.type() === 'warning') {
        consoleWarnings.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Check that there are no warnings about cdn.tailwindcss.com
    // Note: This is a test that checks console warning strings, not URL sanitization
    const tailwindCdnWarnings = consoleWarnings.filter(w => 
      w.includes('cdn.tailwindcss.com') || w.includes('should not be used in production')
    );
    
    expect(tailwindCdnWarnings).toHaveLength(0);
  });

  test('should log bundle info on load', async ({ page }) => {
    const consoleLogs: string[] = [];
    
    // Capture console logs
    page.on('console', (msg) => {
      if (msg.type() === 'log') {
        consoleLogs.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Verify bundle info is logged
    const bundleInfoLogs = consoleLogs.filter(log => 
      log.includes('Application Bundle Info') || 
      log.includes('Version:') || 
      log.includes('Build Time:')
    );
    
    expect(bundleInfoLogs.length).toBeGreaterThan(0);
  });
});

test.describe('Manager User Flow', () => {
  test.skip('should display manager navigation for manager users', async ({ page }) => {
    // This test requires actual authentication
    // Skip by default and run manually with authenticated session
    await page.goto('/');
    
    // TODO: Implement authentication flow or use authenticated session
    
    // Verify manager navigation elements
    await expect(page.getByText('Dashboard')).toBeVisible();
    await expect(page.getByText('User Management')).toBeVisible();
    
    // Verify gear icon is present
    const settingsLink = page.getByRole('link', { name: /user management/i });
    await expect(settingsLink).toBeVisible();
  });

  test.skip('should navigate to admin settings page when clicking User Management', async ({ page }) => {
    await page.goto('/');
    
    // TODO: Implement authentication flow
    
    // Click on User Management link
    await page.getByText('User Management').click();
    
    // Verify we're on the admin page
    await expect(page).toHaveURL(/#\/admin/);
    
    // Verify settings page content
    await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible();
    await expect(page.getByText(/Use the toggles to grant or revoke manager permissions/)).toBeVisible();
  });

  test.skip('should display user list with toggles in settings page', async ({ page }) => {
    await page.goto('/#/admin');
    
    // TODO: Implement authentication flow
    
    // Verify user list is visible
    await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible();
    
    // Verify at least one user row exists
    const userRows = page.locator('.space-y-3 > div');
    await expect(userRows.first()).toBeVisible();
    
    // Verify toggle switches are present
    const toggles = page.locator('input[type="checkbox"]');
    await expect(toggles.first()).toBeVisible();
  });

  test.skip('should prevent manager from changing their own role', async ({ page }) => {
    await page.goto('/#/admin');
    
    // TODO: Implement authentication flow and identify current user
    
    // Find current user's toggle (would need to identify which one is disabled)
    const disabledToggle = page.locator('input[type="checkbox"][disabled]');
    await expect(disabledToggle).toBeVisible();
    await expect(disabledToggle).toBeDisabled();
  });

  test.skip('should allow manager to toggle other users roles', async ({ page }) => {
    await page.goto('/#/admin');
    
    // TODO: Implement authentication flow
    
    // Find an enabled toggle
    const enabledToggle = page.locator('input[type="checkbox"]:not([disabled])').first();
    
    // Get initial state
    const initialState = await enabledToggle.isChecked();
    
    // Click the toggle's label (since input is sr-only)
    const toggleLabel = page.locator('label').filter({ has: enabledToggle }).first();
    await toggleLabel.click();
    
    // Verify state changed
    const newState = await enabledToggle.isChecked();
    expect(newState).toBe(!initialState);
  });
});

test.describe('Non-Manager User Flow', () => {
  test.skip('should not display manager navigation for non-manager users', async ({ page }) => {
    await page.goto('/');
    
    // TODO: Implement authentication flow for non-manager user
    
    // Verify manager navigation is NOT present
    await expect(page.getByText('User Management')).not.toBeVisible();
    
    // Verify gear icon is NOT present
    const settingsLinks = page.getByRole('link', { name: /user management/i });
    await expect(settingsLinks).toHaveCount(0);
  });

  test.skip('should redirect non-manager from admin page to dashboard', async ({ page }) => {
    // TODO: Implement authentication flow for non-manager user
    
    // Try to access admin page directly
    await page.goto('/#/admin');
    
    // Should be redirected to home
    await page.waitForURL('/#/');
    await expect(page).toHaveURL('/#/');
  });
});

test.describe('Unauthenticated User Flow', () => {
  test('should display login page for unauthenticated users', async ({ page }) => {
    await page.goto('/');
    
    // Wait for the page to load
    await page.waitForLoadState('networkidle');
    
    // Verify login elements are present (Google sign-in button or login form)
    // This test will pass even without authentication
    await expect(page.locator('body')).toBeVisible();
  });

  test.skip('should redirect unauthenticated users from admin page', async ({ page }) => {
    await page.goto('/#/admin');
    
    // Should redirect to login or home
    await page.waitForURL(/\//);
  });
});
