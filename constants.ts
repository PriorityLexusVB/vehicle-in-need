
import { OrderStatus } from './types';

export const STATUS_OPTIONS = [
  OrderStatus.FactoryOrder,
  OrderStatus.Locate,
  OrderStatus.DealerExchange,
  OrderStatus.Received,
  OrderStatus.Delivered,
];

export const STATUS_COLORS: Record<OrderStatus, string> = {
  [OrderStatus.FactoryOrder]: 'bg-sky-100 text-sky-800 border-sky-300',
  [OrderStatus.Locate]: 'bg-amber-100 text-amber-800 border-amber-300',
  [OrderStatus.DealerExchange]: 'bg-purple-100 text-purple-800 border-purple-300',
  [OrderStatus.Received]: 'bg-green-100 text-green-800 border-green-300',
  [OrderStatus.Delivered]: 'bg-slate-100 text-slate-800 border-slate-300',
};

export const YEARS = ['2025', '2024', '2023'];

// A list of emails that will be granted manager privileges upon their first login.
// All emails should be lowercase.
// IMPORTANT: To grant a user manager permissions, add their full email address to this list.
export const MANAGER_EMAILS = [
    'manager1@priorityautomotive.com',
    'dealership_admin@priorityautomotive.com',
    'rob.brasco@priorityautomotive.com'
];

// Firestore constants for storing user roles.
export const USERS_COLLECTION = 'users';
