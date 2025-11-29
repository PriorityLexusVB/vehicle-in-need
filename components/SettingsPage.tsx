import React, { useState, useCallback, useEffect } from 'react';
import { AppUser } from '../types';
import { callSetManagerRole, callDisableUser, parseFirebaseFunctionError } from '../services/functionsService';

interface SettingsPageProps {
  users: AppUser[];
  currentUser: AppUser;
  onUpdateUserRole: (uid: string, isManager: boolean) => void;
  onUserStatusChange?: (uid: string, isActive: boolean) => void;
}

/** Loading state for individual user operations */
interface LoadingState {
  [uid: string]: {
    role?: boolean;
    status?: boolean;
  };
}

/** Confirmation modal state */
interface ConfirmModalState {
  isOpen: boolean;
  action: 'disable' | 'enable' | null;
  targetUser: AppUser | null;
}

const SettingsPage: React.FC<SettingsPageProps> = ({
  users,
  currentUser,
  onUpdateUserRole,
  onUserStatusChange,
}) => {
  const [loading, setLoading] = useState<LoadingState>({});
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({
    isOpen: false,
    action: null,
    targetUser: null,
  });
  const [showDisabledUsers, setShowDisabledUsers] = useState(true);

  // Clear messages after a delay
  const clearMessages = useCallback(() => {
    setTimeout(() => {
      setError(null);
      setSuccessMessage(null);
    }, 5000);
  }, []);

  // Handle manager role toggle
  const handleRoleToggle = useCallback(async (user: AppUser, newIsManager: boolean) => {
    // Prevent self-modification
    if (user.uid === currentUser.uid) {
      setError("You cannot change your own manager status.");
      clearMessages();
      return;
    }

    setLoading(prev => ({
      ...prev,
      [user.uid]: { ...prev[user.uid], role: true }
    }));
    setError(null);

    try {
      await callSetManagerRole(user.uid, newIsManager);
      // Update local state optimistically (App.tsx will also update via Firestore listener)
      onUpdateUserRole(user.uid, newIsManager);
      setSuccessMessage(
        `Successfully ${newIsManager ? 'granted' : 'revoked'} manager permissions for ${user.displayName || user.email}.`
      );
      clearMessages();
    } catch (err) {
      setError(parseFirebaseFunctionError(err));
      clearMessages();
    } finally {
      setLoading(prev => ({
        ...prev,
        [user.uid]: { ...prev[user.uid], role: false }
      }));
    }
  }, [currentUser.uid, onUpdateUserRole, clearMessages]);

  // Open confirmation modal for disable/enable
  const openConfirmModal = useCallback((action: 'disable' | 'enable', user: AppUser) => {
    setConfirmModal({
      isOpen: true,
      action,
      targetUser: user,
    });
  }, []);

  // Close confirmation modal
  const closeConfirmModal = useCallback(() => {
    setConfirmModal({
      isOpen: false,
      action: null,
      targetUser: null,
    });
  }, []);

  // Handle keyboard events for modal (Escape to close)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && confirmModal.isOpen) {
        closeConfirmModal();
      }
    };

    if (confirmModal.isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [confirmModal.isOpen, closeConfirmModal]);

  // Handle user status change (disable/enable)
  const handleStatusChange = useCallback(async () => {
    const { action, targetUser } = confirmModal;
    if (!targetUser || !action) return;

    const disabled = action === 'disable';

    // Prevent self-modification
    if (targetUser.uid === currentUser.uid) {
      setError("You cannot disable your own account.");
      closeConfirmModal();
      clearMessages();
      return;
    }

    setLoading(prev => ({
      ...prev,
      [targetUser.uid]: { ...prev[targetUser.uid], status: true }
    }));
    setError(null);
    closeConfirmModal();

    try {
      await callDisableUser(targetUser.uid, disabled);
      // Update local state
      if (onUserStatusChange) {
        onUserStatusChange(targetUser.uid, !disabled);
      }
      setSuccessMessage(
        `Successfully ${disabled ? 'deactivated' : 'reactivated'} ${targetUser.displayName || targetUser.email}.`
      );
      clearMessages();
    } catch (err) {
      setError(parseFirebaseFunctionError(err));
      clearMessages();
    } finally {
      setLoading(prev => ({
        ...prev,
        [targetUser.uid]: { ...prev[targetUser.uid], status: false }
      }));
    }
  }, [confirmModal, currentUser.uid, onUserStatusChange, closeConfirmModal, clearMessages]);

  // Filter users based on showDisabledUsers setting
  const filteredUsers = showDisabledUsers 
    ? users 
    : users.filter(user => user.isActive !== false);

  // Count disabled users
  const disabledCount = users.filter(user => user.isActive === false).length;

  return (
    <div className="animate-fade-in-down">
      {/* User Management Section */}
      <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-lg border border-slate-200">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-slate-800 mb-2">User Management</h2>
          <p className="text-sm text-slate-600 mb-4">
            Manage user roles and account status. Managers can view all orders and manage user roles.
          </p>
          
          {/* Info box about role changes */}
          <div className="mb-6 p-4 bg-sky-50 border border-sky-200 rounded-lg">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-sky-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-sm text-sky-800">
                <p className="font-medium mb-1">About Role Changes</p>
                <ul className="list-disc list-inside space-y-1 text-sky-700">
                  <li><strong>Managers</strong> can view all orders, manage user roles, and deactivate users.</li>
                  <li><strong>Non-managers</strong> can only view and manage their own orders.</li>
                  <li>Role changes require the affected user to <strong>sign out and sign back in</strong> to take effect.</li>
                  <li>You cannot change your own role or deactivate yourself.</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Error/Success Messages */}
          {error && (
            <div 
              role="alert" 
              aria-live="polite"
              className="mb-4 p-4 bg-red-50 border border-red-300 rounded-lg flex items-start gap-3"
            >
              <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}
          
          {successMessage && (
            <div 
              role="status" 
              aria-live="polite"
              className="mb-4 p-4 bg-green-50 border border-green-300 rounded-lg flex items-start gap-3"
            >
              <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-green-800">{successMessage}</p>
            </div>
          )}

          {/* Filter controls */}
          {disabledCount > 0 && (
            <div className="mb-4 flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showDisabledUsers}
                  onChange={(e) => setShowDisabledUsers(e.target.checked)}
                  className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                Show deactivated users ({disabledCount})
              </label>
            </div>
          )}

          {/* User list */}
          <div className="space-y-3">
            {filteredUsers.map((user) => {
              const isCurrentUser = user.uid === currentUser.uid;
              const isUserActive = user.isActive !== false;
              const isRoleLoading = loading[user.uid]?.role;
              const isStatusLoading = loading[user.uid]?.status;

              return (
                <div
                  key={user.uid}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg border ${
                    !isUserActive 
                      ? 'bg-slate-100 border-slate-300' 
                      : 'bg-slate-50 border-slate-200'
                  }`}
                  data-testid={`user-row-${user.uid}`}
                >
                  <div className="flex items-center gap-3 mb-3 sm:mb-0">
                    {/* User avatar placeholder */}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm ${
                      user.isManager ? 'bg-sky-500' : 'bg-slate-400'
                    }`}>
                      {user.displayName?.charAt(0)?.toUpperCase() || user.email?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className={`font-semibold ${!isUserActive ? 'text-slate-500' : 'text-slate-800'}`}>
                          {user.displayName || 'Unknown User'}
                        </p>
                        {isCurrentUser && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-sky-100 text-sky-700 rounded-full">
                            You
                          </span>
                        )}
                        {!isUserActive && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">
                            Deactivated
                          </span>
                        )}
                      </div>
                      <p className={`text-sm ${!isUserActive ? 'text-slate-400' : 'text-slate-500'}`}>
                        {user.email}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4 sm:gap-6">
                    {/* Manager toggle */}
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-600">Manager</span>
                      <label 
                        htmlFor={`manager-toggle-${user.uid}`} 
                        className="relative inline-flex items-center cursor-pointer"
                      >
                        <span className="sr-only">Toggle manager status for {user.displayName}</span>
                        <input
                          type="checkbox"
                          id={`manager-toggle-${user.uid}`}
                          data-testid={`manager-toggle-${user.uid}`}
                          className="sr-only peer"
                          checked={user.isManager}
                          disabled={isCurrentUser || isRoleLoading || !isUserActive}
                          onChange={(e) => handleRoleToggle(user, e.target.checked)}
                        />
                        <div className={`w-11 h-6 bg-slate-300 rounded-full peer peer-focus:ring-4 peer-focus:ring-sky-300 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-600 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 ${
                          isRoleLoading ? 'animate-pulse' : ''
                        }`}></div>
                      </label>
                    </div>

                    {/* Deactivate/Reactivate button */}
                    {!isCurrentUser && (
                      <button
                        onClick={() => openConfirmModal(isUserActive ? 'disable' : 'enable', user)}
                        disabled={isStatusLoading}
                        className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                          isUserActive
                            ? 'text-red-600 bg-red-50 hover:bg-red-100 border border-red-200'
                            : 'text-green-600 bg-green-50 hover:bg-green-100 border border-green-200'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                        data-testid={`status-toggle-${user.uid}`}
                      >
                        {isStatusLoading ? (
                          <span className="flex items-center gap-1">
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Processing...
                          </span>
                        ) : isUserActive ? 'Deactivate' : 'Reactivate'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {filteredUsers.length === 0 && (
              <div className="text-center py-8 text-slate-500">
                {users.length === 0 
                  ? 'No users found.' 
                  : 'No active users to display. Enable "Show deactivated users" to see all users.'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmModal.isOpen && confirmModal.targetUser && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-modal-title"
        >
          {/* Backdrop - click to close */}
          <button
            type="button"
            className="absolute inset-0 w-full h-full cursor-default"
            onClick={closeConfirmModal}
            aria-label="Close modal"
            tabIndex={-1}
          />
          <div 
            className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 relative z-10"
            role="document"
          >
            <h3 id="confirm-modal-title" className="text-xl font-bold text-slate-800 mb-2">
              {confirmModal.action === 'disable' ? 'Deactivate User' : 'Reactivate User'}
            </h3>
            <p className="text-slate-600 mb-6">
              {confirmModal.action === 'disable' ? (
                <>
                  Are you sure you want to deactivate <strong>{confirmModal.targetUser.displayName || confirmModal.targetUser.email}</strong>? 
                  They will no longer be able to sign in to the application.
                </>
              ) : (
                <>
                  Are you sure you want to reactivate <strong>{confirmModal.targetUser.displayName || confirmModal.targetUser.email}</strong>? 
                  They will be able to sign in to the application again.
                </>
              )}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={closeConfirmModal}
                className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleStatusChange}
                className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${
                  confirmModal.action === 'disable'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-green-600 hover:bg-green-700'
                }`}
                data-testid="confirm-modal-action"
              >
                {confirmModal.action === 'disable' ? 'Deactivate' : 'Reactivate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
