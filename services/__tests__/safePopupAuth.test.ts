import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  safeSignInWithPopup,
  getRecommendedAuthMethod,
  signInWithPopupCOOPSafe,
  type PopupAuthMessage,
} from "../safePopupAuth";

// Mock Firebase auth module
vi.mock("firebase/auth", () => ({
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
  signInWithCredential: vi.fn(),
  GoogleAuthProvider: {
    credential: vi.fn(),
  },
}));

// Import mocked functions
import { signInWithPopup, signInWithRedirect, signInWithCredential, GoogleAuthProvider } from "firebase/auth";
import type { Auth, AuthProvider, UserCredential } from "firebase/auth";

// Mock auth and provider
const mockAuth = { name: "test-auth" } as unknown as Auth;
const mockProvider = { providerId: "google.com" } as unknown as AuthProvider;

// Mock user credential
const mockCredential: UserCredential = {
  user: {
    uid: "test-uid",
    email: "test@example.com",
    displayName: "Test User",
  },
  providerId: "google.com",
  operationType: "signIn",
} as unknown as UserCredential;

describe("safeSignInWithPopup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset import.meta.env.DEV for consistent test behavior
    vi.stubGlobal("import", { meta: { env: { DEV: false } } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns success when signInWithPopup succeeds", async () => {
    vi.mocked(signInWithPopup).mockResolvedValueOnce(mockCredential);

    const result = await safeSignInWithPopup(mockAuth, mockProvider);

    expect(result.success).toBe(true);
    expect(result.credential).toBe(mockCredential);
    expect(result.usedRedirectFallback).toBe(false);
    expect(signInWithPopup).toHaveBeenCalledWith(mockAuth, mockProvider);
  });

  it("returns error when signInWithPopup fails with non-COOP error", async () => {
    const error = Object.assign(new Error("Network error"), {
      code: "auth/network-request-failed",
    });
    vi.mocked(signInWithPopup).mockRejectedValueOnce(error);

    const result = await safeSignInWithPopup(mockAuth, mockProvider, {
      fallbackToRedirect: false,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe(error);
    expect(result.usedRedirectFallback).toBe(false);
    expect(signInWithRedirect).not.toHaveBeenCalled();
  });

  it("falls back to redirect when popup-closed-by-user and fallbackToRedirect is true", async () => {
    const popupError = Object.assign(
      new Error("The popup has been closed by the user"),
      { code: "auth/popup-closed-by-user" }
    );
    vi.mocked(signInWithPopup).mockRejectedValueOnce(popupError);
    vi.mocked(signInWithRedirect).mockResolvedValueOnce(undefined);

    const result = await safeSignInWithPopup(mockAuth, mockProvider, {
      fallbackToRedirect: true,
    });

    expect(result.success).toBe(true);
    expect(result.usedRedirectFallback).toBe(true);
    expect(signInWithRedirect).toHaveBeenCalledWith(mockAuth, mockProvider);
  });

  it("falls back to redirect on COOP-related error message", async () => {
    const coopError = new Error(
      "Cross-Origin-Opener-Policy policy would block the window.closed call"
    );
    vi.mocked(signInWithPopup).mockRejectedValueOnce(coopError);
    vi.mocked(signInWithRedirect).mockResolvedValueOnce(undefined);

    const result = await safeSignInWithPopup(mockAuth, mockProvider, {
      fallbackToRedirect: true,
    });

    expect(result.success).toBe(true);
    expect(result.usedRedirectFallback).toBe(true);
    expect(signInWithRedirect).toHaveBeenCalled();
  });

  it("does not fall back to redirect when fallbackToRedirect is false", async () => {
    const popupError = Object.assign(
      new Error("The popup has been closed by the user"),
      { code: "auth/popup-closed-by-user" }
    );
    vi.mocked(signInWithPopup).mockRejectedValueOnce(popupError);

    const result = await safeSignInWithPopup(mockAuth, mockProvider, {
      fallbackToRedirect: false,
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("auth/popup-closed-by-user");
    expect(result.usedRedirectFallback).toBe(false);
    expect(signInWithRedirect).not.toHaveBeenCalled();
  });

  it("calls onPopupStart callback when provided", async () => {
    vi.mocked(signInWithPopup).mockResolvedValueOnce(mockCredential);
    const onPopupStart = vi.fn();

    await safeSignInWithPopup(mockAuth, mockProvider, { onPopupStart });

    expect(onPopupStart).toHaveBeenCalledTimes(1);
  });

  it("calls onFallbackToRedirect callback when falling back", async () => {
    const popupError = Object.assign(
      new Error("The popup has been closed by the user"),
      { code: "auth/popup-closed-by-user" }
    );
    vi.mocked(signInWithPopup).mockRejectedValueOnce(popupError);
    vi.mocked(signInWithRedirect).mockResolvedValueOnce(undefined);
    const onFallbackToRedirect = vi.fn();

    await safeSignInWithPopup(mockAuth, mockProvider, {
      fallbackToRedirect: true,
      onFallbackToRedirect,
    });

    expect(onFallbackToRedirect).toHaveBeenCalledTimes(1);
  });

  it("suppresses COOP errors when suppressCOOPErrors is true", async () => {
    vi.mocked(signInWithPopup).mockResolvedValueOnce(mockCredential);
    const originalConsoleError = console.error;

    // The function temporarily overrides console.error
    // After the function completes, console.error should be restored
    await safeSignInWithPopup(mockAuth, mockProvider, {
      suppressCOOPErrors: true,
    });

    // Verify console.error is restored to original after function completes
    expect(console.error).toBe(originalConsoleError);
  });

  it("returns redirect error when redirect also fails", async () => {
    const popupError = Object.assign(
      new Error("Popup blocked"),
      { code: "auth/popup-blocked" }
    );
    const redirectError = Object.assign(
      new Error("Redirect failed"),
      { code: "auth/redirect-cancelled-by-user" }
    );
    vi.mocked(signInWithPopup).mockRejectedValueOnce(popupError);
    vi.mocked(signInWithRedirect).mockRejectedValueOnce(redirectError);

    const result = await safeSignInWithPopup(mockAuth, mockProvider, {
      fallbackToRedirect: true,
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("auth/redirect-cancelled-by-user");
    expect(result.usedRedirectFallback).toBe(true);
  });
});

describe("getRecommendedAuthMethod", () => {
  const originalNavigator = global.navigator;
  const originalWindow = global.window;

  beforeEach(() => {
    // Mock window.location
    Object.defineProperty(global, "window", {
      value: {
        location: {
          hostname: "localhost",
        },
      },
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(global, "window", {
      value: originalWindow,
      writable: true,
    });
    Object.defineProperty(global, "navigator", {
      value: originalNavigator,
      writable: true,
    });
  });

  it("returns redirect for Codespaces environments", () => {
    Object.defineProperty(global, "window", {
      value: {
        location: {
          hostname: "test-codespace.app.github.dev",
        },
      },
      writable: true,
    });
    Object.defineProperty(global, "navigator", {
      value: { userAgent: "Mozilla/5.0 Chrome/100" },
      writable: true,
    });

    const result = getRecommendedAuthMethod();

    expect(result).toBe("redirect");
  });

  it("returns popup for iOS devices", () => {
    Object.defineProperty(global, "window", {
      value: {
        location: {
          hostname: "example.com",
        },
      },
      writable: true,
    });
    Object.defineProperty(global, "navigator", {
      value: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)" },
      writable: true,
    });

    const result = getRecommendedAuthMethod();

    expect(result).toBe("popup");
  });

  it("returns popup for Safari on macOS", () => {
    Object.defineProperty(global, "window", {
      value: {
        location: {
          hostname: "example.com",
        },
      },
      writable: true,
    });
    Object.defineProperty(global, "navigator", {
      value: {
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Safari/605.1.15",
      },
      writable: true,
    });

    const result = getRecommendedAuthMethod();

    expect(result).toBe("popup");
  });

  it("returns popup for Chrome on desktop", () => {
    Object.defineProperty(global, "window", {
      value: {
        location: {
          hostname: "example.com",
        },
      },
      writable: true,
    });
    Object.defineProperty(global, "navigator", {
      value: {
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.0.0 Safari/537.36",
      },
      writable: true,
    });

    const result = getRecommendedAuthMethod();

    expect(result).toBe("popup");
  });
});

describe("signInWithPopupCOOPSafe", () => {
  const mockAuthWithConfig = {
    name: "test-auth",
    app: {
      name: "test-app",
      options: {
        authDomain: "test.firebaseapp.com",
        apiKey: "test-api-key",
      },
    },
  } as unknown as Auth;

  const mockGoogleProvider = {
    providerId: "google.com",
    customParameters: { prompt: "select_account" },
  } as unknown as AuthProvider;

  const originalWindow = global.window;
  let mockWindowOpen: ReturnType<typeof vi.fn>;
  let mockPopupWindow: { close: ReturnType<typeof vi.fn>; closed: boolean; focus: ReturnType<typeof vi.fn> };
  let messageEventListeners: ((event: MessageEvent) => void)[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    messageEventListeners = [];
    mockPopupWindow = {
      close: vi.fn(),
      closed: false,
      focus: vi.fn(),
    };
    mockWindowOpen = vi.fn().mockReturnValue(mockPopupWindow);

    // Mock window with all needed properties
    Object.defineProperty(global, "window", {
      value: {
        location: {
          origin: "https://example.com",
          hostname: "example.com",
        },
        screen: {
          width: 1920,
          height: 1080,
        },
        open: mockWindowOpen,
        addEventListener: vi.fn((event: string, handler: (event: MessageEvent) => void) => {
          if (event === "message") {
            messageEventListeners.push(handler);
          }
        }),
        removeEventListener: vi.fn((event: string, handler: (event: MessageEvent) => void) => {
          if (event === "message") {
            const index = messageEventListeners.indexOf(handler);
            if (index > -1) {
              messageEventListeners.splice(index, 1);
            }
          }
        }),
      },
      writable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(global, "window", {
      value: originalWindow,
      writable: true,
    });
  });

  /**
   * Helper to simulate a postMessage from the popup
   */
  function simulatePostMessage(message: PopupAuthMessage, origin = "https://example.com") {
    const event = new MessageEvent("message", {
      data: message,
      origin,
    });
    messageEventListeners.forEach((handler) => handler(event));
  }

  it("returns error when Firebase config is missing", async () => {
    const authWithoutConfig = {
      name: "test-auth",
      app: { name: "test-app", options: {} },
    } as unknown as Auth;

    const result = await signInWithPopupCOOPSafe(authWithoutConfig, mockGoogleProvider);

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("auth/invalid-config");
  });

  it("returns error when popup is blocked", async () => {
    mockWindowOpen.mockReturnValueOnce(null);

    const result = await signInWithPopupCOOPSafe(mockAuthWithConfig, mockGoogleProvider);

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("auth/popup-blocked");
  });

  it("opens popup with correct URL parameters", async () => {
    // Start the auth flow but don't await it yet
    const authPromise = signInWithPopupCOOPSafe(mockAuthWithConfig, mockGoogleProvider);

    // Check that window.open was called with the correct URL
    expect(mockWindowOpen).toHaveBeenCalledTimes(1);
    const openArgs = mockWindowOpen.mock.calls[0];
    const url = new URL(openArgs[0]);
    
    expect(url.hostname).toBe("test.firebaseapp.com");
    expect(url.pathname).toBe("/__/auth/handler");
    expect(url.searchParams.get("apiKey")).toBe("test-api-key");
    expect(url.searchParams.get("providerId")).toBe("google.com");
    expect(url.searchParams.get("authType")).toBe("signInViaPopup");

    // Clean up by simulating a close message
    simulatePostMessage({ type: "popup-closing" });
    vi.advanceTimersByTime(2000);
    await authPromise;
  });

  it("handles auth-success message and signs in with credential", async () => {
    const mockUserCredential = {
      user: { uid: "test-uid", email: "test@example.com" },
      providerId: "google.com",
      operationType: "signIn",
    } as unknown as UserCredential;

    vi.mocked(GoogleAuthProvider.credential).mockReturnValue({} as ReturnType<typeof GoogleAuthProvider.credential>);
    vi.mocked(signInWithCredential).mockResolvedValue(mockUserCredential);

    const authPromise = signInWithPopupCOOPSafe(mockAuthWithConfig, mockGoogleProvider);

    // Simulate auth success message from popup
    simulatePostMessage({
      type: "auth-success",
      payload: {
        idToken: "test-id-token",
        accessToken: "test-access-token",
      },
    });

    const result = await authPromise;

    expect(result.success).toBe(true);
    expect(result.credential).toBe(mockUserCredential);
    expect(result.usedRedirectFallback).toBe(false);
    expect(GoogleAuthProvider.credential).toHaveBeenCalledWith("test-id-token", "test-access-token");
    expect(signInWithCredential).toHaveBeenCalled();
  });

  it("handles popup-closing message with grace period", async () => {
    const authPromise = signInWithPopupCOOPSafe(mockAuthWithConfig, mockGoogleProvider, {
      closeGracePeriod: 1500,
    });

    // Simulate popup closing
    simulatePostMessage({ type: "popup-closing" });

    // Advance time past the grace period
    vi.advanceTimersByTime(2000);

    const result = await authPromise;

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("auth/popup-closed-by-user");
  });

  it("allows auth-success within grace period after popup-closing", async () => {
    const mockUserCredential = {
      user: { uid: "test-uid", email: "test@example.com" },
    } as unknown as UserCredential;

    vi.mocked(GoogleAuthProvider.credential).mockReturnValue({} as ReturnType<typeof GoogleAuthProvider.credential>);
    vi.mocked(signInWithCredential).mockResolvedValue(mockUserCredential);

    const authPromise = signInWithPopupCOOPSafe(mockAuthWithConfig, mockGoogleProvider, {
      closeGracePeriod: 1500,
    });

    // Simulate popup closing
    simulatePostMessage({ type: "popup-closing" });

    // Before grace period ends, receive auth success
    vi.advanceTimersByTime(500);
    simulatePostMessage({
      type: "auth-success",
      payload: { idToken: "test-token" },
    });

    const result = await authPromise;

    expect(result.success).toBe(true);
    expect(result.credential).toBe(mockUserCredential);
  });

  it("handles auth-error message from popup", async () => {
    const authPromise = signInWithPopupCOOPSafe(mockAuthWithConfig, mockGoogleProvider);

    // Simulate auth error from popup
    simulatePostMessage({
      type: "auth-error",
      payload: {
        error: "User denied access",
        errorCode: "auth/access-denied",
      },
    });

    const result = await authPromise;

    expect(result.success).toBe(false);
    expect(result.error?.message).toBe("User denied access");
    expect(result.error?.code).toBe("auth/access-denied");
  });

  it("times out after configured timeout", async () => {
    const authPromise = signInWithPopupCOOPSafe(mockAuthWithConfig, mockGoogleProvider, {
      timeout: 5000,
    });

    // Advance time past the timeout
    vi.advanceTimersByTime(6000);

    const result = await authPromise;

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("auth/timeout");
  });

  it("calls onPopupOpen callback when popup opens", async () => {
    const onPopupOpen = vi.fn();

    const authPromise = signInWithPopupCOOPSafe(mockAuthWithConfig, mockGoogleProvider, {
      onPopupOpen,
    });

    expect(onPopupOpen).toHaveBeenCalledTimes(1);
    expect(mockPopupWindow.focus).toHaveBeenCalled();

    // Clean up
    simulatePostMessage({ type: "popup-closing" });
    vi.advanceTimersByTime(2000);
    await authPromise;
  });

  it("calls onPopupClose callback when popup closes", async () => {
    const onPopupClose = vi.fn();

    const authPromise = signInWithPopupCOOPSafe(mockAuthWithConfig, mockGoogleProvider, {
      onPopupClose,
    });

    simulatePostMessage({ type: "popup-closing" });
    expect(onPopupClose).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2000);
    await authPromise;
  });

  it("calls onAuthSuccess callback when auth succeeds", async () => {
    const mockUserCredential = {
      user: { uid: "test-uid" },
    } as unknown as UserCredential;

    vi.mocked(GoogleAuthProvider.credential).mockReturnValue({} as ReturnType<typeof GoogleAuthProvider.credential>);
    vi.mocked(signInWithCredential).mockResolvedValue(mockUserCredential);

    const onAuthSuccess = vi.fn();

    const authPromise = signInWithPopupCOOPSafe(mockAuthWithConfig, mockGoogleProvider, {
      onAuthSuccess,
    });

    simulatePostMessage({
      type: "auth-success",
      payload: { idToken: "test-token" },
    });

    await authPromise;

    expect(onAuthSuccess).toHaveBeenCalledTimes(1);
  });

  it("ignores messages from unexpected origins", async () => {
    const mockUserCredential = {
      user: { uid: "test-uid" },
    } as unknown as UserCredential;

    vi.mocked(GoogleAuthProvider.credential).mockReturnValue({} as ReturnType<typeof GoogleAuthProvider.credential>);
    vi.mocked(signInWithCredential).mockResolvedValue(mockUserCredential);

    const authPromise = signInWithPopupCOOPSafe(mockAuthWithConfig, mockGoogleProvider, {
      timeout: 1000,
    });

    // Send message from unexpected origin - should be ignored
    simulatePostMessage(
      { type: "auth-success", payload: { idToken: "malicious-token" } },
      "https://malicious-site.com"
    );

    // The auth should not complete from the malicious message
    // Advance time to trigger timeout
    vi.advanceTimersByTime(1500);

    const result = await authPromise;

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("auth/timeout");
    expect(signInWithCredential).not.toHaveBeenCalled();
  });

  it("returns error when auth-success has no tokens", async () => {
    const authPromise = signInWithPopupCOOPSafe(mockAuthWithConfig, mockGoogleProvider);

    simulatePostMessage({
      type: "auth-success",
      payload: {}, // No tokens
    });

    const result = await authPromise;

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("auth/no-credential");
  });

  it("cleans up message listener after completion", async () => {
    const authPromise = signInWithPopupCOOPSafe(mockAuthWithConfig, mockGoogleProvider);

    // Simulate timeout to complete the auth flow
    vi.advanceTimersByTime(130000);

    await authPromise;

    // Verify removeEventListener was called
    expect(window.removeEventListener).toHaveBeenCalled();
  });
});
