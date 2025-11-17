
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

// Runtime diagnostics to detect stale bundle and CSS loading issues
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

  // Diagnostic: Check CSS loading
  const cssLinks = document.querySelectorAll('link[rel="stylesheet"]');
  console.log('%c📦 CSS Resources', 'color: #8b5cf6; font-weight: bold;');
  console.log(`Total CSS links: ${cssLinks.length}`);
  
  if (cssLinks.length === 0) {
    console.error('%c❌ NO CSS FILES LINKED', 'color: #ef4444; font-weight: bold;');
    console.error('HTML build may be missing CSS references. Check Vite build output.');
  } else {
    cssLinks.forEach((link, index) => {
      const href = (link as HTMLLinkElement).href;
      const isLoaded = (link as HTMLLinkElement).sheet !== null;
      const status = isLoaded ? '✅' : '❌';
      console.log(`  ${status} [${index + 1}] ${href} - ${isLoaded ? 'Loaded' : 'Failed to load'}`);
      
      if (!isLoaded) {
        console.error(`%c❌ CSS LOAD FAILURE: ${href}`, 'color: #ef4444; font-weight: bold;');
        console.error('Possible causes:');
        console.error('  1. File not deployed to server (check dist/assets/)');
        console.error('  2. 404 error (check Network tab)');
        console.error('  3. CORS or security policy blocking CSS');
        console.error('  4. Stale service worker or browser cache');
      }
    });
  }

  // Check if Tailwind styles are applied
  if (cssLinks.length > 0) {
    setTimeout(() => {
      const body = document.body;
      const computedStyle = getComputedStyle(body);
      const bgColor = computedStyle.backgroundColor;
      
      // Tailwind's slate-100 is rgb(241, 245, 249)
      // If styles aren't applied, it will be default (white: rgb(255, 255, 255))
      const isTailwindApplied = bgColor === 'rgb(241, 245, 249)' || bgColor === 'rgba(241, 245, 249, 1)';
      
      if (isTailwindApplied) {
        console.log('%c✅ Tailwind styles applied successfully', 'color: #10b981; font-weight: bold;');
      } else {
        console.warn('%c⚠️ Tailwind styles NOT applied', 'color: #f59e0b; font-weight: bold;');
        console.warn(`Expected bg-slate-100 (rgb(241, 245, 249)), got: ${bgColor}`);
        console.warn('This indicates CSS file loaded but Tailwind classes are not working.');
        console.warn('Check:');
        console.warn('  1. CSS file contains Tailwind utility classes');
        console.warn('  2. PostCSS processed @tailwind directives');
        console.warn('  3. Tailwind content paths match component files');
        
        // Show user-facing warning banner for CSS failure
        showCSSWarningBanner();
      }
    }, 100); // Small delay to ensure CSS is fully applied
  }
}

// Show a warning banner when CSS fails to load properly
function showCSSWarningBanner() {
  const banner = document.createElement('div');
  banner.id = 'css-warning-banner';
  banner.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background: #f59e0b;
    color: white;
    padding: 12px 16px;
    text-align: center;
    font-family: sans-serif;
    font-size: 14px;
    z-index: 10000;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  `;
  banner.innerHTML = `
    <strong>⚠️ Styles Not Loading</strong> - 
    The page may not display correctly. 
    <button onclick="location.reload()" style="
      background: white;
      color: #f59e0b;
      border: none;
      padding: 4px 12px;
      margin-left: 12px;
      border-radius: 4px;
      cursor: pointer;
      font-weight: bold;
    ">Reload Page</button>
    <button onclick="document.getElementById('css-warning-banner').remove()" style="
      background: transparent;
      color: white;
      border: 1px solid white;
      padding: 4px 12px;
      margin-left: 8px;
      border-radius: 4px;
      cursor: pointer;
    ">Dismiss</button>
  `;
  document.body.prepend(banner);
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
