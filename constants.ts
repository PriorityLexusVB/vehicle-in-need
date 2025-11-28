import { OrderStatus } from './types';

// All status options (used for filtering - includes legacy for backwards compatibility)
export const STATUS_OPTIONS = [
  OrderStatus.FactoryOrder,
  OrderStatus.Locate,
  OrderStatus.DealerExchange,
  OrderStatus.Received,
  OrderStatus.Delivered,
];

// Active status options for dropdowns and filters (excludes terminal states Received/Delivered/Secured)
export const ACTIVE_STATUS_OPTIONS = [
  OrderStatus.FactoryOrder,
  OrderStatus.Locate,
  OrderStatus.DealerExchange,
];

export const STATUS_COLORS: Record<OrderStatus, string> = {
  [OrderStatus.FactoryOrder]: 'bg-sky-100 text-sky-800 border-sky-300',
  [OrderStatus.Locate]: 'bg-amber-100 text-amber-800 border-amber-300',
  [OrderStatus.DealerExchange]: 'bg-purple-100 text-purple-800 border-purple-300',
  [OrderStatus.Received]: 'bg-green-100 text-green-800 border-green-300',
  [OrderStatus.Delivered]: 'bg-slate-100 text-slate-800 border-slate-300',
  [OrderStatus.Secured]: 'bg-slate-100 text-slate-800 border-slate-300',
};

/**
 * Normalizes legacy status values for UI display.
 * Maps 'Received' and 'Delivered' to 'Secured' for consistent UI labeling.
 * This is a UI-only transformation - the database values remain unchanged.
 */
export function normalizeStatusForUI(status: OrderStatus): OrderStatus {
  if (status === OrderStatus.Received || status === OrderStatus.Delivered) {
    return OrderStatus.Secured;
  }
  return status;
}

/**
 * Checks if an order is in a "secured" state (Received, Delivered, or Secured).
 * Used to determine if an order should appear in the Secured History tab.
 */
export function isSecuredStatus(status: OrderStatus): boolean {
  return (
    status === OrderStatus.Received ||
    status === OrderStatus.Delivered ||
    status === OrderStatus.Secured
  );
}

/**
 * Checks if an order is active (not yet secured).
 * Used for filtering active orders in the main list.
 */
export function isActiveStatus(status: OrderStatus): boolean {
  return !isSecuredStatus(status);
}

export const YEARS = ['2025', '2024', '2023'];

// A list of emails that will be granted manager privileges upon their FIRST LOGIN ONLY.
// All emails should be lowercase and use the @priorityautomotive.com domain.
// 
// IMPORTANT: This list is used ONLY for initial seeding when a user logs in for the first time.
// After the first login, the user's manager status is stored in Firestore and can be changed
// via the Settings page. Subsequent logins will read from Firestore, NOT from this constant.
// 
// DOMAIN RESTRICTION: Only users with @priorityautomotive.com emails can access the system.
// This is enforced in the authentication logic (App.tsx).
// 
// To grant a NEW user manager permissions: Add their email to this list before their first login.
// To grant an EXISTING user manager permissions: Use the Settings page or update Firestore directly.
export const MANAGER_EMAILS = [
    'manager1@priorityautomotive.com',
    'dealership_admin@priorityautomotive.com',
    'rob.brasco@priorityautomotive.com'
];

// Firestore constants for storing user roles.
export const USERS_COLLECTION = 'users';