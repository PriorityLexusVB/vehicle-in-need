import React, { useState } from 'react';
import { AppUser, VehicleOption } from '../types';
import VehicleOptionsManager from './VehicleOptionsManager';

interface SettingsPageProps {
  users: AppUser[];
  currentUser: AppUser;
  vehicleOptions: VehicleOption[];
  onUpdateUserRole: (uid: string, isManager: boolean) => void;
  onAddVehicleOption: (option: Omit<VehicleOption, 'id'>) => Promise<void>;
  onDeleteVehicleOption: (optionId: string) => Promise<void>;
}

const SettingsPage: React.FC<SettingsPageProps> = ({
  users,
  currentUser,
  vehicleOptions,
  onUpdateUserRole,
  onAddVehicleOption,
  onDeleteVehicleOption,
}) => {
  const [activeSection, setActiveSection] = useState<'users' | 'options'>('users');

  return (
    <div className="animate-fade-in-down">
      {/* Section Navigation */}
      <div className="mb-6 bg-white p-2 rounded-xl shadow-md border border-slate-200">
        <nav className="flex gap-2" aria-label="Settings Sections">
          <button
            onClick={() => setActiveSection('users')}
            className={`flex-1 py-2 px-4 rounded-lg font-semibold text-sm transition-all ${
              activeSection === 'users'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            User Management
          </button>
          <button
            onClick={() => setActiveSection('options')}
            className={`flex-1 py-2 px-4 rounded-lg font-semibold text-sm transition-all ${
              activeSection === 'options'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Vehicle Options
          </button>
        </nav>
      </div>

      {/* User Management Section */}
      {activeSection === 'users' && (
        <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-lg border border-slate-200">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl font-bold text-slate-800 mb-2">User Management</h2>
            <p className="text-sm text-slate-600 mb-8">
              Use the toggles to grant or revoke manager permissions for users. Managers can view all orders and manage user roles. You cannot change your own role.
            </p>
            <div className="space-y-3">
              {users.map((user) => (
                <div
                  key={user.uid}
                  className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200"
                  data-testid={`user-row-${user.uid}`}
                >
                  <div>
                    <p className="font-semibold text-slate-800">{user.displayName}</p>
                    <p className="text-sm text-slate-500">{user.email}</p>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span className="text-sm font-medium text-slate-600">Manager</span>
                    <label htmlFor={`manager-toggle-${user.uid}`} className="relative inline-flex items-center cursor-pointer">
                      <span className="sr-only">Toggle manager status for {user.displayName}</span>
                      <input
                        type="checkbox"
                        id={`manager-toggle-${user.uid}`}
                        data-testid={`manager-toggle-${user.uid}`}
                        className="sr-only peer"
                        checked={user.isManager}
                        disabled={user.uid === currentUser.uid}
                        onChange={(e) => onUpdateUserRole(user.uid, e.target.checked)}
                      />
                      <div className="w-11 h-6 bg-slate-300 rounded-full peer peer-focus:ring-4 peer-focus:ring-sky-300 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-600 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"></div>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Vehicle Options Section */}
      {activeSection === 'options' && (
        <VehicleOptionsManager
          options={vehicleOptions}
          onAddOption={onAddVehicleOption}
          onDeleteOption={onDeleteVehicleOption}
        />
      )}
    </div>
  );
};

export default SettingsPage;
