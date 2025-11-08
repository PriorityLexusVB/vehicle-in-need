import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsPage from '../SettingsPage';
import { AppUser } from '../../types';

describe('SettingsPage', () => {
  const mockUsers: AppUser[] = [
    {
      uid: 'user-1',
      email: 'manager@test.com',
      displayName: 'Manager User',
      isManager: true,
    },
    {
      uid: 'user-2',
      email: 'regular@test.com',
      displayName: 'Regular User',
      isManager: false,
    },
    {
      uid: 'user-3',
      email: 'another@test.com',
      displayName: 'Another User',
      isManager: false,
    },
  ];

  const mockCurrentUser: AppUser = mockUsers[0];

  it('renders user management header and description', () => {
    const onUpdateUserRole = vi.fn();

    render(
      <SettingsPage
        users={mockUsers}
        currentUser={mockCurrentUser}
        onUpdateUserRole={onUpdateUserRole}
      />
    );

    expect(screen.getByText('User Management')).toBeInTheDocument();
    expect(
      screen.getByText(/Use the toggles to grant or revoke manager permissions/)
    ).toBeInTheDocument();
  });

  it('displays all users with their details', () => {
    const onUpdateUserRole = vi.fn();

    render(
      <SettingsPage
        users={mockUsers}
        currentUser={mockCurrentUser}
        onUpdateUserRole={onUpdateUserRole}
      />
    );

    mockUsers.forEach((user) => {
      expect(screen.getByText(user.displayName)).toBeInTheDocument();
      expect(screen.getByText(user.email)).toBeInTheDocument();
    });
  });

  it('disables toggle for current user', () => {
    const onUpdateUserRole = vi.fn();

    const { container } = render(
      <SettingsPage
        users={mockUsers}
        currentUser={mockCurrentUser}
        onUpdateUserRole={onUpdateUserRole}
      />
    );

    const currentUserToggle = container.querySelector(`#manager-toggle-${mockCurrentUser.uid}`) as HTMLInputElement;
    expect(currentUserToggle).toBeDisabled();
  });

  it('enables toggle for other users', () => {
    const onUpdateUserRole = vi.fn();

    const { container } = render(
      <SettingsPage
        users={mockUsers}
        currentUser={mockCurrentUser}
        onUpdateUserRole={onUpdateUserRole}
      />
    );

    const otherUserToggle = container.querySelector('#manager-toggle-user-2') as HTMLInputElement;
    expect(otherUserToggle).not.toBeDisabled();
  });

  it('calls onUpdateUserRole when toggle is changed', async () => {
    const user = userEvent.setup();
    const onUpdateUserRole = vi.fn();

    const { container } = render(
      <SettingsPage
        users={mockUsers}
        currentUser={mockCurrentUser}
        onUpdateUserRole={onUpdateUserRole}
      />
    );

    const toggleForUser2 = container.querySelector('#manager-toggle-user-2') as HTMLInputElement;
    await user.click(toggleForUser2);

    expect(onUpdateUserRole).toHaveBeenCalledWith('user-2', true);
  });

  it('reflects manager status in checkbox checked state', () => {
    const onUpdateUserRole = vi.fn();

    const { container } = render(
      <SettingsPage
        users={mockUsers}
        currentUser={mockCurrentUser}
        onUpdateUserRole={onUpdateUserRole}
      />
    );

    const managerToggle = container.querySelector('#manager-toggle-user-1') as HTMLInputElement;
    const regularToggle = container.querySelector('#manager-toggle-user-2') as HTMLInputElement;

    expect(managerToggle).toBeChecked();
    expect(regularToggle).not.toBeChecked();
  });

  it('prevents current user from changing their own role', async () => {
    const user = userEvent.setup();
    const onUpdateUserRole = vi.fn();

    const { container } = render(
      <SettingsPage
        users={mockUsers}
        currentUser={mockCurrentUser}
        onUpdateUserRole={onUpdateUserRole}
      />
    );

    const currentUserToggle = container.querySelector(`#manager-toggle-${mockCurrentUser.uid}`) as HTMLInputElement;
    
    // Disabled inputs cannot be clicked by user-event, so check it's disabled
    expect(currentUserToggle).toBeDisabled();
    
    // Verify it's the manager's toggle and it cannot be unchecked
    expect(currentUserToggle.checked).toBe(true);
  });

  it('renders correct number of user rows', () => {
    const onUpdateUserRole = vi.fn();

    const { container } = render(
      <SettingsPage
        users={mockUsers}
        currentUser={mockCurrentUser}
        onUpdateUserRole={onUpdateUserRole}
      />
    );

    const userRows = container.querySelectorAll('.space-y-3 > div');
    expect(userRows).toHaveLength(mockUsers.length);
  });
});
