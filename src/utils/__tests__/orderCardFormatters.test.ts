import { describe, it, expect } from 'vitest';
import { formatSalesperson, formatDeposit, formatExtColor, formatModelNumber } from '../orderCardFormatters';
import { Order, OrderStatus } from '../../../types';

// Helper to create a minimal Order for testing
const createOrder = (overrides: Partial<Order> = {}): Order => ({
  id: 'test-id',
  salesperson: '',
  manager: 'Test Manager',
  date: '2024-01-15',
  customerName: 'Test Customer',
  dealNumber: 'D123',
  year: '2024',
  model: 'Test Model',
  modelNumber: '',
  exteriorColor1: '',
  interiorColor1: 'INT1',
  msrp: 50000,
  depositAmount: 0,
  status: OrderStatus.FactoryOrder,
  options: '',
  ...overrides,
});

describe('orderCardFormatters', () => {
  describe('formatSalesperson', () => {
    it('returns salesperson name when set', () => {
      const order = createOrder({ salesperson: 'John Smith' });
      expect(formatSalesperson(order)).toBe('John Smith');
    });

    it('returns TBD when salesperson is empty string', () => {
      const order = createOrder({ salesperson: '' });
      expect(formatSalesperson(order)).toBe('TBD');
    });

    it('returns TBD when salesperson is whitespace only', () => {
      const order = createOrder({ salesperson: '   ' });
      expect(formatSalesperson(order)).toBe('TBD');
    });

    it('trims whitespace from salesperson name', () => {
      const order = createOrder({ salesperson: '  Jane Doe  ' });
      expect(formatSalesperson(order)).toBe('Jane Doe');
    });
  });

  describe('formatDeposit', () => {
    it('returns formatted deposit when amount is set', () => {
      const order = createOrder({ depositAmount: 1000 });
      expect(formatDeposit(order)).toBe('$1,000');
    });

    it('returns No deposit when amount is 0', () => {
      const order = createOrder({ depositAmount: 0 });
      expect(formatDeposit(order)).toBe('No deposit');
    });

    it('returns No deposit when amount is not a number', () => {
      const order = createOrder({ depositAmount: undefined as unknown as number });
      expect(formatDeposit(order)).toBe('No deposit');
    });

    it('formats large amounts with commas', () => {
      const order = createOrder({ depositAmount: 25000 });
      expect(formatDeposit(order)).toBe('$25,000');
    });
  });

  describe('formatExtColor', () => {
    it('returns formatted color when set', () => {
      const order = createOrder({ exteriorColor1: '223' });
      expect(formatExtColor(order)).toBe('Ext: 223');
    });

    it('returns Ext: TBD when color is empty string', () => {
      const order = createOrder({ exteriorColor1: '' });
      expect(formatExtColor(order)).toBe('Ext: TBD');
    });

    it('returns Ext: TBD when color is whitespace only', () => {
      const order = createOrder({ exteriorColor1: '   ' });
      expect(formatExtColor(order)).toBe('Ext: TBD');
    });

    it('trims whitespace from color code', () => {
      const order = createOrder({ exteriorColor1: '  ABC  ' });
      expect(formatExtColor(order)).toBe('Ext: ABC');
    });
  });

  describe('formatModelNumber', () => {
    it('returns formatted model number when set', () => {
      const order = createOrder({ modelNumber: '9702' });
      expect(formatModelNumber(order)).toBe('Model: 9702');
    });

    it('returns empty string when model number is empty', () => {
      const order = createOrder({ modelNumber: '' });
      expect(formatModelNumber(order)).toBe('');
    });

    it('returns empty string when model number is whitespace only', () => {
      const order = createOrder({ modelNumber: '   ' });
      expect(formatModelNumber(order)).toBe('');
    });

    it('trims whitespace from model number', () => {
      const order = createOrder({ modelNumber: '  1234  ' });
      expect(formatModelNumber(order)).toBe('Model: 1234');
    });
  });
});
