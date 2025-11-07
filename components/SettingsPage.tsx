import React from 'react';
import { AppUser } from '../types';

interface SettingsPageProps {
  users: AppUser[];
  currentUser: AppUser;
  onUpdateUserRole: (uid: string, isManager: boolean) => void;
}

const SettingsPage: React.FC<SettingsPageProps> = ({
  users,
  currentUser,
  onUpdateUserRole,
}) => {
  return (
    <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-lg border border-slate-200 animate-fade-in-down">
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
            >
              <div>
                <p className="font-semibold text-slate-800">{user.displayName}</p>
                <p className="text-sm text-slate-500">{user.email}</p>
              </div>
              <div className="flex items-center space-x-3">
                <span className="text-sm font-medium text-slate-600">Manager</span>
                <label htmlFor={`manager-toggle-${user.uid}`} className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    id={`manager-toggle-${user.uid}`}
                    className="sr-only peer"
                    checked={user.isManager}
                    disabled={user.uid === currentUser.uid}
                    onChange={(e) => onUpdateUserRole(user.uid, e.target.checked)}
                    aria-label={`Toggle manager permission for ${user.displayName}`}
                  />
                  <div className="w-11 h-6 bg-slate-300 rounded-full peer peer-focus:ring-4 peer-focus:ring-sky-300 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-600 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"></div>
                </label>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
