import React, { useState } from 'react';
import { CloseIcon } from './icons/CloseIcon';

interface ZeroManagerWarningProps {
  hasManagers: boolean;
  isCurrentUserManager: boolean;
}

/**
 * Displays a dismissible warning banner when no managers are detected in the system.
 * Only shown to non-manager users to alert them of a potential lockout situation.
 * Managers don't see this banner as they can manage roles themselves.
 */
const ZeroManagerWarning: React.FC<ZeroManagerWarningProps> = ({
  hasManagers,
  isCurrentUserManager,
}) => {
  const [dismissed, setDismissed] = useState(false);

  // Don't show if:
  // - There are managers in the system
  // - Current user is a manager (they can fix it themselves)
  // - User has dismissed the banner
  if (hasManagers || isCurrentUserManager || dismissed) {
    return null;
  }

  return (
    <div
      role="alert"
      className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4"
    >
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <svg
            className="h-5 w-5 text-yellow-400"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <div className="ml-3 flex-1">
          <p className="text-sm text-yellow-700 font-medium">
            No managers detected. Please contact an administrator to designate
            at least one manager to avoid system lockout.
          </p>
        </div>
        <div className="ml-auto pl-3">
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="inline-flex rounded-md bg-yellow-50 p-1.5 text-yellow-500 hover:bg-yellow-100 focus:outline-none focus:ring-2 focus:ring-yellow-600 focus:ring-offset-2 focus:ring-offset-yellow-50"
            aria-label="Dismiss warning"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ZeroManagerWarning;
