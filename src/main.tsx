
import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import './index.css';
import App from '../App.tsx';

// Unregister legacy service workers and reload once to bust stale caches
async function unregisterLegacyServiceWorkers() {
  if ('serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      if (registrations.length > 0) {
        console.log(`Unregistering ${registrations.length} legacy service worker(s)...`);
        await Promise.all(registrations.map(reg => reg.unregister()));
        
        // Set a flag to prevent infinite reload loop
        const hasReloaded = sessionStorage.getItem('sw_unregister_reload');
        if (!hasReloaded) {
          sessionStorage.setItem('sw_unregister_reload', 'true');
          console.log('Reloading to apply fresh bundle...');
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

// Runtime diagnostics to detect stale bundle
function logBundleInfo() {
  // @ts-expect-error - These are injected by Vite at build time
  const commitSha = typeof import.meta !== 'undefined' && import.meta.env?.VITE_APP_COMMIT_SHA;
  // @ts-expect-error - Build time is also injected by Vite
  const buildTime = typeof import.meta !== 'undefined' && import.meta.env?.VITE_APP_BUILD_TIME;
  
  console.log('%c🚀 Application Bundle Info', 'color: #0ea5e9; font-weight: bold; font-size: 14px;');
  console.log(`Version: ${commitSha || 'unknown'}`);
  console.log(`Build Time: ${buildTime || 'unknown'}`);
  console.log(`User Agent: ${navigator.userAgent}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  
  // Check if bundle seems stale
  if (!commitSha || commitSha === 'unknown' || commitSha === 'dev') {
    console.warn('%c⚠️ STALE_BUNDLE_DETECTED: Version information missing or invalid', 'color: #f59e0b; font-weight: bold;');
    console.warn('This may indicate an outdated deployment or build configuration issue.');
  }
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
        <HashRouter>
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
