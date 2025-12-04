import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  safeSignInWithPopup,
  getRecommendedAuthMethod,
  SafePopupAuthOptions,
} from "../safePopupAuth";

// Mock Firebase auth module
vi.mock("firebase/auth", () => ({
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
}));

// Import mocked functions
import { signInWithPopup, signInWithRedirect } from "firebase/auth";
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
    const mockConsoleError = vi.fn();

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
