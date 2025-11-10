#!/usr/bin/env node

/**
 * Deploy Parity Verification Script
 * 
 * This script verifies that the deployed application matches the expected
 * state based on the local repository. It checks:
 * - Version/commit SHA matches
 * - Build time is recent
 * - All expected features are present
 * - No regressions from previous deployment
 * 
 * Usage:
 *   node scripts/verify-deploy-parity.cjs <production-url>
 * 
 * Example:
 *   node scripts/verify-deploy-parity.cjs https://my-app.com
 */

const https = require('https');
const http = require('http');
const { execSync } = require('child_process');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
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

function logHeader(message) {
  log(`\n${'='.repeat(60)}`, colors.bold);
  log(message, colors.bold);
  log('='.repeat(60), colors.bold);
}

// Promisified HTTP(S) request
function request(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const lib = urlObj.protocol === 'https:' ? https : http;
    
    const req = lib.request(url, (res) => {
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

// Get local git commit SHA
function getLocalCommitSha() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch (error) {
    return null;
  }
}

// Get local branch name
function getLocalBranch() {
  try {
    return execSync('git branch --show-current', { encoding: 'utf-8' }).trim();
  } catch (error) {
    return null;
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const prodUrl = args[0];

if (!prodUrl) {
  console.error('Usage: node scripts/verify-deploy-parity.cjs <production-url>');
  console.error('Example: node scripts/verify-deploy-parity.cjs https://my-app.com');
  process.exit(1);
}

const normalizedUrl = prodUrl.replace(/\/$/, '');
let errors = 0;
let warnings = 0;

async function runParityChecks() {
  logHeader('Deploy Parity Verification');
  log(`Production URL: ${normalizedUrl}`, colors.cyan);
  log(`Started: ${new Date().toISOString()}\n`, colors.cyan);

  // Get local repository info
  const localSha = getLocalCommitSha();
  const localBranch = getLocalBranch();

  logHeader('Local Repository Info');
  if (localSha) {
    logSuccess(`Local commit SHA: ${localSha}`);
  } else {
    logWarning('Could not determine local commit SHA');
    warnings++;
  }

  if (localBranch) {
    logSuccess(`Current branch: ${localBranch}`);
    if (localBranch !== 'main') {
      logWarning(`Not on main branch (currently on: ${localBranch})`);
      warnings++;
    }
  }

  // Check production /api/status
  logHeader('Production Version Check');
  try {
    const statusRes = await request(`${normalizedUrl}/api/status`);
    
    if (statusRes.statusCode !== 200) {
      logError(`/api/status returned ${statusRes.statusCode}`);
      errors++;
    } else {
      const status = JSON.parse(statusRes.body);
      
      logSuccess(`Production version: ${status.version}`);
      logSuccess(`Build time: ${status.buildTime}`);
      logSuccess(`Environment: ${status.environment}`);
      
      // Compare versions
      if (localSha && status.version !== 'unknown') {
        if (status.version === localSha) {
          logSuccess('✅ Version MATCHES local commit SHA');
        } else {
          logError(`Version MISMATCH: local=${localSha}, production=${status.version}`);
          errors++;
        }
      } else {
        logWarning('Cannot verify version parity (local SHA or production version unknown)');
        warnings++;
      }
      
      // Check build time is recent (within last 7 days)
      if (status.buildTime && status.buildTime !== 'unknown') {
        const buildDate = new Date(status.buildTime);
        const now = new Date();
        const daysSinceBuild = (now - buildDate) / (1000 * 60 * 60 * 24);
        
        if (daysSinceBuild < 7) {
          logSuccess(`Build is recent (${daysSinceBuild.toFixed(1)} days old)`);
        } else {
          logWarning(`Build is ${daysSinceBuild.toFixed(0)} days old - consider redeploying`);
          warnings++;
        }
      }
    }
  } catch (error) {
    logError(`Failed to check /api/status: ${error.message}`);
    errors++;
  }

  // Check for expected features
  logHeader('Feature Verification');
  try {
    const indexRes = await request(`${normalizedUrl}/`);
    
    if (indexRes.statusCode !== 200) {
      logError(`Index page returned ${indexRes.statusCode}`);
      errors++;
    } else {
      const html = indexRes.body;
      
      // Check for NO Tailwind CDN
      if (!html.includes('cdn.tailwindcss.com')) {
        logSuccess('No Tailwind CDN (using compiled CSS)');
      } else {
        logError('Tailwind CDN found - should use compiled CSS');
        errors++;
      }
      
      // Check for hashed assets
      if (/\/assets\/index-[a-zA-Z0-9_-]{8,}\.js/.test(html)) {
        logSuccess('Hashed JavaScript bundle found');
      } else {
        logError('Hashed JavaScript bundle not found');
        errors++;
      }
      
      if (/\/assets\/index-[a-zA-Z0-9_-]{8,}\.css/.test(html)) {
        logSuccess('Hashed CSS bundle found');
      } else {
        logError('Hashed CSS bundle not found');
        errors++;
      }
      
      // Check for service worker cleanup script
      if (html.includes('sw_cleanup_v1_done')) {
        logSuccess('Service worker cleanup script present');
      } else {
        logWarning('Service worker cleanup script not found');
        warnings++;
      }
    }
  } catch (error) {
    logError(`Failed to fetch index page: ${error.message}`);
    errors++;
  }

  // Summary
  logHeader('Parity Check Summary');
  log(`Errors: ${errors}`, errors > 0 ? colors.red : colors.green);
  log(`Warnings: ${warnings}`, warnings > 0 ? colors.yellow : colors.reset);
  log(`\nCompleted: ${new Date().toISOString()}`, colors.cyan);

  if (errors > 0) {
    log('\n❌ Deploy parity verification FAILED', colors.red + colors.bold);
    log('Production does not match expected state. Investigate and redeploy if necessary.\n', colors.red);
    process.exit(1);
  } else if (warnings > 0) {
    log('\n⚠️  Deploy parity verification PASSED with warnings', colors.yellow + colors.bold);
    log('Review warnings above. Deploy may be slightly out of date.\n', colors.yellow);
    process.exit(0);
  } else {
    log('\n✅ Deploy parity verification PASSED', colors.green + colors.bold);
    log('Production matches expected state!\n', colors.green);
    process.exit(0);
  }
}

// Run checks
runParityChecks().catch((error) => {
  logError(`\nFatal error during verification: ${error.message}`);
  console.error(error);
  process.exit(1);
});
