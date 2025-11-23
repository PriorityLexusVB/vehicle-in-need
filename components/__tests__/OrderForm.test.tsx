import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OrderForm from '../OrderForm';

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

  it('renders color input fields', () => {
    render(<OrderForm onAddOrder={mockOnAddOrder} currentUser={mockUser} />);
    
    // Check for exterior color fields
    expect(screen.getByLabelText(/Exterior Color #1/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Exterior Color #2/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Exterior Color #3/i)).toBeInTheDocument();
    
    // Check for interior color fields
    expect(screen.getByLabelText(/Interior Color #1/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Interior Color #2/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Interior Color #3/i)).toBeInTheDocument();
  });

  it('validates minimum 3 characters for color codes', async () => {
    const user = userEvent.setup();
    render(<OrderForm onAddOrder={mockOnAddOrder} currentUser={mockUser} />);
    
    // Fill in required fields
    await user.type(screen.getByLabelText(/^manager/i), 'Manager Name');
    await user.type(screen.getByLabelText(/^customer name/i), 'John Doe');
    await user.type(screen.getByLabelText(/^deal #/i), 'D123');
    await user.type(screen.getByLabelText(/^model #/i), '350H');
    await user.type(screen.getByLabelText(/^options\*/i), 'Standard package');
    await user.type(screen.getByLabelText(/^msrp/i), '50000');
    await user.type(screen.getByLabelText(/^deposit amount/i), '1000');
    
    // Enter invalid color code (less than 3 characters)
    await user.type(screen.getByLabelText(/Exterior Color #1/i), 'AB');
    await user.type(screen.getByLabelText(/Interior Color #1/i), 'XY');
    
    // Try to submit
    const submitButton = screen.getByRole('button', { name: /add order/i });
    await user.click(submitButton);
    
    // Should show validation errors (multiple instances expected)
    const errors = screen.getAllByText(/must be at least 3 characters/i);
    expect(errors.length).toBeGreaterThan(0);
    expect(mockOnAddOrder).not.toHaveBeenCalled();
  });
});
