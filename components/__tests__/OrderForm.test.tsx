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

  it('renders year input as a text field with numeric input mode', () => {
    render(<OrderForm onAddOrder={mockOnAddOrder} currentUser={mockUser} />);
    
    const yearInput = screen.getByLabelText(/^year/i) as HTMLInputElement;
    expect(yearInput).toBeInTheDocument();
    expect(yearInput.type).toBe('text');
    expect(yearInput).toHaveAttribute('inputMode', 'numeric');
    expect(yearInput).toHaveAttribute('maxLength', '4');
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

  it('renders only Factory Order and Dealer Exchange status buttons (Locate removed)', () => {
    render(<OrderForm onAddOrder={mockOnAddOrder} currentUser={mockUser} />);
    
    // Should have Factory Order and Dealer Exchange status buttons
    expect(screen.getByRole('button', { name: /factory order/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /dealer exchange/i })).toBeInTheDocument();
    
    // Should NOT have Locate status button (removed per product requirements)
    expect(screen.queryByRole('button', { name: /^locate$/i })).not.toBeInTheDocument();
  });

  it('validates year field - rejects years that are too old', async () => {
    const user = userEvent.setup();
    render(<OrderForm onAddOrder={mockOnAddOrder} currentUser={mockUser} />);
    
    // Fill in required fields
    await user.type(screen.getByLabelText(/^manager/i), 'Manager Name');
    await user.type(screen.getByLabelText(/^customer name/i), 'John Doe');
    await user.type(screen.getByLabelText(/^deal #/i), 'D123');
    await user.type(screen.getByLabelText(/^model\*/i), 'ES 350');
    await user.type(screen.getByLabelText(/^model #/i), '350H');
    await user.type(screen.getByLabelText(/^options\*/i), 'Standard package');
    await user.type(screen.getByLabelText(/^msrp/i), '50000');
    await user.type(screen.getByLabelText(/^deposit amount/i), '1000');
    await user.type(screen.getByLabelText(/Exterior Color #1/i), 'ABC1');
    await user.type(screen.getByLabelText(/Interior Color #1/i), 'XYZ1');
    
    // Enter invalid year (too old)
    const yearInput = screen.getByLabelText(/^year/i);
    await user.clear(yearInput);
    await user.type(yearInput, '1899');
    
    // Try to submit
    const submitButton = screen.getByRole('button', { name: /add order/i });
    await user.click(submitButton);
    
    // Should show validation error
    expect(screen.getByText(/year must be between 1900 and/i)).toBeInTheDocument();
    expect(mockOnAddOrder).not.toHaveBeenCalled();
  });

  it('validates year field - rejects years that are too far in the future', async () => {
    const user = userEvent.setup();
    const currentYear = new Date().getFullYear();
    render(<OrderForm onAddOrder={mockOnAddOrder} currentUser={mockUser} />);
    
    // Fill in required fields
    await user.type(screen.getByLabelText(/^manager/i), 'Manager Name');
    await user.type(screen.getByLabelText(/^customer name/i), 'John Doe');
    await user.type(screen.getByLabelText(/^deal #/i), 'D123');
    await user.type(screen.getByLabelText(/^model\*/i), 'ES 350');
    await user.type(screen.getByLabelText(/^model #/i), '350H');
    await user.type(screen.getByLabelText(/^options\*/i), 'Standard package');
    await user.type(screen.getByLabelText(/^msrp/i), '50000');
    await user.type(screen.getByLabelText(/^deposit amount/i), '1000');
    await user.type(screen.getByLabelText(/Exterior Color #1/i), 'ABC1');
    await user.type(screen.getByLabelText(/Interior Color #1/i), 'XYZ1');
    
    // Enter invalid year (too far in future)
    const yearInput = screen.getByLabelText(/^year/i);
    await user.clear(yearInput);
    await user.type(yearInput, (currentYear + 10).toString());
    
    // Try to submit
    const submitButton = screen.getByRole('button', { name: /add order/i });
    await user.click(submitButton);
    
    // Should show validation error
    expect(screen.getByText(/year must be between 1900 and/i)).toBeInTheDocument();
    expect(mockOnAddOrder).not.toHaveBeenCalled();
  });

  it('validates year field - rejects non-4-digit values', async () => {
    const user = userEvent.setup();
    render(<OrderForm onAddOrder={mockOnAddOrder} currentUser={mockUser} />);
    
    // Fill in required fields
    await user.type(screen.getByLabelText(/^manager/i), 'Manager Name');
    await user.type(screen.getByLabelText(/^customer name/i), 'John Doe');
    await user.type(screen.getByLabelText(/^deal #/i), 'D123');
    await user.type(screen.getByLabelText(/^model\*/i), 'ES 350');
    await user.type(screen.getByLabelText(/^model #/i), '350H');
    await user.type(screen.getByLabelText(/^options\*/i), 'Standard package');
    await user.type(screen.getByLabelText(/^msrp/i), '50000');
    await user.type(screen.getByLabelText(/^deposit amount/i), '1000');
    await user.type(screen.getByLabelText(/Exterior Color #1/i), 'ABC1');
    await user.type(screen.getByLabelText(/Interior Color #1/i), 'XYZ1');
    
    // Enter invalid year (3 digits) - maxLength will prevent the 4th char but form should still validate
    const yearInput = screen.getByLabelText(/^year/i) as HTMLInputElement;
    await user.clear(yearInput);
    await user.type(yearInput, '202');
    
    // Verify only 3 characters were entered due to maxLength behavior
    expect(yearInput.value).toBe('202');
    
    // Try to submit
    const submitButton = screen.getByRole('button', { name: /add order/i });
    await user.click(submitButton);
    
    // Should show validation error
    expect(screen.getByText(/year must be a 4-digit number/i)).toBeInTheDocument();
    expect(mockOnAddOrder).not.toHaveBeenCalled();
  });

  it('accepts valid year values within the allowed range', async () => {
    const user = userEvent.setup();
    const currentYear = new Date().getFullYear();
    mockOnAddOrder.mockResolvedValue(true);
    render(<OrderForm onAddOrder={mockOnAddOrder} currentUser={mockUser} />);
    
    // Fill in all required fields with valid data
    await user.type(screen.getByLabelText(/^manager/i), 'Manager Name');
    await user.type(screen.getByLabelText(/^customer name/i), 'John Doe');
    await user.type(screen.getByLabelText(/^deal #/i), 'D123');
    await user.type(screen.getByLabelText(/^model\*/i), 'ES 350');
    await user.type(screen.getByLabelText(/^model #/i), '350H');
    await user.type(screen.getByLabelText(/^options\*/i), 'Standard package');
    await user.type(screen.getByLabelText(/^msrp/i), '50000');
    await user.type(screen.getByLabelText(/^deposit amount/i), '1000');
    await user.type(screen.getByLabelText(/Exterior Color #1/i), 'ABC1');
    await user.type(screen.getByLabelText(/Interior Color #1/i), 'XYZ1');
    
    // Enter valid year (current year + 1)
    const yearInput = screen.getByLabelText(/^year/i);
    await user.clear(yearInput);
    await user.type(yearInput, (currentYear + 1).toString());
    
    // Submit the form
    const submitButton = screen.getByRole('button', { name: /add order/i });
    await user.click(submitButton);
    
    // Should successfully submit
    expect(mockOnAddOrder).toHaveBeenCalled();
  });
});
