import { Order } from '../../types';

/**
 * Helper functions for formatting collapsed card summary fields
 */

/**
 * Formats the salesperson name for display
 * Returns 'TBD' if salesperson is not set
 */
export const formatSalesperson = (order: Order): string => {
  return order.salesperson?.trim() || 'TBD';
};

/**
 * Formats the deposit amount for display
 * Returns 'No deposit' if deposit is 0, negative, or not set
 */
export const formatDeposit = (order: Order): string => {
  if (typeof order.depositAmount !== 'number' || order.depositAmount <= 0) {
    return 'No deposit';
  }
  return `$${order.depositAmount.toLocaleString()}`;
};

/**
 * Formats the exterior color code for display
 * Returns 'Ext: TBD' if no color is set
 */
export const formatExtColor = (order: Order): string => {
  const color = order.exteriorColor1?.trim();
  return color ? `Ext: ${color}` : 'Ext: TBD';
};

/**
 * Formats the model number for display
 * Returns empty string if no model number is set
 */
export const formatModelNumber = (order: Order): string => {
  const model = order.modelNumber?.trim();
  return model ? `Model: ${model}` : '';
};
