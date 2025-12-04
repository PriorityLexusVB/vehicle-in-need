/**
 * Safe Popup Authentication Service
 *
 * This module provides a COOP-safe popup authentication mechanism that avoids
 * polling `window.closed`, which is blocked under strict Cross-Origin-Opener-Policy
 * (COOP) configurations.
 *
 * The issue: Under stricter COOP configurations, Firebase's internal polling of
 * `window.closed` on the popup window is blocked, causing console errors like:
 * "Cross-Origin-Opener-Policy policy would block the window.closed call."
 *
 * The solution: We use a postMessage-based communication pattern between the
 * popup and opener, completely avoiding window.closed polling:
 * 1. Open a popup that initiates OAuth with Firebase
 * 2. The popup redirects to our callback page after auth
 * 3. The callback page posts auth result back via postMessage
 * 4. The opener completes sign-in using signInWithCredential
 *
 * This approach:
 * - Eliminates COOP console errors
 * - Works across all browser configurations
 * - Maintains existing UX and error semantics
 */

import {
  Auth,
  AuthProvider,
  UserCredential,
  signInWithPopup,
  signInWithRedirect,
  GoogleAuthProvider,
  signInWithCredential,
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
 * Validates the origin of a postMessage event
 */
function isValidOrigin(origin: string, expectedOrigins: string[]): boolean {
  return expectedOrigins.some((expected) => origin === expected);
}

/**
 * Gets expected origins for postMessage validation
 * Includes the current origin and Firebase auth domain
 */
function getExpectedOrigins(authDomain?: string): string[] {
  const origins: string[] = [];

  if (typeof window !== "undefined" && window.location.origin) {
    origins.push(window.location.origin);
  }

  if (authDomain) {
    origins.push(`https://${authDomain}`);
  }

  return origins;
}

/**
 * Options for COOP-safe popup authentication
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
 * COOP-safe popup authentication using postMessage communication.
 *
 * This function completely avoids window.closed polling by using postMessage
 * to communicate between the popup and opener. The flow is:
 *
 * 1. Open popup with Firebase OAuth handler URL
 * 2. User completes OAuth in popup
 * 3. Firebase redirects to our callback page
 * 4. Callback page extracts tokens and posts message to opener
 * 5. Opener receives message and completes sign-in with signInWithCredential
 *
 * If the user closes the popup, the beforeunload handler in the callback page
 * posts a "popup-closing" message, which (after a grace period) triggers rejection.
 *
 * @param auth - Firebase Auth instance
 * @param provider - Auth provider (must be GoogleAuthProvider)
 * @param options - Configuration options
 * @returns Promise resolving to SafePopupAuthResult
 */
export async function signInWithPopupCOOPSafe(
  auth: Auth,
  provider: AuthProvider,
  options: COOPSafePopupOptions = {}
): Promise<SafePopupAuthResult> {
  const {
    timeout = 120000,
    closeGracePeriod = 1500,
    onPopupOpen,
    onPopupClose,
    onAuthSuccess,
  } = options;

  // Get Firebase config for building OAuth URL
  const authDomain = (auth.app.options as { authDomain?: string }).authDomain;
  const apiKey = (auth.app.options as { apiKey?: string }).apiKey;

  if (!authDomain || !apiKey) {
    return {
      success: false,
      error: Object.assign(new Error("Missing Firebase configuration"), {
        code: "auth/invalid-config",
      }),
      usedRedirectFallback: false,
    };
  }

  const expectedOrigins = getExpectedOrigins(authDomain);

  return new Promise((resolve) => {
    let hasResolved = false;
    let popupWindow: Window | null = null;
    let messageHandler: ((event: MessageEvent) => void) | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let closeGraceTimeoutId: ReturnType<typeof setTimeout> | null = null;

    /**
     * Cleanup function to remove all listeners and timeouts
     */
    const cleanup = () => {
      if (messageHandler) {
        window.removeEventListener("message", messageHandler);
        messageHandler = null;
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (closeGraceTimeoutId) {
        clearTimeout(closeGraceTimeoutId);
        closeGraceTimeoutId = null;
      }
      // Best effort popup close (may fail due to COOP, that's fine)
      try {
        if (popupWindow && !popupWindow.closed) {
          popupWindow.close();
        }
      } catch {
        // Ignore COOP-related access errors
      }
      popupWindow = null;
    };

    /**
     * Resolve and cleanup
     */
    const doResolve = (result: SafePopupAuthResult) => {
      if (hasResolved) return;
      hasResolved = true;
      cleanup();
      resolve(result);
    };

    /**
     * Handle successful authentication
     */
    const handleAuthSuccess = async (payload?: PopupAuthMessage["payload"]) => {
      // Clear any pending close grace timeout
      if (closeGraceTimeoutId) {
        clearTimeout(closeGraceTimeoutId);
        closeGraceTimeoutId = null;
      }

      onAuthSuccess?.();

      if (!payload?.idToken && !payload?.accessToken) {
        doResolve({
          success: false,
          error: Object.assign(new Error("No credential received from popup"), {
            code: "auth/no-credential",
          }),
          usedRedirectFallback: false,
        });
        return;
      }

      try {
        // Create OAuth credential from the tokens
        const credential = GoogleAuthProvider.credential(
          payload.idToken ?? null,
          payload.accessToken ?? null
        );

        // Sign in with the credential
        const userCredential = await signInWithCredential(auth, credential);

        if (import.meta.env.DEV) {
          console.log(
            "%c✅ COOPSafePopup - Sign-in successful via postMessage",
            "color: #10b981; font-weight: bold;"
          );
        }

        doResolve({
          success: true,
          credential: userCredential,
          usedRedirectFallback: false,
        });
      } catch (error) {
        const typedError = error as Error & { code?: string };
        doResolve({
          success: false,
          error: typedError,
          usedRedirectFallback: false,
        });
      }
    };

    /**
     * Handle popup closing message with grace period
     */
    const handlePopupClosing = () => {
      onPopupClose?.();

      // Give a grace period for auth-success to arrive
      closeGraceTimeoutId = setTimeout(() => {
        doResolve({
          success: false,
          error: Object.assign(new Error("Popup was closed by user"), {
            code: "auth/popup-closed-by-user",
          }),
          usedRedirectFallback: false,
        });
      }, closeGracePeriod);
    };

    /**
     * Message event handler
     */
    messageHandler = (event: MessageEvent) => {
      // Validate origin
      if (!isValidOrigin(event.origin, expectedOrigins)) {
        if (event.origin !== window.location.origin) {
          return; // Ignore messages from unexpected origins
        }
      }

      // Validate message structure
      const message = event.data as PopupAuthMessage;
      if (!message || typeof message !== "object" || !message.type) {
        return;
      }

      if (import.meta.env.DEV) {
        console.log(
          "%c📨 COOPSafePopup - Received message:",
          "color: #3b82f6;",
          message.type
        );
      }

      switch (message.type) {
        case "auth-success":
          handleAuthSuccess(message.payload);
          break;
        case "auth-error":
          doResolve({
            success: false,
            error: Object.assign(
              new Error(message.payload?.error || "Authentication failed"),
              { code: message.payload?.errorCode || "auth/popup-error" }
            ),
            usedRedirectFallback: false,
          });
          break;
        case "popup-closing":
          handlePopupClosing();
          break;
      }
    };

    window.addEventListener("message", messageHandler);

    // Set up overall timeout
    timeoutId = setTimeout(() => {
      doResolve({
        success: false,
        error: Object.assign(new Error("Authentication timed out"), {
          code: "auth/timeout",
        }),
        usedRedirectFallback: false,
      });
    }, timeout);

    // Build OAuth popup URL
    const callbackUrl = `${window.location.origin}/auth-popup-callback.html`;

    // Get custom parameters from provider
    const googleProvider = provider as GoogleAuthProvider;
    const customParams = googleProvider.customParameters || {};

    // Build the popup URL using Firebase's auth handler
    const authUrl = new URL(`https://${authDomain}/__/auth/handler`);
    authUrl.searchParams.set("apiKey", apiKey);
    authUrl.searchParams.set("appName", auth.app.name);
    authUrl.searchParams.set("authType", "signInViaPopup");
    authUrl.searchParams.set("redirectUrl", callbackUrl);
    authUrl.searchParams.set("v", "10.0.0");
    authUrl.searchParams.set("providerId", provider.providerId);
    if (Object.keys(customParams).length > 0) {
      authUrl.searchParams.set("customParameters", JSON.stringify(customParams));
    }

    // Calculate popup position
    const width = 500;
    const height = 600;
    const left = Math.max(0, (window.screen.width - width) / 2);
    const top = Math.max(0, (window.screen.height - height) / 2);
    const popupFeatures = `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`;

    // Open the popup
    popupWindow = window.open(authUrl.toString(), "firebaseAuthPopup", popupFeatures);

    if (!popupWindow) {
      doResolve({
        success: false,
        error: Object.assign(new Error("Popup was blocked"), {
          code: "auth/popup-blocked",
        }),
        usedRedirectFallback: false,
      });
      return;
    }

    onPopupOpen?.();
    popupWindow.focus();

    if (import.meta.env.DEV) {
      console.log(
        "%c🔐 COOPSafePopup - Popup opened, waiting for postMessage",
        "color: #3b82f6; font-weight: bold;"
      );
    }
  });
}
