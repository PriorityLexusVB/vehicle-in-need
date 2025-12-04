import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import SettingsPage from '../SettingsPage';
import { AppUser } from '../../types';
import { callSetManagerRole } from '../../services/functionsService';

// Mock the functionsService module
vi.mock('../../services/functionsService', () => ({
  callSetManagerRole: vi.fn(),
  callDisableUser: vi.fn(),
  parseFirebaseFunctionError: vi.fn().mockReturnValue('An error occurred'),
}));

const mockUsers: AppUser[] = [
  { uid: 'user-1', email: 'manager@test.com', displayName: 'Manager User', isManager: true },
  { uid: 'user-2', email: 'regular@test.com', displayName: 'Regular User', isManager: false },
];

const mockCurrentUser: AppUser = mockUsers[0];

describe('SettingsPage Manager Toggle Functionality', () => {
  const mockOnUpdateUserRole = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(callSetManagerRole).mockResolvedValue({ 
      success: true, 
      uid: 'user-2', 
      isManager: true 
    });
  });

  it('should call callSetManagerRole when toggle is clicked', async () => {
    render(
      <SettingsPage
        users={mockUsers}
        currentUser={mockCurrentUser}
        onUpdateUserRole={mockOnUpdateUserRole}
      />
    );

    // Get the toggle for user-2 (not the current user)
    const toggle = screen.getByTestId('manager-toggle-user-2') as HTMLInputElement;
    
    // Toggle should not be disabled for non-current users
    expect(toggle.disabled).toBe(false);
    
    // Toggle should initially be unchecked (user-2 is not a manager)
    expect(toggle.checked).toBe(false);
    
    // Click the toggle
    fireEvent.click(toggle);
    
    // Wait for the async call to complete
    await waitFor(() => {
      expect(callSetManagerRole).toHaveBeenCalledWith('user-2', true);
    });
  });

  it('should call onUpdateUserRole callback after successful toggle', async () => {
    render(
      <SettingsPage
        users={mockUsers}
        currentUser={mockCurrentUser}
        onUpdateUserRole={mockOnUpdateUserRole}
      />
    );

    const toggle = screen.getByTestId('manager-toggle-user-2') as HTMLInputElement;
    
    // Click the toggle
    fireEvent.click(toggle);
    
    // Wait for the success callback
    await waitFor(() => {
      expect(mockOnUpdateUserRole).toHaveBeenCalledWith('user-2', true);
    });
  });

  it('should show success message after successful toggle', async () => {
    render(
      <SettingsPage
        users={mockUsers}
        currentUser={mockCurrentUser}
        onUpdateUserRole={mockOnUpdateUserRole}
      />
    );

    const toggle = screen.getByTestId('manager-toggle-user-2') as HTMLInputElement;
    
    // Click the toggle
    fireEvent.click(toggle);
    
    // Wait for success message
    await waitFor(() => {
      expect(screen.getByText(/Successfully granted manager permissions/)).toBeInTheDocument();
    });
  });

  it('should toggle from true to false when clicking a manager toggle', async () => {
    const usersWithManager: AppUser[] = [
      { uid: 'user-1', email: 'manager@test.com', displayName: 'Manager User', isManager: true },
      { uid: 'user-2', email: 'another-manager@test.com', displayName: 'Another Manager', isManager: true },
    ];
    
    vi.mocked(callSetManagerRole).mockResolvedValue({ 
      success: true, 
      uid: 'user-2', 
      isManager: false 
    });

    render(
      <SettingsPage
        users={usersWithManager}
        currentUser={mockCurrentUser}
        onUpdateUserRole={mockOnUpdateUserRole}
      />
    );

    const toggle = screen.getByTestId('manager-toggle-user-2') as HTMLInputElement;
    
    // Toggle should initially be checked (user-2 is a manager)
    expect(toggle.checked).toBe(true);
    
    // Click the toggle to demote
    fireEvent.click(toggle);
    
    // Should call with false to revoke manager status
    await waitFor(() => {
      expect(callSetManagerRole).toHaveBeenCalledWith('user-2', false);
    });
  });

  it('toggle input should be accessible via label click', async () => {
    const user = userEvent.setup();
    
    render(
      <SettingsPage
        users={mockUsers}
        currentUser={mockCurrentUser}
        onUpdateUserRole={mockOnUpdateUserRole}
      />
    );

    // Find the label that contains the toggle
    const toggle = screen.getByTestId('manager-toggle-user-2') as HTMLInputElement;
    const label = toggle.closest('label');
    
    expect(label).not.toBeNull();
    
    // Click the visual toggle div (which is inside the label)
    await user.click(label!);
    
    await waitFor(() => {
      expect(callSetManagerRole).toHaveBeenCalled();
    });
  });
});
