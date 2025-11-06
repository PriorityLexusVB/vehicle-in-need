
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
  // Patch MutationObserver.observe to validate target before observing
  const originalObserve = MutationObserver.prototype.observe;
  MutationObserver.prototype.observe = function(target: Node, options?: MutationObserverInit) {
    // Validate that target is a valid Node before calling original observe
    if (!target || !(target instanceof Node)) {
      console.warn('MutationObserver.observe called with invalid target:', target);
      return; // Silently skip invalid observations
    }
    try {
      return originalObserve.call(this, target, options);
    } catch (error) {
      console.warn('MutationObserver.observe error:', error);
    }
  };

  // Also catch any unhandled errors
  window.addEventListener('error', (event) => {
    const message = event.message || '';
    if (message.includes('parameter 1 is not of type Node') || 
        message.includes('MutationObserver')) {
      console.warn('Suppressed MutationObserver error:', message);
      event.preventDefault();
      return;
    }
  });
}

// Initialize app
async function initializeApp() {
  try {
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
