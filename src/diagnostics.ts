// Runtime diagnostics to detect stale bundle and CSS loading issues

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

export function logBundleInfo() {
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
      // Create a temporary test element with known Tailwind classes
      // This is more reliable than checking the body element which may have
      // styles from other sources (browser extensions, dark mode, etc.)
      const testEl = document.createElement('div');
      testEl.className = 'bg-slate-100 text-slate-800';
      testEl.style.position = 'absolute';
      testEl.style.visibility = 'hidden';
      testEl.style.pointerEvents = 'none';
      document.body.appendChild(testEl);

      const testStyle = getComputedStyle(testEl);
      const bgColor = testStyle.backgroundColor;
      const textColor = testStyle.color;

      // Clean up test element
      document.body.removeChild(testEl);

      // Tailwind v4 with oklch colors: slate-100 resolves to a light gray background
      // and slate-800 resolves to a dark gray text color
      // Check if background is NOT transparent (rgba(0, 0, 0, 0)) and NOT pure white (rgb(255, 255, 255))
      // Also check if text is NOT black (default) to confirm text-slate-800 is applied
      const isTransparent = bgColor === 'rgba(0, 0, 0, 0)' || bgColor === 'transparent';
      const isWhite = bgColor === 'rgb(255, 255, 255)' || bgColor === 'rgba(255, 255, 255, 1)';
      const isDefaultBlack = textColor === 'rgb(0, 0, 0)' || textColor === 'rgba(0, 0, 0, 1)';
      const isTailwindApplied = !isTransparent && !isWhite && !isDefaultBlack;

      if (isTailwindApplied) {
        console.log('%c✅ Tailwind styles applied successfully', 'color: #10b981; font-weight: bold;');
        console.log(`Test element colors - background: ${bgColor}, text: ${textColor}`);
      } else {
        console.warn('%c⚠️ Tailwind styles NOT applied', 'color: #f59e0b; font-weight: bold;');
        console.warn(`Expected bg-slate-100 (light gray) and text-slate-800 (dark gray)`);
        console.warn(`Got: background: ${bgColor}, text: ${textColor}`);
        console.warn('This indicates CSS file loaded but Tailwind classes are not working.');
        console.warn('Check:');
        console.warn('  1. CSS file contains Tailwind utility classes');
        console.warn('  2. PostCSS processed @source directives (Tailwind v4)');
        console.warn('  3. Tailwind content paths match component files');

        // Show user-facing warning banner for CSS failure
        showCSSWarningBanner();
      }
    }, 100); // Small delay to ensure CSS is fully applied
  }
}
