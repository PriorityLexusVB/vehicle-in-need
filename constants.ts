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

// A list of known manager emails for INFORMATIONAL LOGGING ONLY.
// All emails should be lowercase and use the @priorityautomotive.com domain.
// 
// IMPORTANT: This list does NOT automatically grant manager permissions!
// Due to Firestore security rules, users cannot self-assign manager status.
// All new users are created with isManager: false.
// 
// To grant manager permissions, use one of these methods:
// 1. Via Settings page: An existing manager can promote users at /#/admin
// 2. Via admin script: npm run seed:managers:apply -- --emails user@priorityautomotive.com
// 
// This list is used only to log informational messages when users in this list
// sign up, reminding administrators to promote them using the above methods.
// 
// DOMAIN RESTRICTION: Only users with @priorityautomotive.com emails can access the system.
// This is enforced in the authentication logic (App.tsx).
export const MANAGER_EMAILS = [
    'manager1@priorityautomotive.com',
    'dealership_admin@priorityautomotive.com',
    'rob.brasco@priorityautomotive.com'
];

// Firestore constants for storing user roles.
export const USERS_COLLECTION = 'users';