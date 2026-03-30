
import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import './index.css';
import App from '../App.tsx';
import { logBundleInfo } from './diagnostics';

// Unregister legacy service workers and reload once to bust stale caches
async function unregisterLegacyServiceWorkers() {
  if ('serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      if (registrations.length > 0) {
        await Promise.all(registrations.map(reg => reg.unregister()));

        // Set a flag to prevent infinite reload loop
        const hasReloaded = sessionStorage.getItem('sw_unregister_reload');
        if (!hasReloaded) {
          sessionStorage.setItem('sw_unregister_reload', 'true');
          window.location.reload();
          return true; // Indicate that we're reloading
        }
      }
    } catch (error) {
      console.error('Error unregistering service workers:', error);
    }
  }
  return false; // No reload needed
}

// Add defensive guard against MutationObserver errors from third-party code
function setupMutationObserverGuard() {
  // Guard against synchronous errors
  window.addEventListener('error', (event) => {
    // Suppress the specific MutationObserver error that breaks rendering
    const message = event.message || '';
    if (message.includes('parameter 1 is not of type Node') ||
        message.includes('MutationObserver')) {
      console.warn('Suppressed MutationObserver error:', message);
      event.preventDefault();
      return;
    }
  });

  // Guard against promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason?.message || String(event.reason);
    if (reason.includes('parameter 1 is not of type Node') ||
        reason.includes('MutationObserver')) {
      console.warn('Suppressed MutationObserver promise rejection:', reason);
      event.preventDefault();
      return;
    }
  });
}

// Initialize app
async function initializeApp() {
  try {
    logBundleInfo();
    setupMutationObserverGuard();

    const willReload = await unregisterLegacyServiceWorkers();
    if (willReload) {
      return; // Don't render if we're reloading
    }

    const rootElement = document.getElementById('root');
    if (!rootElement) {
      throw new Error("Could not find root element to mount to");
    }

    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <HashRouter
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          <App />
        </HashRouter>
      </React.StrictMode>
    );
  } catch (error) {
    console.error('Failed to initialize app:', error);
    // Display a user-friendly error message
    const rootElement = document.getElementById('root');
    if (rootElement) {
      rootElement.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; height: 100vh; font-family: sans-serif;">
          <div style="text-align: center; padding: 2rem;">
            <h1 style="color: #ef4444; margin-bottom: 1rem;">Failed to Load Application</h1>
            <p style="color: #64748b; margin-bottom: 1rem;">Please try refreshing the page.</p>
            <button onclick="location.reload()" style="background: #0ea5e9; color: white; padding: 0.5rem 1rem; border: none; border-radius: 0.5rem; cursor: pointer;">
              Reload Page
            </button>
          </div>
        </div>
      `;
    }
  }
}

initializeApp();
