import React, { useState, useEffect } from 'react';
import { signInWithRedirect, getRedirectResult, signInWithPopup } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";
import { auth, googleProvider, firebaseConfig } from '../services/firebase';
import { GoogleIcon } from './icons/GoogleIcon';

// A sub-component for the specific error. This keeps things clean.
const UnauthorizedDomainError: React.FC = () => {
    const [copySuccess, setCopySuccess] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(window.location.origin).then(() => {
            setCopySuccess(true);
            setTimeout(() => setCopySuccess(false), 2500);
        });
    };

    return (
        <div className="text-left text-sm">
            <p className="font-bold text-red-800 text-base mb-3">Action Required: Authorize App Domain</p>
            <p>This is a one-time security step. Your Firebase project needs to know which web addresses are allowed to request logins.</p>
            
            <div className="space-y-4 mt-4">
                <div>
                    <label className="font-semibold text-slate-700 block mb-1">1. Copy this exact domain:</label>
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            readOnly
                            value={window.location.origin}
                            className="w-full p-2 border border-slate-300 rounded bg-slate-100 text-xs font-mono"
                            onClick={(e: any) => e.target.select()}
                        />
                        <button
                            onClick={handleCopy}
                            className={`flex-shrink-0 px-3 py-2 rounded-md text-sm font-semibold transition-colors ${copySuccess ? 'bg-green-600 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}`}
                        >
                            {copySuccess ? 'Copied!' : 'Copy'}
                        </button>
                    </div>
                </div>
                
                <div>
                    <span className="font-semibold text-slate-700">2. Add it to your Firebase authorized domains list:</span>
                    <a
                        href={`https://console.firebase.google.com/u/0/project/${firebaseConfig.projectId}/authentication/settings`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block w-full text-center mt-1 bg-sky-600 hover:bg-sky-700 text-white font-bold py-2.5 px-4 rounded-lg text-sm transition-colors"
                    >
                        Open Firebase Auth Settings
                    </a>
                    <p className="text-xs text-slate-500 mt-1 text-center">This will open in a new tab.</p>
                </div>
            </div>

            <div className="mt-5 p-3 rounded-lg bg-amber-100 border border-amber-300">
                <p className="font-extrabold text-amber-900 text-base">
                    <span className="text-xl relative -top-px mr-1">⚠️</span> MOST IMPORTANT STEP
                </p>
                <p className="text-amber-800 mt-1">
                    After adding the domain, <strong className="underline decoration-2">DO NOT REFRESH THIS PAGE.</strong> Simply come back to this tab and click 'Sign in with Google' again. It might take a minute for the setting to activate.
                </p>
            </div>
        </div>
    );
};

const Login: React.FC = () => {
  const [error, setError] = useState<{type: string, message: string} | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(true);

  useEffect(() => {
    const checkRedirectResult = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (!result) {
            setIsSigningIn(false);
        }
      } catch (err: any) {
        console.error("Redirect Authentication Error:", err);
        if (err.code === 'auth/unauthorized-domain') {
          setError({type: 'unauthorized-domain', message: ''});
        } else if (err.code === 'auth/account-exists-with-different-credential') {
          setError({type: 'generic', message: 'An account already exists with this email using a different sign-in method.'});
        } else if (err.code === 'auth/operation-not-supported-in-this-environment') {
           setError({type: 'generic', message: 'Login failed: This browser environment is not supported or has cookies disabled.'});
        } else {
          setError({type: 'generic', message: 'An error occurred during sign-in. Please try again.'});
        }
        setIsSigningIn(false);
      }
    };
    checkRedirectResult();
  }, []);


  const handleLogin = async () => {
    setError(null);
    setIsSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (popupError: any) {
      // Gracefully handle COOP-related popup issues
      if (popupError.code === 'auth/popup-closed-by-user') {
        console.log("User closed the popup");
        setIsSigningIn(false);
        return;
      }
      
      console.warn("Popup sign-in failed, falling back to redirect. Reason:", popupError.code);
      
      // If popup fails for any reason (including COOP issues), try redirect.
      // This will navigate away. Errors will be handled by getRedirectResult upon return.
      try {
        await signInWithRedirect(auth, googleProvider);
      } catch (redirectError: any) {
        // This catch is only for errors *initiating* the redirect.
        console.error("Authentication Initiation Error (Redirect):", redirectError);
        if (redirectError.code === 'auth/unauthorized-domain') {
          setError({type: 'unauthorized-domain', message: ''});
        } else {
          setError({type: 'generic', message: "Failed to start the sign-in process. Please check your connection and try again."});
        }
        setIsSigningIn(false);
      }
    }
  };
  
  const renderError = () => {
    if (!error) return null;

    return (
        <div className="bg-red-50 border border-red-200 p-4 rounded-lg text-sm mb-6">
            {error.type === 'unauthorized-domain' ? (
                <UnauthorizedDomainError />
            ) : (
                <p>{error.message}</p>
            )}
        </div>
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center">
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight mb-2">
              Vehicle Order Tracker
            </h1>
            <p className="text-slate-500 mb-8">
              Please sign in with your company Google account.
            </p>
            
            {renderError()}

            <button
                onClick={handleLogin}
                disabled={isSigningIn}
                className="w-full flex items-center justify-center gap-3 bg-white border-2 border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold py-3 px-4 rounded-lg shadow-sm transition-all duration-200 disabled:bg-slate-200 disabled:cursor-not-allowed"
            >
                <GoogleIcon />
                {isSigningIn ? 'Processing sign-in...' : 'Sign in with Google'}
            </button>
            <p className="mt-6 text-xs text-slate-400">
                Access is restricted to @priorityautomotive.com accounts.
            </p>
        </div>
      </div>
    </div>
  );
};

export default Login;