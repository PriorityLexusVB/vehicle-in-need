import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CSVUpload from '../CSVUpload';
import { AppUser } from '../../types';

// Mock user for testing
const mockUser: AppUser = {
  uid: 'test-uid',
  email: 'test@priorityautomotive.com',
  displayName: 'Test User',
  isManager: true,
};

describe('CSVUpload', () => {
  const mockOnUpload = vi.fn();
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders idle state with file upload zone', () => {
    render(
      <CSVUpload
        onUpload={mockOnUpload}
        currentUser={mockUser}
        onClose={mockOnClose}
      />
    );

    expect(screen.getByText('Import Orders from CSV')).toBeInTheDocument();
    expect(screen.getByText(/Drag and drop a CSV file here/i)).toBeInTheDocument();
    expect(screen.getByText('browse')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    render(
      <CSVUpload
        onUpload={mockOnUpload}
        currentUser={mockUser}
        onClose={mockOnClose}
      />
    );

    const closeButton = screen.getByLabelText('Close CSV upload');
    await userEvent.click(closeButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('has a file input for CSV files', () => {
    render(
      <CSVUpload
        onUpload={mockOnUpload}
        currentUser={mockUser}
        onClose={mockOnClose}
      />
    );

    const input = screen.getByLabelText('Upload CSV file');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('accept', '.csv');
    expect(input).toHaveAttribute('type', 'file');
  });

  it('displays the browse button for file selection', async () => {
    render(
      <CSVUpload
        onUpload={mockOnUpload}
        currentUser={mockUser}
        onClose={mockOnClose}
      />
    );

    const browseButton = screen.getByText('browse');
    expect(browseButton).toBeInTheDocument();
    expect(browseButton).toHaveAttribute('type', 'button');
  });

  it('shows CSV format guidance', () => {
    render(
      <CSVUpload
        onUpload={mockOnUpload}
        currentUser={mockUser}
        onClose={mockOnClose}
      />
    );

    expect(screen.getByText(/CSV must include a CUSTOMER column/)).toBeInTheDocument();
    expect(screen.getByText(/DATE, SALES PERSON, DEPOSIT/)).toBeInTheDocument();
  });
});
