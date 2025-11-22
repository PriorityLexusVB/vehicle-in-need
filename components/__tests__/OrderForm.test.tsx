import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OrderForm from '../OrderForm';
import { VehicleOption } from '../../types';

describe('OrderForm', () => {
  const mockOnAddOrder = vi.fn();
  const mockUser = {
    uid: 'test-user',
    email: 'test@example.com',
    displayName: 'Test User',
    isManager: false
  };
  const mockVehicleOptions: VehicleOption[] = [
    { id: '1', code: 'PW01', name: 'Premium Wheels', type: 'exterior' },
    { id: '2', code: 'LA40', name: 'Leather Black', type: 'interior' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the form with all required fields', () => {
    render(<OrderForm onAddOrder={mockOnAddOrder} currentUser={mockUser} vehicleOptions={mockVehicleOptions} />);
    
    // Check for key input fields by id
    expect(screen.getByLabelText(/^customer name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^date\*/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^year/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^model\*/i)).toBeInTheDocument();
  });

  it('pre-fills salesperson field with current user display name', () => {
    render(<OrderForm onAddOrder={mockOnAddOrder} currentUser={mockUser} vehicleOptions={mockVehicleOptions} />);
    
    const salespersonInput = screen.getByLabelText(/^salesperson/i) as HTMLInputElement;
    expect(salespersonInput.value).toBe('Test User');
  });

  it('validates required fields on submission', async () => {
    const user = userEvent.setup();
    render(<OrderForm onAddOrder={mockOnAddOrder} currentUser={mockUser} vehicleOptions={mockVehicleOptions} />);
    
    // Try to submit without filling required fields
    const submitButton = screen.getByRole('button', { name: /add order/i });
    await user.click(submitButton);
    
    // Form should not call onAddOrder without required fields
    expect(mockOnAddOrder).not.toHaveBeenCalled();
  });

  it('renders option dropdowns', () => {
    render(<OrderForm onAddOrder={mockOnAddOrder} currentUser={mockUser} vehicleOptions={mockVehicleOptions} />);
    
    expect(screen.getByLabelText(/Ext. Option 1/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Ext. Option 2/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Int. Option 1/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Int. Option 2/i)).toBeInTheDocument();
  });
});
