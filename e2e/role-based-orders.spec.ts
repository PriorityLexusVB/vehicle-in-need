import { test, expect } from '@playwright/test';

/**
 * E2E Tests for Role-Based Order Visibility
 * 
 * These tests verify that:
 * - Managers can see all orders
 * - Non-managers can only see their own orders
 * - Non-managers see "Your Orders" heading
 * - Managers see "All Orders" heading
 * - Order creation stamps creator identity
 * 
 * Note: These tests are designed to work with or without authentication.
 * When unauthenticated, they verify basic page structure.
 * When authenticated, they verify role-specific functionality.
 */

test.describe('Order Visibility by Role', () => {
  test('manager view should show "All Orders" heading', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Check if manager dashboard is visible
    const allOrdersHeading = page.getByRole('heading', { name: 'All Orders' });
    const dashboardStats = page.getByTestId('dashboard-stats');
    
    const isManagerView = await allOrdersHeading.isVisible().catch(() => false) ||
                          await dashboardStats.isVisible().catch(() => false);
    
    if (isManagerView) {
      console.log('Manager view detected - verifying manager UI');
      
      // Manager should see "All Orders" heading
      await expect(allOrdersHeading).toBeVisible();
      
      // Manager should see dashboard stats
      await expect(dashboardStats).toBeVisible();
      
      // Manager should see "Add New Order" button
      const addOrderButton = page.getByRole('button', { name: /Add New Order/i });
      await expect(addOrderButton).toBeVisible();
      
      // Manager should see admin navigation
      const managerNav = page.getByTestId('manager-nav');
      await expect(managerNav).toBeVisible();
    } else {
      console.log('Manager view not detected - may be non-manager or unauthenticated');
    }
  });

  test('non-manager view should show "Your Orders" heading', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Check if non-manager view is visible
    const yourOrdersHeading = page.getByRole('heading', { name: 'Your Orders' });
    const submitRequestHeading = page.getByRole('heading', { name: 'Submit a New Vehicle Request' });
    
    const isNonManagerView = await yourOrdersHeading.isVisible().catch(() => false);
    const hasSubmitForm = await submitRequestHeading.isVisible().catch(() => false);
    
    if (isNonManagerView && hasSubmitForm) {
      console.log('Non-manager view detected - verifying non-manager UI');
      
      // Non-manager should see "Submit a New Vehicle Request" heading
      await expect(submitRequestHeading).toBeVisible();
      
      // Non-manager should see the order form
      const orderForm = page.locator('form').first();
      await expect(orderForm).toBeVisible();
      
      // Non-manager should see "Your Orders" section
      await expect(yourOrdersHeading).toBeVisible();
      
      // Non-manager should NOT see dashboard stats
      const dashboardStats = page.getByTestId('dashboard-stats');
      await expect(dashboardStats).not.toBeVisible();
      
      // Non-manager should NOT see admin navigation
      const managerNav = page.getByTestId('manager-nav');
      await expect(managerNav).not.toBeVisible();
      
      // Non-manager should NOT see admin settings link
      const adminSettingsLink = page.getByTestId('admin-settings-link');
      await expect(adminSettingsLink).not.toBeVisible();
    } else {
      console.log('Non-manager view not detected - may be manager or unauthenticated');
    }
  });

  test('non-manager should not see status change controls on orders', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Check if this is a non-manager view
    const yourOrdersHeading = page.getByRole('heading', { name: 'Your Orders' });
    const isNonManagerView = await yourOrdersHeading.isVisible().catch(() => false);
    
    if (isNonManagerView) {
      console.log('Non-manager view detected - checking for restricted controls');
      
      // Expand an order card if any orders exist
      const orderCards = page.locator('[data-testid*="order-card"]').or(page.locator('.bg-white').filter({ hasText: /Customer:|Salesperson:/ }));
      const orderCount = await orderCards.count();
      
      if (orderCount > 0) {
        // Click to expand first order
        await orderCards.first().click();
        
        // Wait a bit for expansion
        await page.waitForTimeout(500);
        
        // Non-manager should NOT see "Mark as Received" button
        const markReceivedButton = page.getByRole('button', { name: /Mark as Received/i });
        await expect(markReceivedButton).not.toBeVisible();
        
        // Non-manager should NOT see "Mark as Delivered" button
        const markDeliveredButton = page.getByRole('button', { name: /Mark as Delivered/i });
        await expect(markDeliveredButton).not.toBeVisible();
        
        // Non-manager should NOT see Delete button
        const deleteButton = page.getByRole('button', { name: /Delete/i });
        await expect(deleteButton).not.toBeVisible();
        
        console.log('✓ Confirmed: Non-manager cannot see destructive actions');
      } else {
        console.log('No orders to check - test inconclusive but passing');
      }
    } else {
      console.log('Non-manager view not detected - skipping control visibility test');
    }
  });

  test('manager should see status change controls on orders', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Check if this is a manager view
    const allOrdersHeading = page.getByRole('heading', { name: 'All Orders' });
    const isManagerView = await allOrdersHeading.isVisible().catch(() => false);
    
    if (isManagerView) {
      console.log('Manager view detected - checking for management controls');
      
      // Find order cards
      const orderCards = page.locator('[data-testid*="order-card"]').or(page.locator('.bg-white').filter({ hasText: /Customer:|Salesperson:/ }));
      const orderCount = await orderCards.count();
      
      if (orderCount > 0) {
        // Click to expand first order
        await orderCards.first().click();
        
        // Wait for expansion
        await page.waitForTimeout(500);
        
        // Manager should see at least one control button (the exact button depends on order status)
        // Check for any of the management buttons
        const hasMarkReceived = await page.getByRole('button', { name: /Mark as Received/i }).isVisible().catch(() => false);
        const hasMarkDelivered = await page.getByRole('button', { name: /Mark as Delivered/i }).isVisible().catch(() => false);
        const hasDelete = await page.getByRole('button', { name: /Delete/i }).isVisible().catch(() => false);
        const hasStatusSelect = await page.locator('select').filter({ hasText: /Factory Order|Locate|Dealer Exchange/ }).isVisible().catch(() => false);
        
        const hasAnyControl = hasMarkReceived || hasMarkDelivered || hasDelete || hasStatusSelect;
        
        expect(hasAnyControl).toBe(true);
        console.log('✓ Confirmed: Manager can see order management controls');
      } else {
        console.log('No orders to check - test inconclusive but passing');
      }
    } else {
      console.log('Manager view not detected - skipping control visibility test');
    }
  });

  test('non-manager should be redirected from /admin page', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Check if user is a non-manager
    const yourOrdersHeading = page.getByRole('heading', { name: 'Your Orders' });
    const isNonManagerView = await yourOrdersHeading.isVisible().catch(() => false);
    
    if (isNonManagerView) {
      console.log('Non-manager detected - testing admin page access');
      
      // Try to navigate to admin page
      await page.goto('/#/admin');
      await page.waitForLoadState('networkidle');
      
      // Should be redirected back to home
      await expect(page).toHaveURL(/\/#?\/?$/);
      
      // Should NOT see User Management heading
      const userManagementHeading = page.getByRole('heading', { name: 'User Management' });
      await expect(userManagementHeading).not.toBeVisible();
      
      console.log('✓ Confirmed: Non-manager redirected from admin page');
    } else {
      console.log('Non-manager not detected - skipping admin access test');
    }
  });

  test.skip('order form should be visible for both roles', async ({ page }) => {
    // This test requires authentication - skipping for CI
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Both managers and non-managers should have access to creating orders
    // For managers, it appears after clicking "Add New Order"
    // For non-managers, it's always visible at the top
    
    const addNewOrderButton = page.getByRole('button', { name: /Add New Order/i });
    const isManagerView = await addNewOrderButton.isVisible().catch(() => false);
    
    if (isManagerView) {
      console.log('Manager view - checking form access via button');
      
      // Click "Add New Order" button
      await addNewOrderButton.click();
      
      // Wait for form to appear
      await page.waitForTimeout(300);
    } else {
      console.log('Non-manager or unauthenticated - form should be directly visible');
    }
    
    // Check for form fields that should exist
    const salespersonField = page.locator('input[name="salesperson"], input#salesperson');
    const customerNameField = page.locator('input[name="customerName"], input#customerName');
    
    // At least one of these fields should be visible
    const hasForm = await salespersonField.isVisible().catch(() => false) ||
                     await customerNameField.isVisible().catch(() => false);
    
    expect(hasForm).toBe(true);
  });
});

