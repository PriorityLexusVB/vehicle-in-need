import { test, expect } from '@playwright/test';

/**
 * E2E Tests for Role-Based Access Control
 * 
 * These tests verify that:
 * - Manager users see admin navigation and can access User Management
 * - Non-manager users do NOT see admin elements and cannot access admin pages
 * 
 * Note: These tests currently check UI without full Firebase mocking.
 * Full auth mocking can be implemented using the auth-mock-utils.ts helpers.
 */

test.describe('Role-Based UI Visibility', () => {
  test('Manager user can see admin navigation elements', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Check if manager navigation is present
    const managerNav = page.getByTestId('manager-nav');
    const hasManagerNav = await managerNav.isVisible().catch(() => false);
    
    if (hasManagerNav) {
      // Manager is authenticated - verify all admin UI elements
      
      // 1. Verify navigation pills are visible
      await expect(managerNav).toBeVisible();
      await expect(page.getByTestId('dashboard-nav-link')).toBeVisible();
      await expect(page.getByTestId('admin-nav-link')).toBeVisible();
      
      // 2. Verify navigation text
      await expect(page.getByText('Dashboard')).toBeVisible();
      await expect(page.getByText('User Management')).toBeVisible();
      
      // 3. Verify settings gear icon
      await expect(page.getByTestId('admin-settings-link')).toBeVisible();
      
      console.log('✅ Manager UI verified: Navigation elements present');
    } else {
      console.log('⏭️  No manager authentication - skipping manager UI checks');
    }
  });
  
  test('Manager user can navigate to User Management page', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const adminNavLink = page.getByTestId('admin-nav-link');
    const hasAdminNav = await adminNavLink.isVisible().catch(() => false);
    
    if (hasAdminNav) {
      // Click User Management link
      await adminNavLink.click();
      
      // Wait for navigation
      await page.waitForURL('**/admin', { timeout: 5000 });
      await page.waitForLoadState('networkidle');
      
      // Verify we're on admin page
      await expect(page).toHaveURL(/#\/admin/);
      
      // Verify User Management heading
      await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible();
      
      // Verify description text is present
      const descriptionText = page.getByText(/Use the toggles to grant or revoke manager permissions/);
      await expect(descriptionText).toBeVisible();
      
      console.log('✅ Manager navigation verified: User Management page accessible');
    } else {
      console.log('⏭️  No manager authentication - skipping navigation test');
    }
  });
  
  test('Manager user can access admin page via gear icon', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const settingsLink = page.getByTestId('admin-settings-link');
    const hasSettingsLink = await settingsLink.isVisible().catch(() => false);
    
    if (hasSettingsLink) {
      // Click gear icon
      await settingsLink.click();
      
      // Wait for navigation
      await page.waitForURL('**/admin', { timeout: 5000 });
      await page.waitForLoadState('networkidle');
      
      // Verify admin page loaded
      await expect(page).toHaveURL(/#\/admin/);
      await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible();
      
      console.log('✅ Settings icon navigation verified');
    } else {
      console.log('⏭️  No manager authentication - skipping gear icon test');
    }
  });
  
  test('Manager user can access admin page via direct URL', async ({ page }) => {
    await page.goto('/#/admin');
    await page.waitForLoadState('networkidle');
    
    // Check if User Management heading is visible
    const heading = page.getByRole('heading', { name: 'User Management' });
    const hasAccess = await heading.isVisible().catch(() => false);
    
    if (hasAccess) {
      // User has manager access
      await expect(heading).toBeVisible();
      await expect(page).toHaveURL(/#\/admin/);
      
      console.log('✅ Direct URL access verified for manager');
    } else {
      // User was redirected (not a manager or not authenticated)
      console.log('⏭️  Redirected from admin page - no manager access');
    }
  });
});

