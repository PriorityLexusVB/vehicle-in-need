import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import SettingsPage from '../SettingsPage';
import { AppUser, VehicleOption } from '../../types';

const mockUsers: AppUser[] = [
  { uid: 'user-1', email: 'manager@test.com', displayName: 'Manager User', isManager: true },
  { uid: 'user-2', email: 'regular@test.com', displayName: 'Regular User', isManager: false },
  { uid: 'user-3', email: 'another@test.com', displayName: 'Another User', isManager: false },
];

const mockCurrentUser: AppUser = mockUsers[0];

const mockVehicleOptions: VehicleOption[] = [
  { id: '1', code: 'PW01', name: 'Premium Wheels', type: 'exterior' },
  { id: '2', code: 'LA40', name: 'Leather Black', type: 'interior' },
];

describe('SettingsPage', () => {
  const mockOnUpdateUserRole = vi.fn();
  const mockOnAddVehicleOption = vi.fn();
  const mockOnDeleteVehicleOption = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders section tabs', () => {
    render(
      <SettingsPage
        users={mockUsers}
        currentUser={mockCurrentUser}
        vehicleOptions={mockVehicleOptions}
        onUpdateUserRole={mockOnUpdateUserRole}
        onAddVehicleOption={mockOnAddVehicleOption}
        onDeleteVehicleOption={mockOnDeleteVehicleOption}
      />
    );

    // Check for section tabs
    expect(screen.getAllByText('User Management')).toHaveLength(2); // One in tab, one in content
    expect(screen.getByText('Vehicle Options')).toBeInTheDocument();
  });

  it('renders user management content by default', () => {
    render(
      <SettingsPage
        users={mockUsers}
        currentUser={mockCurrentUser}
        vehicleOptions={mockVehicleOptions}
        onUpdateUserRole={mockOnUpdateUserRole}
        onAddVehicleOption={mockOnAddVehicleOption}
        onDeleteVehicleOption={mockOnDeleteVehicleOption}
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
        vehicleOptions={mockVehicleOptions}
        onUpdateUserRole={mockOnUpdateUserRole}
        onAddVehicleOption={mockOnAddVehicleOption}
        onDeleteVehicleOption={mockOnDeleteVehicleOption}
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
        vehicleOptions={mockVehicleOptions}
        onUpdateUserRole={mockOnUpdateUserRole}
        onAddVehicleOption={mockOnAddVehicleOption}
        onDeleteVehicleOption={mockOnDeleteVehicleOption}
      />
    );

    const currentUserToggle = screen.getByTestId('manager-toggle-user-1') as HTMLInputElement;
    expect(currentUserToggle.disabled).toBe(true);
  });
});
