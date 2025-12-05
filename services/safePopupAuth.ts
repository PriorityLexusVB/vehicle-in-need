/**
 * Safe Popup Authentication Service
 *
 * This module provides COOP-safe popup authentication that handles the
 * Cross-Origin-Opener-Policy (COOP) console errors gracefully.
 *
 * The issue: Under stricter COOP configurations, Firebase's internal polling of
 * `window.closed` on the popup window is blocked, causing console errors like:
 * "Cross-Origin-Opener-Policy policy would block the window.closed call."
 *
 * The solution: We use Firebase's standard `signInWithPopup` with console error
 * suppression. The COOP "window.closed" console warnings are harmless - they don't
 * affect the actual authentication flow. We simply suppress these noisy errors
 * to avoid confusing users while the auth flow continues to work correctly.
 *
 * This approach:
 * - Uses Firebase's proven popup authentication mechanism
 * - Suppresses harmless COOP console errors
 * - Falls back to redirect auth if popup fails (optional)
 * - Works across all browser configurations
 */

import {
  Auth,
  AuthProvider,
  UserCredential,
  signInWithPopup,
  signInWithRedirect,
} from "firebase/auth";

/**
 * Error codes from Firebase that indicate popup handling failures.
 * These codes can result from COOP restrictions blocking window.closed access,
 * causing the popup to appear closed prematurely.
 */
const POPUP_HANDLING_ERROR_CODES = [
  "auth/popup-closed-by-user",
  "auth/popup-blocked",
  "auth/cancelled-popup-request",
];

/**
 * Check if an error is COOP-related based on error message patterns
 */
function isCOOPRelatedError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const errorMessage = error.message.toLowerCase();
  return (
    errorMessage.includes("cross-origin-opener-policy") ||
    errorMessage.includes("coop") ||
    errorMessage.includes("window.closed")
  );
}

/**
 * Check if error code suggests popup handling failure
 */
function isPopupHandlingError(error: { code?: string }): boolean {
  return POPUP_HANDLING_ERROR_CODES.includes(error.code ?? "");
}

/**
 * Configuration options for safe popup auth
 */
export interface SafePopupAuthOptions {
  /**
   * If true, automatically fall back to redirect if popup fails
   * Default: true
   */
  fallbackToRedirect?: boolean;

  /**
   * If true, suppress console errors related to COOP
   * Default: true
   */
  suppressCOOPErrors?: boolean;

  /**
   * Callback for when popup auth starts
   */
  onPopupStart?: () => void;

  /**
   * Callback for when falling back to redirect
   */
  onFallbackToRedirect?: () => void;
}

/**
 * Result of safe popup auth attempt
 */
export interface SafePopupAuthResult {
  success: boolean;
  credential?: UserCredential;
  error?: Error & { code?: string };
  usedRedirectFallback: boolean;
}

/**
 * Attempts popup-based sign-in with graceful COOP error handling.
 *
 * This function:
 * 1. Attempts Firebase signInWithPopup
 * 2. If COOP-related errors occur, optionally falls back to redirect
 * 3. Suppresses noisy COOP console errors
 *
 * @param auth - Firebase Auth instance
 * @param provider - Auth provider (e.g., GoogleAuthProvider)
 * @param options - Configuration options
 * @returns Promise resolving to auth result
 */
export async function safeSignInWithPopup(
  auth: Auth,
  provider: AuthProvider,
  options: SafePopupAuthOptions = {}
): Promise<SafePopupAuthResult> {
  const {
    fallbackToRedirect = true,
    suppressCOOPErrors = true,
    onPopupStart,
    onFallbackToRedirect,
  } = options;

  // Temporarily override console.error to suppress COOP errors if requested.
  // This only filters errors that match specific COOP-related patterns AND occur
  // during this popup auth operation (the override is scoped to this function).
  const originalConsoleError = console.error;
  const popupOperationId = `popup-auth-${Date.now()}`;
  
  if (suppressCOOPErrors) {
    console.error = (...args: unknown[]) => {
      const message = args.join(" ");
      // Only suppress errors that are specifically about COOP and window.closed
      // These patterns match Firebase SDK's internal popup polling errors
      const isCOOPWindowClosedError =
        message.includes("Cross-Origin-Opener-Policy") &&
        message.includes("window.closed");
      
      if (isCOOPWindowClosedError) {
        // Suppress COOP-related errors - these are expected in strict COOP environments
        // and don't affect functionality when we handle them properly
        if (import.meta.env.DEV) {
          console.debug(
            `[SafePopupAuth:${popupOperationId}] Suppressed COOP window.closed error`
          );
        }
        return;
      }
      originalConsoleError.apply(console, args);
    };
  }

  try {
    onPopupStart?.();

    if (import.meta.env.DEV) {
      console.log(
        "%c🔐 SafePopupAuth - Attempting popup sign-in",
        "color: #3b82f6; font-weight: bold;"
      );
    }

    const credential = await signInWithPopup(auth, provider);

    if (import.meta.env.DEV) {
      console.log(
        "%c✅ SafePopupAuth - Popup sign-in successful",
        "color: #10b981; font-weight: bold;"
      );
    }

    return {
      success: true,
      credential,
      usedRedirectFallback: false,
    };
  } catch (error) {
    const typedError = error as Error & { code?: string };

    if (import.meta.env.DEV) {
      console.warn(
        "%c⚠️ SafePopupAuth - Popup sign-in failed",
        "color: #f59e0b; font-weight: bold;"
      );
      console.warn("Error code:", typedError.code);
      console.warn("Error message:", typedError.message);
    }

    // Check if this is a COOP-related error that we should handle gracefully
    const shouldFallback =
      fallbackToRedirect &&
      (isCOOPRelatedError(error) || isPopupHandlingError(typedError));

    if (shouldFallback) {
      if (import.meta.env.DEV) {
        console.log(
          "%c🔄 SafePopupAuth - Falling back to redirect sign-in",
          "color: #3b82f6; font-weight: bold;"
        );
      }

      onFallbackToRedirect?.();

      try {
        await signInWithRedirect(auth, provider);
        // signInWithRedirect navigates away, so this return won't execute
        // But we include it for type completeness
        return {
          success: true,
          usedRedirectFallback: true,
        };
      } catch (redirectError) {
        const typedRedirectError = redirectError as Error & { code?: string };
        return {
          success: false,
          error: typedRedirectError,
          usedRedirectFallback: true,
        };
      }
    }

    // Not a COOP error or fallback disabled - return the original error
    return {
      success: false,
      error: typedError,
      usedRedirectFallback: false,
    };
  } finally {
    // Restore original console.error
    if (suppressCOOPErrors) {
      console.error = originalConsoleError;
    }
  }
}