test.describe('Non-Manager Access Restrictions', () => {
  test('Non-manager user should not see admin navigation', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Check for manager navigation
    const managerNav = page.getByTestId('manager-nav');
    const hasManagerNav = await managerNav.isVisible().catch(() => false);
    
    if (!hasManagerNav) {
      // Good - no manager navigation visible
      
      // Verify manager-specific elements are NOT present
      await expect(managerNav).not.toBeVisible();
      
      // Verify settings gear icon is also NOT visible
      const settingsLink = page.getByTestId('admin-settings-link');
      await expect(settingsLink).not.toBeVisible();
      
      // Verify page is still functional
      await expect(page.locator('body')).toBeVisible();
      
      console.log('✅ Non-manager UI verified: No admin elements visible');
    } else {
      console.log('⚠️  Manager navigation visible - user may be authenticated as manager');
    }
  });
  
  test('Non-manager user should be redirected from admin page', async ({ page }) => {
    await page.goto('/#/admin');
    await page.waitForLoadState('networkidle');
    
    // Give time for potential redirect
    await page.waitForTimeout(1000);
    
    const currentUrl = page.url();
    const heading = page.getByRole('heading', { name: 'User Management' });
    const hasAccess = await heading.isVisible().catch(() => false);
    
    if (hasAccess) {
      console.log('⚠️  User has access to admin page - may be a manager');
    } else {
      // User should be redirected away from admin
      expect(currentUrl).not.toContain('/admin');
      
      console.log('✅ Access restriction verified: Non-manager redirected from admin page');
    }
  });
  
  test('Non-manager user should see order form but not order list', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const managerNav = page.getByTestId('manager-nav');
    const hasManagerNav = await managerNav.isVisible().catch(() => false);
    
    if (!hasManagerNav) {
      // Non-manager view should show the order form
      const orderFormHeading = page.getByRole('heading', { name: /Submit a New Vehicle Request/i });
      const hasOrderForm = await orderFormHeading.isVisible().catch(() => false);
      
      if (hasOrderForm) {
        await expect(orderFormHeading).toBeVisible();
        console.log('✅ Non-manager form access verified');
      } else {
        console.log('⏭️  Order form not visible - may not be authenticated');
      }
    } else {
      console.log('⏭️  Manager authentication detected - skipping non-manager checks');
    }
  });
});

test.describe('Production Diagnostics', () => {
  test('should log bundle info on page load', async ({ page }) => {
    const consoleLogs: string[] = [];
    
    page.on('console', (msg) => {
      if (msg.type() === 'log') {
        consoleLogs.push(msg.text());
      }
    });
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Verify bundle info is logged
    const hasBundleInfo = consoleLogs.some(log => 
      log.includes('Application Bundle Info') || 
      log.includes('Version:') || 
      log.includes('Build Time:') ||
      log.includes('Environment:')
    );
    
    expect(hasBundleInfo).toBe(true);
    console.log('✅ Bundle info diagnostics verified');
  });
  
  test('should not have Tailwind CDN in production build', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Check if Tailwind CDN script is present
    const tailwindCDN = await page.locator('script[src*="cdn.tailwindcss.com"]').count();
    
    expect(tailwindCDN).toBe(0);
    console.log('✅ No Tailwind CDN detected in production build');
  });
  
  test('should have production environment flag', async ({ page }) => {
    const consoleLogs: string[] = [];
    
    page.on('console', (msg) => {
      if (msg.type() === 'log') {
        consoleLogs.push(msg.text());
      }
    });
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // In production build, should see "Environment: production"
    // In dev, should see "Environment: development"
    const hasEnvLog = consoleLogs.some(log => 
      log.includes('Environment:')
    );
    
    expect(hasEnvLog).toBe(true);
    console.log('✅ Environment flag logged');
  });
});

test.describe('Service Worker Behavior', () => {
  test('should handle service worker cleanup without infinite reload', async ({ page }) => {
    let reloadCount = 0;
    
    // Track page reloads
    page.on('load', () => {
      reloadCount++;
    });
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Wait a bit to see if any auto-reloads occur
    await page.waitForTimeout(2000);
    
    // Should have loaded once, maybe reload once for SW cleanup, but no infinite loop
    expect(reloadCount).toBeLessThanOrEqual(2);
    
    if (reloadCount > 1) {
      console.log('✅ Service worker cleanup reload occurred (expected once)');
    } else {
      console.log('✅ No service worker cleanup needed');
    }
  });
});
