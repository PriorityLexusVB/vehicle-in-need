import React, { useState, useEffect } from "react";
import {
  signInWithRedirect,
  getRedirectResult,
} from "firebase/auth";
import { auth, googleProvider, firebaseConfig } from "../services/firebase";
import {
  safeSignInWithPopup,
  getRecommendedAuthMethod,
} from "../services/safePopupAuth";
import { GoogleIcon } from "./icons/GoogleIcon";

// A sub-component for the specific error. This keeps things clean.
const UnauthorizedDomainError: React.FC = () => {
  const hostname =
    typeof window !== "undefined" ? window.location.hostname : "";
  const [copySuccess, setCopySuccess] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(hostname).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2500);
    });
  };

  return (
    <div className="text-left text-sm">
      <p className="font-bold text-red-800 text-base mb-3">
        Action Required: Authorize App Domain
      </p>
      <p>
        This is a one-time security step. Your Firebase project needs to know
        which web addresses are allowed to request logins.
      </p>

      <div className="space-y-4 mt-4">
        <div>
          <label htmlFor="domain-input" className="font-semibold text-stone-700 block mb-1">
            1. Copy this exact domain (hostname only):
          </label>
          <div className="flex items-center gap-2">
            <input
              id="domain-input"
              type="text"
              readOnly
              value={hostname}
              className="w-full p-2 border border-stone-300 rounded bg-stone-100 text-xs font-mono"
              onClick={(e: React.MouseEvent<HTMLInputElement>) => e.currentTarget.select()}
            />
            <button
              onClick={handleCopy}
              className={`flex-shrink-0 px-3 py-2 rounded-md text-sm font-semibold transition-colors ${
                copySuccess
                  ? "bg-emerald-600 text-white"
                  : "bg-stone-200 hover:bg-stone-300 text-stone-700"
              }`}
            >
              {copySuccess ? "Copied!" : "Copy"}
            </button>
          </div>
          <p className="text-xs text-stone-500 mt-1">
            Example entry format: <code>subdomain.app.github.dev</code> (no{" "}
            <code>https://</code>, no slashes).
          </p>
        </div>

        <div>
          <span className="font-semibold text-stone-700">
            2. Add it to your Firebase authorized domains list:
          </span>
          <a
            href={`https://console.firebase.google.com/u/0/project/${firebaseConfig.projectId}/authentication/settings`}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full text-center mt-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-4 rounded-lg text-sm transition-colors"
          >
            Open Firebase Auth Settings
          </a>
          <p className="text-xs text-stone-500 mt-1 text-center">
            This will open in a new tab.
          </p>
          {hostname.endsWith(".app.github.dev") && (
            <div className="text-xs text-stone-600 mt-2 text-left">
              <p className="font-semibold">Tip for Codespaces:</p>
              <ul className="list-disc ml-5 space-y-1">
                <li>
                  Add <code>{hostname}</code> now.
                </li>
                <li>
                  Optionally add the base domain <code>app.github.dev</code> to
                  cover all subdomains.
                </li>
                <li>
                  If you use multiple forwarded ports, you may see different
                  hostnames like <code>...-3000.app.github.dev</code> and{" "}
                  <code>...-4000.app.github.dev</code>. Add the one shown above.
                </li>
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 p-3 rounded-lg bg-amber-100 border border-amber-300">
        <p className="font-extrabold text-amber-900 text-base">
          <span className="text-xl relative -top-px mr-1">⚠️</span> MOST
          IMPORTANT STEP
        </p>
        <p className="text-amber-800 mt-1">
          After adding the domain,{" "}
          <strong className="underline decoration-2">
            DO NOT REFRESH THIS PAGE.
          </strong>{" "}
          Simply come back to this tab and click 'Sign in with Google' again. It
          might take up to a minute for the setting to activate.
        </p>
      </div>
    </div>
  );
};

const Login: React.FC = () => {
  const [error, setError] = useState<{ type: string; message: string } | null>(
    null
  );
  const [isSigningIn, setIsSigningIn] = useState(true);

  useEffect(() => {
    const checkRedirectResult = async () => {
      try {
        const result = await getRedirectResult(auth);
        
        if (result) {
          // The onAuthStateChanged listener in App.tsx will handle setting the user
          // Keep isSigningIn true while App.tsx processes the auth state
        } else {
          // No pending redirect result (normal page load)
          setIsSigningIn(false);
        }
      } catch (err) {
        const error = err as { code?: string; message?: string };
        console.error(
          "%c❌ Login - Redirect Authentication Error",
          "color: #ef4444; font-weight: bold;",
          err
        );
        console.error("Error code:", error.code);
        console.error("Error message:", error.message);
        
        if (error.code === "auth/unauthorized-domain") {
          setError({ type: "unauthorized-domain", message: "" });
        } else if (
          error.code === "auth/account-exists-with-different-credential"
        ) {
          setError({
            type: "generic",
            message:
              "An account already exists with this email using a different sign-in method.",
          });
        } else if (
          error.code === "auth/operation-not-supported-in-this-environment"
        ) {
          setError({
            type: "generic",
            message:
              "Login failed: This browser environment is not supported or has cookies disabled.",
          });
        } else if (error.code === "auth/network-request-failed") {
          setError({
            type: "generic",
            message:
              "Network error. Please check your connection and try again.",
          });
        } else if (error.code === "auth/internal-error") {
          setError({
            type: "generic",
            message:
              "An internal error occurred. Please try refreshing the page or clearing your browser cache.",
          });
        } else if (
          error.code === "auth/missing-initial-state" ||
          (error.message && error.message.includes("missing initial state"))
        ) {
          // This error occurs when using signInWithRedirect in Safari/iOS or other browsers
          // with strict storage partitioning. The sessionStorage state is cleared before
          // the redirect completes.
          console.warn(
            "%c⚠️ Login - Missing initial state error (storage partitioning)",
            "color: #f59e0b; font-weight: bold;"
          );
          setError({
            type: "generic",
            message:
              "Sign-in was interrupted due to browser privacy settings. Please tap 'Sign in with Google' again. If this persists, try using a different browser or disabling strict privacy mode.",
          });
        } else {
          setError({
            type: "generic",
            message: `An error occurred during sign-in: ${error.message || "Please try again."}`,
          });
        }
        setIsSigningIn(false);
      }
    };
    checkRedirectResult();
  }, []);

  const handleLogin = async () => {
    setError(null);
    setIsSigningIn(true);
    
    // Detect iOS Safari and other browsers with storage partitioning issues
    // These browsers have problems with signInWithRedirect due to ITP/sessionStorage
    // Detection logic:
    // - iOS: Always has storage partitioning issues with redirect
    // - Safari on macOS: Has ITP that can cause issues with redirect
    // - Chrome/Edge/Firefox on any platform: Generally safe to use redirect
    const userAgent = navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/i.test(userAgent);
    // Safari detection: Contains Safari but NOT Chrome/Chromium/Edge/Firefox
    const isChromiumBased = /Chrome|Chromium|CriOS|EdgiOS|Edg\//i.test(userAgent);
    const isFirefox = /Firefox|FxiOS/i.test(userAgent);
    const isSafari = /Safari/i.test(userAgent) && !isChromiumBased && !isFirefox;
    // Storage partitioning affects iOS (regardless of browser) and Safari on macOS
    const hasStoragePartitioning = isIOS || isSafari;
    
    // Determine recommended auth method based on environment
    const recommendedMethod = getRecommendedAuthMethod();
    const isCodespaces = recommendedMethod === "redirect" && 
      window.location.hostname.endsWith(".app.github.dev");
    
    // Helper message for iOS/Safari popup issues
    const iosSafariPopupHint = "On iOS/Safari, please ensure popups are enabled in Settings > Safari > Block Pop-ups.";
    
    try {
      // For Codespaces: Always use redirect (popup fails there)
      if (isCodespaces) {
        await signInWithRedirect(auth, googleProvider);
        return; // navigation expected
      }
      
      // Use Firebase's standard signInWithPopup wrapped with COOP error suppression.
      // Note: The COOP "window.closed" console warnings are harmless - they're just
      // logging errors from Firebase SDK's internal polling, but the actual auth
      // flow still works correctly. We suppress these to avoid confusing users.
      const result = await safeSignInWithPopup(auth, googleProvider, {
        // For iOS/Safari, don't fall back to redirect (storage partitioning issues)
        fallbackToRedirect: !hasStoragePartitioning,
        // Suppress COOP-related console.error messages that don't affect functionality
        suppressCOOPErrors: true,
        onFallbackToRedirect: () => {
          // redirect fallback triggered
        },
      });
      
      if (result.success) {
        return;
      }
      
      // Handle popup failure
      const error = result.error;
      console.warn(
        "%c⚠️ Login - Popup sign-in failed",
        "color: #f59e0b; font-weight: bold;"
      );
      console.warn("Error code:", error?.code);
      console.warn("Error message:", error?.message);
      
      // For iOS/Safari: Show a more helpful error message
      if (hasStoragePartitioning) {
        if (error?.code === "auth/popup-blocked" || error?.code === "auth/popup-closed-by-user") {
          setError({
            type: "generic",
            message: `The sign-in popup was blocked or closed. ${iosSafariPopupHint}`,
          });
        } else if (error?.code === "auth/unauthorized-domain") {
          setError({ type: "unauthorized-domain", message: "" });
        } else {
          setError({
            type: "generic",
            message: `Sign-in failed: ${error?.message || "Please try again."}. ${iosSafariPopupHint}`,
          });
        }
        setIsSigningIn(false);
        return;
      }
      
      // Handle other errors
      if (error?.code === "auth/unauthorized-domain") {
        setError({ type: "unauthorized-domain", message: "" });
      } else if (error?.code === "auth/timeout") {
        setError({
          type: "generic",
          message: "Sign-in timed out. Please try again.",
        });
      } else {
        setError({
          type: "generic",
          message: `Sign-in failed: ${error?.message || "Please try again."}`,
        });
      }
      setIsSigningIn(false);
    } catch (unexpectedError) {
      // This catch handles unexpected errors not caught by popup auth functions
      const error = unexpectedError as { code?: string; message?: string };
      console.error(
        "%c❌ Login - Unexpected Authentication Error",
        "color: #ef4444; font-weight: bold;",
        unexpectedError
      );
      
      if (error.code === "auth/unauthorized-domain") {
        setError({ type: "unauthorized-domain", message: "" });
      } else {
        setError({
          type: "generic",
          message:
            "Failed to start the sign-in process. Please check your connection and try again.",
        });
      }
      setIsSigningIn(false);
    }
  };

  const renderError = () => {
    if (!error) return null;

    return (
      <div className="bg-red-50 border border-red-200 p-4 rounded-lg text-sm mb-6">
        {error.type === "unauthorized-domain" ? (
          <UnauthorizedDomainError />
        ) : (
          <p>{error.message}</p>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl border border-stone-200 p-8 text-center">
          <h1 className="text-2xl font-bold text-stone-800 tracking-tight mb-2">
            Vehicle Order Tracker
          </h1>
          <p className="text-stone-500 mb-8">
            Please sign in with your company Google account.
          </p>

          {renderError()}

          <button
            onClick={handleLogin}
            disabled={isSigningIn}
            className="w-full flex items-center justify-center gap-3 bg-white border-2 border-stone-300 hover:bg-stone-100 text-stone-700 font-semibold py-3 px-4 rounded-lg shadow-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <GoogleIcon />
            {isSigningIn ? "Processing sign-in..." : "Sign in with Google"}
          </button>
          <p className="mt-6 text-xs text-stone-400">
            Access is restricted to @priorityautomotive.com accounts.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