/**
 * Determines the best auth method for the current environment.
 *
 * @returns 'popup' if popup is likely to work, 'redirect' otherwise
 */
export function getRecommendedAuthMethod(): "popup" | "redirect" {
  // Guard against SSR environments where window/navigator may not exist
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return "popup"; // Default for SSR
  }

  // In Codespaces/preview environments, popup is often problematic
  const isCodespaces = window.location.hostname.endsWith(".app.github.dev");

  if (isCodespaces) {
    return "redirect";
  }

  // For iOS/Safari, prefer popup to avoid storage partitioning issues with redirect
  const userAgent = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/i.test(userAgent);
  const isChromiumBased = /Chrome|Chromium|CriOS|EdgiOS|Edg\//i.test(userAgent);
  const isFirefox = /Firefox|FxiOS/i.test(userAgent);
  const isSafari =
    /Safari/i.test(userAgent) && !isChromiumBased && !isFirefox;

  // Storage partitioning affects iOS (regardless of browser) and Safari on macOS
  // For these, popup is actually preferred over redirect
  if (isIOS || isSafari) {
    return "popup";
  }

  // Default to popup for most environments
  return "popup";
}

/**
 * Message types for popup-to-opener communication
 * @deprecated Part of deprecated signInWithPopupCOOPSafe API
 */
export interface PopupAuthMessage {
  type: "auth-success" | "auth-error" | "popup-closing";
  payload?: {
    idToken?: string;
    accessToken?: string;
    error?: string;
    errorCode?: string;
  };
}

/**
 * Options for COOP-safe popup authentication
 * @deprecated Part of deprecated signInWithPopupCOOPSafe API
 */
export interface COOPSafePopupOptions {
  /**
   * Overall timeout for the auth flow in milliseconds.
   * Default: 120000 (2 minutes)
   */
  timeout?: number;

  /**
   * Grace period after receiving popup-closing message before rejecting.
   * Allows time for auth-success to arrive if user completed auth just before closing.
   * Default: 1500ms
   */
  closeGracePeriod?: number;

  /**
   * Callback when popup opens
   */
  onPopupOpen?: () => void;

  /**
   * Callback when popup closes (via message)
   */
  onPopupClose?: () => void;

  /**
   * Callback when auth succeeds
   */
  onAuthSuccess?: () => void;
}

/**
 * @deprecated This function is deprecated and should not be used.
 * 
 * The custom COOP-safe popup approach using Firebase's internal `/__/auth/handler`
 * URL does not work correctly - the auth handler is designed for Firebase SDK's
 * internal popup mechanism and doesn't properly redirect to custom callback pages.
 * 
 * Instead, use `safeSignInWithPopup` which wraps Firebase's standard `signInWithPopup`
 * with COOP console error suppression. The COOP "window.closed" console warnings
 * are harmless and don't affect the actual authentication flow.
 * 
 * This function is kept for backwards compatibility but will be removed in a future
 * version.
 * 
 * @param auth - Firebase Auth instance
 * @param provider - Auth provider (must be GoogleAuthProvider)
 * @param options - Configuration options
 * @returns Promise resolving to SafePopupAuthResult (always fails with auth/invalid-config)
 */
export async function signInWithPopupCOOPSafe(
  _auth: Auth,
  _provider: AuthProvider,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _options: COOPSafePopupOptions = {}
): Promise<SafePopupAuthResult> {
  // This function is deprecated - always return an error to trigger fallback
  console.warn(
    "%c⚠️ signInWithPopupCOOPSafe is deprecated. Use safeSignInWithPopup instead.",
    "color: #f59e0b; font-weight: bold;"
  );
  return {
    success: false,
    error: Object.assign(
      new Error("signInWithPopupCOOPSafe is deprecated. Use safeSignInWithPopup instead."),
      { code: "auth/invalid-config" }
    ),
    usedRedirectFallback: false,
  };
}