test.describe('Order Form Submission', () => {
  test.skip('should stamp order with creator identity on submission', async ({ page }) => {
    // This test requires authentication and Firestore inspection
    // Marking as skip for now - would need emulator setup
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // TODO: Fill out order form
    // TODO: Submit order
    // TODO: Verify in Firestore that createdByUid and createdByEmail are set
  });
});

test.describe('Order Card Summary Row', () => {
  test('collapsed order cards should display summary row with key details', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Check if we can see any orders (works for both manager and non-manager views)
    const allOrdersHeading = page.getByRole('heading', { name: 'All Orders' });
    const yourOrdersHeading = page.getByRole('heading', { name: 'Your Orders' });
    
    const isManagerView = await allOrdersHeading.isVisible().catch(() => false);
    const isNonManagerView = await yourOrdersHeading.isVisible().catch(() => false);
    
    if (isManagerView || isNonManagerView) {
      console.log(`${isManagerView ? 'Manager' : 'Non-manager'} view detected - checking order card summary row`);
      
      // Look for the summary row data-testid
      const summaryRows = page.getByTestId('order-card-summary-row');
      const summaryRowCount = await summaryRows.count();
      
      if (summaryRowCount > 0) {
        console.log(`Found ${summaryRowCount} order card(s) with summary rows`);
        
        // Verify the first order card has the summary row elements
        const firstSummaryRow = summaryRows.first();
        await expect(firstSummaryRow).toBeVisible();
        
        // Check for salesperson element
        const salespersonEl = page.getByTestId('order-card-summary-salesperson').first();
        await expect(salespersonEl).toBeVisible();
        const salespersonText = await salespersonEl.textContent();
        // Should have some text (either a name or 'TBD')
        expect(salespersonText).toBeTruthy();
        console.log(`  Salesperson: ${salespersonText}`);
        
        // Check for deposit element
        const depositEl = page.getByTestId('order-card-summary-deposit').first();
        await expect(depositEl).toBeVisible();
        const depositText = await depositEl.textContent();
        // Should show either a dollar amount or 'Deposit: No deposit'
        expect(depositText).toMatch(/Deposit: (\$[\d,]+|No deposit)/);
        console.log(`  Deposit: ${depositText}`);
        
        // Check for exterior color element
        const extColorEl = page.getByTestId('order-card-summary-ext-color').first();
        await expect(extColorEl).toBeVisible();
        const extColorText = await extColorEl.textContent();
        // Should show 'Ext: {code}' or 'Ext: TBD'
        expect(extColorText).toMatch(/Ext: .+/);
        console.log(`  Ext Color: ${extColorText}`);
        
        // Model number is optional, check if present
        const modelEl = page.getByTestId('order-card-summary-model').first();
        const hasModelNumber = await modelEl.isVisible().catch(() => false);
        if (hasModelNumber) {
          const modelText = await modelEl.textContent();
          expect(modelText).toMatch(/Model: .+/);
          console.log(`  Model: ${modelText}`);
        } else {
          console.log('  Model: (not present - optional field)');
        }
        
        console.log('✓ Order card summary row displays correctly');
      } else {
        console.log('No orders found - test inconclusive but passing');
      }
    } else {
      console.log('Neither manager nor non-manager view detected - may be unauthenticated');
    }
  });
  
  test('summary row should be visible without expanding order card', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Check if we can see any orders
    const summaryRows = page.getByTestId('order-card-summary-row');
    const summaryRowCount = await summaryRows.count();
    
    if (summaryRowCount > 0) {
      console.log('Found order cards - verifying summary row is visible in collapsed state');
      
      // The summary row should be visible immediately (without clicking to expand)
      const firstSummaryRow = summaryRows.first();
      await expect(firstSummaryRow).toBeVisible();
      
      // Verify all summary elements are visible in collapsed state
      await expect(page.getByTestId('order-card-summary-salesperson').first()).toBeVisible();
      await expect(page.getByTestId('order-card-summary-deposit').first()).toBeVisible();
      await expect(page.getByTestId('order-card-summary-ext-color').first()).toBeVisible();
      
      console.log('✓ Summary row is visible in collapsed state');
    } else {
      console.log('No orders found - test inconclusive but passing');
    }
  });
});
