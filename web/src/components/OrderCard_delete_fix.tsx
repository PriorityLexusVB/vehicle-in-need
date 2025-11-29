/**
 * OrderCard Delete Fix - Safe Delete Handler Component
 * 
 * This component/module provides a safe delete handler that:
 * 1. Does NOT remove orders from UI until server confirms deletion
 * 2. Logs full server response on error for debugging
 * 3. Shows user-friendly error messages when deletion fails
 * 
 * Usage:
 *   Import the useOrderDelete hook and use it in place of direct onDeleteOrder calls.
 *   The hook returns a deleteOrder function that handles the async deletion safely.
 * 
 * Example:
 *   const { deleteOrder, isDeleting, error } = useOrderDelete(onOrderDeleted);
 *   <button onClick={() => deleteOrder(order.id)} disabled={isDeleting}>
 *     {isDeleting ? 'Deleting...' : 'Delete'}
 *   </button>
 *   {error && <ErrorMessage message={error} />}
 * 
 * References:
 *   - Failing job: b7bbf4ce81bc133cf79910dea610113b18695186
 *   - MD060 fixed in PR #134
 */

import React, { useState, useCallback } from 'react';

// Error message component for displaying delete failures
interface DeleteErrorMessageProps {
  error: string;
  onDismiss?: () => void;
}

export const DeleteErrorMessage: React.FC<DeleteErrorMessageProps> = ({ error, onDismiss }) => (
  <div 
    className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-4 flex justify-between items-start"
    role="alert"
    aria-live="polite"
  >
    <div>
      <strong className="font-semibold">Delete Failed</strong>
      <p className="text-sm mt-1">{error}</p>
    </div>
    {onDismiss && (
      <button 
        onClick={onDismiss}
        className="text-red-600 hover:text-red-800 ml-4"
        aria-label="Dismiss error"
      >
        &times;
      </button>
    )}
  </div>
);

// Types for the delete operation
export interface DeleteResult {
  success: boolean;
  orderId: string;
  error?: string;
  details?: unknown;
}

export interface UseOrderDeleteOptions {
  /** Base URL for the delete API (default: '/api/orders') */
  apiBaseUrl?: string;
  /** 
   * Function to get the current Firebase Auth token for authentication.
   * Should be memoized with useCallback for optimal performance.
   * Example: const getAuthToken = useCallback(() => auth.currentUser?.getIdToken() ?? null, []);
   */
  getAuthToken?: () => Promise<string | null>;
  /** Callback when deletion succeeds - only then should UI update */
  onSuccess?: (orderId: string) => void;
  /** Callback when deletion fails */
  onError?: (orderId: string, error: string) => void;
}

export interface UseOrderDeleteReturn {
  /** Function to delete an order - waits for server confirmation */
  deleteOrder: (orderId: string) => Promise<DeleteResult>;
  /** True while a delete request is in progress */
  isDeleting: boolean;
  /** The ID of the order currently being deleted */
  deletingOrderId: string | null;
  /** Last error message, if any */
  error: string | null;
  /** Clear the error state */
  clearError: () => void;
}

/**
 * Hook for safe order deletion that waits for server confirmation
 * 
 * This hook ensures that:
 * 1. UI is NOT updated optimistically - order stays in list until server confirms
 * 2. Full server response is logged for debugging
 * 3. User-friendly error messages are surfaced
 */
export function useOrderDelete(options: UseOrderDeleteOptions = {}): UseOrderDeleteReturn {
  const { 
    apiBaseUrl = '/api/orders',
    getAuthToken,
    onSuccess,
    onError 
  } = options;

  const [isDeleting, setIsDeleting] = useState(false);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const deleteOrder = useCallback(async (orderId: string): Promise<DeleteResult> => {
    // Clear any previous error
    setError(null);
    setIsDeleting(true);
    setDeletingOrderId(orderId);

    console.log(`[OrderDelete] Starting delete request for order: ${orderId}`);

    try {
      // Get auth token if provided
      const authToken = getAuthToken ? await getAuthToken() : null;
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      // Include Firebase Auth token in Authorization header if available
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      const response = await fetch(`${apiBaseUrl}/${orderId}`, {
        method: 'DELETE',
        headers,
        credentials: 'same-origin',
      });

      // Log full response for debugging
      const responseText = await response.text();
      let responseData: unknown;
      
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = { rawText: responseText };
      }

      console.log(`[OrderDelete] Server response for order ${orderId}:`, {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: responseData,
      });

      if (!response.ok) {
        // Extract user-friendly error message
        let userMessage = 'Failed to delete order. Please try again.';
        
        if (response.status === 403 || response.status === 401) {
          userMessage = 'You do not have permission to delete this order. Please contact your manager.';
        } else if (response.status === 404) {
          userMessage = 'Order not found. It may have already been deleted.';
        } else if (response.status === 500) {
          userMessage = 'Server error occurred. Please try again later.';
        } else if (typeof responseData === 'object' && responseData !== null && 'error' in responseData) {
          const errorObj = responseData as { error: string | { message?: string } };
          if (typeof errorObj.error === 'string') {
            userMessage = errorObj.error;
          } else if (errorObj.error?.message) {
            userMessage = errorObj.error.message;
          }
        }

        // Log detailed error for debugging
        console.error(`[OrderDelete] Delete failed for order ${orderId}:`, {
          status: response.status,
          userMessage,
          serverResponse: responseData,
        });

        setError(userMessage);
        onError?.(orderId, userMessage);

        return {
          success: false,
          orderId,
          error: userMessage,
          details: responseData,
        };
      }

      // Success! Now it's safe to update the UI
      console.log(`[OrderDelete] Delete succeeded for order ${orderId}`);
      
      onSuccess?.(orderId);

      return {
        success: true,
        orderId,
      };

    } catch (networkError) {
      // Network or other unexpected error
      const errorMessage = networkError instanceof Error 
        ? networkError.message 
        : 'An unexpected error occurred';
      
      const userMessage = 'Network error. Please check your connection and try again.';

      console.error(`[OrderDelete] Network error for order ${orderId}:`, {
        error: errorMessage,
        stack: networkError instanceof Error ? networkError.stack : undefined,
      });

      setError(userMessage);
      onError?.(orderId, userMessage);

      return {
        success: false,
        orderId,
        error: userMessage,
        details: { networkError: errorMessage },
      };

    } finally {
      setIsDeleting(false);
      setDeletingOrderId(null);
    }
  }, [apiBaseUrl, getAuthToken, onSuccess, onError]);

  return {
    deleteOrder,
    isDeleting,
    deletingOrderId,
    error,
    clearError,
  };
}

