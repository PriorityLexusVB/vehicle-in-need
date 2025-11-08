import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OrderForm from '../OrderForm';
import { OrderStatus } from '../../types';

describe('OrderForm', () => {
  const mockOnAddOrder = vi.fn();
  const mockUser = {
    uid: 'test-user',
    email: 'test@example.com',
    displayName: 'Test User',
    isManager: false
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the form with all required fields', () => {
    render(<OrderForm onAddOrder={mockOnAddOrder} currentUser={mockUser} />);
    
    // Check for key input fields by id
    expect(screen.getByLabelText(/^customer name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^date\*/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^year/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^model\*/i)).toBeInTheDocument();
  });

  it('pre-fills salesperson field with current user display name', () => {
    render(<OrderForm onAddOrder={mockOnAddOrder} currentUser={mockUser} />);
    
    const salespersonInput = screen.getByLabelText(/^salesperson/i) as HTMLInputElement;
    expect(salespersonInput.value).toBe('Test User');
  });

  it('validates required fields on submission', async () => {
    const user = userEvent.setup();
    render(<OrderForm onAddOrder={mockOnAddOrder} currentUser={mockUser} />);
    
    // Try to submit without filling required fields
    const submitButton = screen.getByRole('button', { name: /add order/i });
    await user.click(submitButton);
    
    // Form should not call onAddOrder without required fields
    expect(mockOnAddOrder).not.toHaveBeenCalled();
  });

  it('submits form with valid data', async () => {
    const user = userEvent.setup();
    mockOnAddOrder.mockResolvedValue(true);
    
    render(<OrderForm onAddOrder={mockOnAddOrder} currentUser={mockUser} />);
    
    // Fill in required fields using id selectors
    const customerInput = screen.getByLabelText(/^customer name/i);
    const modelInput = screen.getByLabelText(/^model\*$/i);
    
    await user.type(customerInput, 'John Doe');
    await user.type(modelInput, 'Lexus RX 350');
    
    // Submit form
    const submitButton = screen.getByRole('button', { name: /add order/i });
    await user.click(submitButton);
    
    await waitFor(() => {
      expect(mockOnAddOrder).toHaveBeenCalledTimes(1);
    });
  });

  it('shows success message after successful submission', async () => {
    const user = userEvent.setup();
    mockOnAddOrder.mockResolvedValue(true);
    
    render(<OrderForm onAddOrder={mockOnAddOrder} currentUser={mockUser} />);
    
    // Fill and submit
    await user.type(screen.getByLabelText(/^customer name/i), 'John Doe');
    await user.type(screen.getByLabelText(/^model\*$/i), 'Lexus RX 350');
    
    const submitButton = screen.getByRole('button', { name: /add order/i });
    await user.click(submitButton);
    
    // Should show success message
    await waitFor(() => {
      expect(screen.getByText(/order created successfully/i)).toBeInTheDocument();
    });
  });

  it('resets form after successful submission', async () => {
    const user = userEvent.setup();
    mockOnAddOrder.mockResolvedValue(true);
    
    render(<OrderForm onAddOrder={mockOnAddOrder} currentUser={mockUser} />);
    
    const customerInput = screen.getByLabelText(/^customer name/i) as HTMLInputElement;
    const modelInput = screen.getByLabelText(/^model\*$/i) as HTMLInputElement;
    
    // Fill form
    await user.type(customerInput, 'John Doe');
    await user.type(modelInput, 'Lexus RX 350');
    
    // Submit
    await user.click(screen.getByRole('button', { name: /add order/i }));
    
    // After successful submission, fields should be cleared
    await waitFor(() => {
      expect(customerInput.value).toBe('');
      expect(modelInput.value).toBe('');
    });
  });

  it('allows selecting different status options', async () => {
    const user = userEvent.setup();
    render(<OrderForm onAddOrder={mockOnAddOrder} currentUser={mockUser} />);
    
    // Find and click a different status button
    const locateButton = screen.getByRole('button', { name: 'Locate' });
    await user.click(locateButton);
    
    // The button should now be selected (visual feedback via class)
    expect(locateButton).toHaveClass('bg-sky-600');
  });

  it('handles submission errors gracefully', async () => {
    const user = userEvent.setup();
    mockOnAddOrder.mockResolvedValue(false);
    
    render(<OrderForm onAddOrder={mockOnAddOrder} currentUser={mockUser} />);
    
    // Fill and submit using specific selectors
    await user.type(screen.getByLabelText(/^customer name/i), 'John Doe');
    await user.type(screen.getByLabelText(/^model\*$/i), 'Lexus RX 350');
    await user.click(screen.getByRole('button', { name: /add order/i }));
    
    // Should handle error without crashing
    await waitFor(() => {
      expect(mockOnAddOrder).toHaveBeenCalled();
    });
  });
});
