import { OrderStatus } from './types';

export const STATUS_OPTIONS = [
  OrderStatus.FactoryOrder,
  OrderStatus.Locate,
  OrderStatus.DealerExchange,
];

// Helper to check if a status is considered "secured" (completed)
// This normalizes legacy Delivered/Received statuses to the new Secured workflow
export const isSecuredStatus = (status: OrderStatus): boolean => {
  return status === OrderStatus.Secured || 
         status === OrderStatus.Delivered || 
         status === OrderStatus.Received;
};

export const STATUS_COLORS: Record<OrderStatus, string> = {
  [OrderStatus.FactoryOrder]: 'bg-sky-100 text-sky-800 border-sky-300',
  [OrderStatus.Locate]: 'bg-amber-100 text-amber-800 border-amber-300',
  [OrderStatus.DealerExchange]: 'bg-purple-100 text-purple-800 border-purple-300',
  [OrderStatus.Secured]: 'bg-green-100 text-green-800 border-green-300',
  // Legacy statuses - display same as Secured for backward compatibility
  [OrderStatus.Received]: 'bg-green-100 text-green-800 border-green-300',
  [OrderStatus.Delivered]: 'bg-green-100 text-green-800 border-green-300',
};

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