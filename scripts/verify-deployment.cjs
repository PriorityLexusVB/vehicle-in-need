#!/usr/bin/env node

/**
 * Deployment Verification Script
 * 
 * This script performs automated verification of the deployed application
 * to ensure it's serving the correct version and all critical features work.
 * 
 * Usage:
 *   node scripts/verify-deployment.js [URL]
 * 
 * Example:
 *   node scripts/verify-deployment.js https://pre-order-dealer-exchange-tracker-xyz.a.run.app
 */

const https = require('https');
const http = require('http');

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(`✓ ${message}`, colors.green);
}

function logError(message) {
  log(`✗ ${message}`, colors.red);
}

function logWarning(message) {
  log(`⚠ ${message}`, colors.yellow);
}

function logInfo(message) {
  log(`ℹ ${message}`, colors.cyan);
}

function logHeader(message) {
  log(`\n${'='.repeat(60)}`, colors.bold);
  log(message, colors.bold);
  log('='.repeat(60), colors.bold);
}

// Promisified HTTP(S) request
function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const lib = urlObj.protocol === 'https:' ? https : http;
    
    const req = lib.request(url, options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });
    
    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    req.end();
  });
}

// Parse command line arguments
const args = process.argv.slice(2);
const baseUrl = args[0];

if (!baseUrl) {
  console.error('Usage: node scripts/verify-deployment.js <URL>');
  console.error('Example: node scripts/verify-deployment.js https://pre-order-dealer-exchange-tracker-xyz.a.run.app');
  process.exit(1);
}

// Remove trailing slash
const normalizedUrl = baseUrl.replace(/\/$/, '');

// Test counters
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
let warnings = 0;

function recordTest(passed, message) {
  totalTests++;
  if (passed) {
    passedTests++;
    logSuccess(message);
  } else {
    failedTests++;
    logError(message);
  }
}

function recordWarning(message) {
  warnings++;
  logWarning(message);
}

