
import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import './src/index.css';
import App from './App';

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
  const originalError = window.onerror;
  window.onerror = function(message, source, lineno, colno, error) {
    // Suppress the specific MutationObserver error that breaks rendering
    if (typeof message === 'string' && message.includes('parameter 1 is not of type Node')) {
      console.warn('Suppressed MutationObserver error:', message);
      return true; // Prevent default error handling
    }
    // Let other errors through
    if (originalError) {
      return originalError(message, source, lineno, colno, error);
    }
    return false;
  };
}

// Initialize app
(async () => {
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
})();
