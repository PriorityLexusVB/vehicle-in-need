import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import SettingsPage from '../SettingsPage';
import { AppUser } from '../../types';

const mockUsers: AppUser[] = [
  { uid: 'user-1', email: 'manager@test.com', displayName: 'Manager User', isManager: true },
  { uid: 'user-2', email: 'regular@test.com', displayName: 'Regular User', isManager: false },
  { uid: 'user-3', email: 'another@test.com', displayName: 'Another User', isManager: false },
];

const mockCurrentUser: AppUser = mockUsers[0];

describe('SettingsPage', () => {
  const mockOnUpdateUserRole = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders user management heading', () => {
    render(
      <SettingsPage
        users={mockUsers}
        currentUser={mockCurrentUser}
        onUpdateUserRole={mockOnUpdateUserRole}
      />
    );

    // Check for user management heading
    expect(screen.getByText('User Management')).toBeInTheDocument();
  });

  it('renders user management content', () => {
    render(
      <SettingsPage
        users={mockUsers}
        currentUser={mockCurrentUser}
        onUpdateUserRole={mockOnUpdateUserRole}
      />
    );

    // Check for user rows
    expect(screen.getByTestId('user-row-user-1')).toBeInTheDocument();
    expect(screen.getByTestId('user-row-user-2')).toBeInTheDocument();
    expect(screen.getByTestId('user-row-user-3')).toBeInTheDocument();
  });

  it('renders all users with manager toggles', () => {
    render(
      <SettingsPage
        users={mockUsers}
        currentUser={mockCurrentUser}
        onUpdateUserRole={mockOnUpdateUserRole}
      />
    );

    // Check for toggle switches
    expect(screen.getByTestId('manager-toggle-user-1')).toBeInTheDocument();
    expect(screen.getByTestId('manager-toggle-user-2')).toBeInTheDocument();
    expect(screen.getByTestId('manager-toggle-user-3')).toBeInTheDocument();
  });

  it('disables toggle for current user', () => {
    render(
      <SettingsPage
        users={mockUsers}
        currentUser={mockCurrentUser}
        onUpdateUserRole={mockOnUpdateUserRole}
      />
    );

    const currentUserToggle = screen.getByTestId('manager-toggle-user-1') as HTMLInputElement;
    expect(currentUserToggle.disabled).toBe(true);
  });

  it('does not render vehicle options section', () => {
    render(
      <SettingsPage
        users={mockUsers}
        currentUser={mockCurrentUser}
        onUpdateUserRole={mockOnUpdateUserRole}
      />
    );

    // Vehicle Options should not be present
    expect(screen.queryByText('Vehicle Options')).not.toBeInTheDocument();
  });
});