async function runTests() {
  logHeader('Deployment Verification');
  logInfo(`Target URL: ${normalizedUrl}`);
  logInfo(`Started: ${new Date().toISOString()}\n`);

  // Test 1: Health Check
  logHeader('Test 1: Health Check');
  try {
    const res = await request(`${normalizedUrl}/health`);
    recordTest(
      res.statusCode === 200 && res.body.includes('healthy'),
      'Health endpoint returns 200 and "healthy" response'
    );
  } catch (error) {
    recordTest(false, `Health endpoint failed: ${error.message}`);
  }

  // Test 2: API Status Endpoint
  logHeader('Test 2: API Status Endpoint');
  try {
    const res = await request(`${normalizedUrl}/api/status`);
    recordTest(res.statusCode === 200, 'Status endpoint returns 200');
    
    if (res.statusCode === 200) {
      try {
        const status = JSON.parse(res.body);
        
        recordTest(
          status.hasOwnProperty('geminiEnabled'),
          'Status response includes geminiEnabled field'
        );
        
        recordTest(
          status.hasOwnProperty('version'),
          'Status response includes version field'
        );
        
        if (status.version && status.version !== 'unknown') {
          logSuccess(`Deployed version: ${status.version}`);
        } else {
          recordWarning('Version is "unknown" - build args may not be set correctly');
        }
        
        recordTest(
          status.hasOwnProperty('timestamp'),
          'Status response includes timestamp field'
        );
      } catch (parseError) {
        recordTest(false, `Failed to parse status JSON: ${parseError.message}`);
      }
    }
  } catch (error) {
    recordTest(false, `Status endpoint failed: ${error.message}`);
  }

  // Test 3: Index.html Checks
  logHeader('Test 3: Index.html Checks');
  try {
    const res = await request(`${normalizedUrl}/`);
    recordTest(res.statusCode === 200, 'Root path returns 200');
    
    if (res.statusCode === 200) {
      const html = res.body;
      
      // Check for Tailwind CDN (should NOT be present)
      recordTest(
        !html.includes('cdn.tailwindcss.com'),
        'No Tailwind CDN script tag found (production should use compiled CSS)'
      );
      
      // Check for hashed assets
      const hasHashedJs = /\/assets\/index-[a-zA-Z0-9_-]{8,}\.js/.test(html);
      recordTest(
        hasHashedJs,
        'Index.html references hashed JavaScript bundle'
      );
      
      const hasHashedCss = /\/assets\/index-[a-zA-Z0-9_-]{8,}\.css/.test(html);
      recordTest(
        hasHashedCss,
        'Index.html references hashed CSS bundle'
      );
      
      // Check that it doesn't reference source .tsx files
      recordTest(
        !html.includes('/index.tsx"') && !html.includes('/App.tsx"'),
        'No direct .tsx file references (should use compiled bundles)'
      );
      
      // Check for service worker cleanup script
      recordTest(
        html.includes('sw_cleanup_v1_done'),
        'Service worker cleanup script present'
      );
      
      // Check for favicon links
      recordTest(
        html.includes('favicon.ico') || html.includes('favicon.svg'),
        'Favicon link tags present'
      );
      
      // Check cache headers
      const cacheControl = res.headers['cache-control'];
      if (cacheControl) {
        recordTest(
          cacheControl.includes('no-cache') || cacheControl.includes('no-store'),
          `Index.html has correct cache headers: ${cacheControl}`
        );
      } else {
        recordWarning('No Cache-Control header found for index.html');
      }
    }
  } catch (error) {
    recordTest(false, `Index.html check failed: ${error.message}`);
  }

  // Test 4: Favicon Checks
  logHeader('Test 4: Favicon Checks');
  try {
    const icoRes = await request(`${normalizedUrl}/favicon.ico`);
    recordTest(
      icoRes.statusCode === 200,
      'favicon.ico returns 200'
    );
    
    if (icoRes.statusCode === 200) {
      recordTest(
        icoRes.body.length > 0,
        `favicon.ico has content (${icoRes.body.length} bytes)`
      );
    }
  } catch (error) {
    recordTest(false, `favicon.ico check failed: ${error.message}`);
  }
  
  try {
    const svgRes = await request(`${normalizedUrl}/favicon.svg`);
    recordTest(
      svgRes.statusCode === 200,
      'favicon.svg returns 200'
    );
    
    if (svgRes.statusCode === 200) {
      recordTest(
        svgRes.body.includes('<svg'),
        'favicon.svg contains valid SVG markup'
      );
    }
  } catch (error) {
    recordTest(false, `favicon.svg check failed: ${error.message}`);
  }

  // Test 5: Service Worker Files
  logHeader('Test 5: Service Worker Files');
  try {
    const swRes = await request(`${normalizedUrl}/sw.js`);
    recordTest(
      swRes.statusCode === 200,
      'sw.js (service worker) returns 200'
    );
    
    if (swRes.statusCode === 200) {
      const cacheControl = swRes.headers['cache-control'];
      if (cacheControl) {
        recordTest(
          cacheControl.includes('no-cache') || cacheControl.includes('must-revalidate'),
          `Service worker has correct cache headers: ${cacheControl}`
        );
      } else {
        recordWarning('No Cache-Control header found for service worker');
      }
    }
  } catch (error) {
    recordTest(false, `Service worker check failed: ${error.message}`);
  }

  // Test 6: Manifest Check
  logHeader('Test 6: PWA Manifest');
  try {
    const manifestRes = await request(`${normalizedUrl}/manifest.webmanifest`);
    recordTest(
      manifestRes.statusCode === 200,
      'manifest.webmanifest returns 200'
    );
    
    if (manifestRes.statusCode === 200) {
      try {
        const manifest = JSON.parse(manifestRes.body);
        recordTest(
          manifest.hasOwnProperty('name'),
          'Manifest includes name field'
        );
        recordTest(
          manifest.hasOwnProperty('short_name'),
          'Manifest includes short_name field'
        );
      } catch (parseError) {
        recordTest(false, `Failed to parse manifest JSON: ${parseError.message}`);
      }
    }
  } catch (error) {
    recordTest(false, `Manifest check failed: ${error.message}`);
  }

  // Test 7: Asset Caching Headers
  logHeader('Test 7: Hashed Asset Caching');
  try {
    // First, get index.html to find a hashed asset URL
    const indexRes = await request(`${normalizedUrl}/`);
    if (indexRes.statusCode === 200) {
      const jsMatch = indexRes.body.match(/\/assets\/(index-[a-zA-Z0-9_-]{8,}\.js)/);
      if (jsMatch) {
        const assetPath = jsMatch[0];
        const assetRes = await request(`${normalizedUrl}${assetPath}`);
        
        recordTest(
          assetRes.statusCode === 200,
          `Hashed JS asset returns 200: ${assetPath}`
        );
        
        if (assetRes.statusCode === 200) {
          const cacheControl = assetRes.headers['cache-control'];
          if (cacheControl) {
            recordTest(
              cacheControl.includes('max-age=31536000') || cacheControl.includes('immutable'),
              `Hashed asset has long-term cache headers: ${cacheControl}`
            );
          } else {
            recordWarning('Hashed asset missing Cache-Control header');
          }
          
          const contentType = assetRes.headers['content-type'];
          recordTest(
            contentType && (contentType.includes('javascript') || contentType.includes('application/javascript')),
            `Hashed JS asset has correct MIME type: ${contentType}`
          );
        }
      } else {
        recordWarning('Could not find hashed JS asset in index.html to test');
      }
    }
  } catch (error) {
    recordTest(false, `Asset caching check failed: ${error.message}`);
  }

  // Summary
  logHeader('Test Summary');
  log(`Total Tests: ${totalTests}`, colors.bold);
  log(`Passed: ${passedTests}`, colors.green);
  log(`Failed: ${failedTests}`, failedTests > 0 ? colors.red : colors.reset);
  log(`Warnings: ${warnings}`, warnings > 0 ? colors.yellow : colors.reset);
  log(`\nCompleted: ${new Date().toISOString()}`, colors.cyan);

  // Exit with appropriate code
  if (failedTests > 0) {
    log('\n❌ Deployment verification FAILED', colors.red + colors.bold);
    process.exit(1);
  } else if (warnings > 0) {
    log('\n⚠️  Deployment verification PASSED with warnings', colors.yellow + colors.bold);
    process.exit(0);
  } else {
    log('\n✅ Deployment verification PASSED', colors.green + colors.bold);
    process.exit(0);
  }
}

// Run tests
runTests().catch((error) => {
  logError(`\nFatal error during verification: ${error.message}`);
  console.error(error);
  process.exit(1);
});