// Props for the enhanced delete button component
interface SafeDeleteButtonProps {
  orderId: string;
  onDeleted: (orderId: string) => void;
  /** Function to get the current Firebase Auth token for authentication */
  getAuthToken?: () => Promise<string | null>;
  disabled?: boolean;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Enhanced delete button component with safe delete behavior
 * 
 * Features:
 * - Shows loading state during deletion
 * - Displays error message on failure
 * - Only triggers onDeleted callback after server confirmation
 */
export const SafeDeleteButton: React.FC<SafeDeleteButtonProps> = ({
  orderId,
  onDeleted,
  getAuthToken,
  disabled = false,
  className = '',
  children,
}) => {
  const { deleteOrder, isDeleting, deletingOrderId, error, clearError } = useOrderDelete({
    getAuthToken,
    onSuccess: onDeleted,
  });

  const isThisDeleting = isDeleting && deletingOrderId === orderId;

  const handleClick = async () => {
    if (isDeleting) return;
    
    // Confirm deletion
    const confirmed = window.confirm(
      'Are you sure you want to delete this order? This action cannot be undone.'
    );
    
    if (!confirmed) return;

    await deleteOrder(orderId);
  };

  return (
    <div>
      {error && (
        <DeleteErrorMessage 
          error={error} 
          onDismiss={clearError}
        />
      )}
      <button
        onClick={handleClick}
        disabled={disabled || isDeleting}
        className={`flex items-center gap-1.5 text-sm text-red-600 hover:text-red-800 font-medium py-2 px-3 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
        aria-busy={isThisDeleting}
      >
        {isThisDeleting ? (
          <>
            <svg className="animate-spin h-4 w-4 mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Deleting...
          </>
        ) : (
          children || 'Delete'
        )}
      </button>
    </div>
  );
};

// Example integration with existing OrderCard
// This shows how to integrate the safe delete behavior into the existing component

/**
 * Example of how to modify the existing OrderCard to use safe delete:
 * 
 * In OrderCard.tsx, replace:
 * 
 *   <button onClick={() => onDeleteOrder(order.id)} ...>
 *     <TrashIcon /> Delete
 *   </button>
 * 
 * With:
 * 
 *   import { SafeDeleteButton } from './OrderCard_delete_fix';
 *   import { getAuth } from 'firebase/auth';
 * 
 *   // Get the Firebase Auth token for API calls
 *   const getAuthToken = async () => {
 *     const auth = getAuth();
 *     const user = auth.currentUser;
 *     return user ? await user.getIdToken() : null;
 *   };
 * 
 *   <SafeDeleteButton 
 *     orderId={order.id}
 *     onDeleted={onDeleteOrder}
 *     getAuthToken={getAuthToken}
 *   >
 *     <TrashIcon className="w-4 h-4 text-red-500" />
 *     Delete
 *   </SafeDeleteButton>
 * 
 * Or using the hook directly for more control:
 * 
 *   import { useOrderDelete, DeleteErrorMessage } from './OrderCard_delete_fix';
 *   import { getAuth } from 'firebase/auth';
 * 
 *   const getAuthToken = async () => {
 *     const auth = getAuth();
 *     const user = auth.currentUser;
 *     return user ? await user.getIdToken() : null;
 *   };
 * 
 *   const { deleteOrder, isDeleting, deletingOrderId, error, clearError } = useOrderDelete({
 *     getAuthToken,
 *     onSuccess: onDeleteOrder,
 *     onError: (orderId, errorMsg) => console.error(`Failed to delete ${orderId}: ${errorMsg}`),
 *   });
 * 
 *   {error && <DeleteErrorMessage error={error} onDismiss={clearError} />}
 * 
 *   <button 
 *     onClick={() => deleteOrder(order.id)}
 *     disabled={isDeleting && deletingOrderId === order.id}
 *   >
 *     {isDeleting && deletingOrderId === order.id ? 'Deleting...' : 'Delete'}
 *   </button>
 */

export default SafeDeleteButton;
