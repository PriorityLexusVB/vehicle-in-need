import React from 'react';
import { AppUser } from '../types';
import { CloseIcon } from './icons/CloseIcon';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  users: AppUser[];
  currentUser: AppUser;
  onUpdateUserRole: (uid: string, isManager: boolean) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  users,
  currentUser,
  onUpdateUserRole,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      aria-labelledby="modal-title"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="relative bg-white w-full max-w-2xl max-h-[90vh] rounded-2xl shadow-xl border border-slate-200 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-200">
          <h2 id="modal-title" className="text-xl font-bold text-slate-800">
            User Management
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-colors"
            aria-label="Close"
          >
            <CloseIcon className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <p className="text-sm text-slate-600 mb-6">
            Use the toggles to grant or revoke manager permissions for users. Managers can view all orders and manage user roles.
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
                    />
                    <div className="w-11 h-6 bg-slate-300 rounded-full peer peer-focus:ring-4 peer-focus:ring-sky-300 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-600 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"></div>
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
