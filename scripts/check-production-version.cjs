#!/usr/bin/env node

/**
 * Production Version Verification Script
 * 
 * This script verifies that production is deployed from the latest main branch
 * and not from a "manual deployment" or mismatched commit.
 * 
 * Usage:
 *   node scripts/check-production-version.cjs [expected-commit-sha]
 * 
 * Exit codes:
 *   0 - Production version matches expected commit
 *   1 - Version mismatch or manual deployment detected
 *   2 - Cannot verify (service unavailable or other error)
 */

const https = require('https');
const { execSync } = require('child_process');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
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
  log(`\n${'━'.repeat(60)}`, colors.bold);
  log(message, colors.bold);
  log('━'.repeat(60), colors.bold);
}

// Configuration
const SERVICE_NAME = 'pre-order-dealer-exchange-tracker';
const REGION = 'us-west1';
const PRODUCTION_URL = `https://${SERVICE_NAME}-842946218691.${REGION}.run.app`;

// Get expected commit SHA from argument or from git
let expectedCommit = process.argv[2];
if (!expectedCommit) {
  try {
    // Try to get latest commit from origin/main
    execSync('git fetch origin main 2>/dev/null', { stdio: 'ignore' });
    expectedCommit = execSync('git rev-parse --short origin/main', { encoding: 'utf-8' }).trim();
    logInfo(`Expected commit (from origin/main): ${expectedCommit}`);
  } catch (error) {
    logWarning('Could not fetch from origin/main, using local HEAD');
    try {
      expectedCommit = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
      logInfo(`Expected commit (from local HEAD): ${expectedCommit}`);
    } catch (err) {
      logError('Not in a git repository and no commit SHA provided');
      process.exit(2);
    }
  }
}

// Fetch production version
function fetchProductionVersion() {
  return new Promise((resolve, reject) => {
    const url = `${PRODUCTION_URL}/api/status`;
    
    https.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const status = JSON.parse(data);
            resolve(status);
          } catch (error) {
            reject(new Error(`Failed to parse JSON: ${error.message}`));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    }).on('error', reject);
  });
}

// Main verification
async function verify() {
  logHeader('Production Version Verification');
  logInfo(`Production URL: ${PRODUCTION_URL}`);
  logInfo(`Expected commit: ${expectedCommit}`);
  console.log('');

  try {
    logInfo('Fetching production status...');
    const status = await fetchProductionVersion();
    
    const prodVersion = status.version;
    const prodEnv = status.environment;
    const buildTime = status.buildTime;
    
    console.log('');
    logHeader('Production Status');
    log(`Environment: ${prodEnv}`, prodEnv === 'production' ? colors.green : colors.yellow);
    log(`Version: ${prodVersion}`, colors.cyan);
    log(`Build Time: ${buildTime}`, colors.cyan);
    log(`Node Version: ${status.nodeVersion}`, colors.cyan);
    console.log('');
    
    // Check for manual deployment indicators
    if (prodVersion.startsWith('manual')) {
      logHeader('Version Check: FAILED');
      logError('Production shows MANUAL DEPLOYMENT!');
      console.log('');
      log('Production version indicates a manual deployment, not a tracked git commit.', colors.red);
      log('This means the deployment cannot be traced to a specific commit in the repository.', colors.red);
      console.log('');
      logWarning('To fix this:');
      console.log('  1. Run: npm run sync:production');
      console.log(`  2. Or manually deploy from main:`);
      console.log(`     cd /path/to/vehicle-in-need`);
      console.log(`     SHORT_SHA=$(git rev-parse --short origin/main)`);
      console.log(`     gcloud builds submit --config cloudbuild.yaml \\`);
      console.log(`       --substitutions=_REGION=${REGION},_SERVICE=${SERVICE_NAME},SHORT_SHA=$SHORT_SHA`);
      console.log('');
      return 1;
    }
    
    if (prodVersion === 'unknown') {
      logHeader('Version Check: WARNING');
      logWarning('Production version is "unknown"');
      console.log('');
      log('This indicates the APP_VERSION environment variable was not set during deployment.', colors.yellow);
      log('The deployment may still be valid, but version tracking is incomplete.', colors.yellow);
      console.log('');
      return 1;
    }
    
    // Compare versions
    if (prodVersion === expectedCommit) {
      logHeader('Version Check: PASSED');
      logSuccess('Production version matches expected commit!');
      log(`  Production: ${prodVersion}`, colors.green);
      log(`  Expected:   ${expectedCommit}`, colors.green);
      console.log('');
      logSuccess('Production is synchronized with the expected commit.');
      console.log('');
      return 0;
    } else {
      logHeader('Version Check: MISMATCH');
      logWarning('Version mismatch detected');
      console.log('');
      log(`  Production: ${prodVersion}`, colors.yellow);
      log(`  Expected:   ${expectedCommit}`, colors.yellow);
      console.log('');
      
      // Try to get commit info for both versions
      try {
        const prodCommitInfo = execSync(`git log --oneline --decorate -1 ${prodVersion} 2>/dev/null`, { encoding: 'utf-8' }).trim();
        const expectedCommitInfo = execSync(`git log --oneline --decorate -1 ${expectedCommit} 2>/dev/null`, { encoding: 'utf-8' }).trim();
        
        log('Production commit:', colors.cyan);
        console.log(`  ${prodCommitInfo}`);
        console.log('');
        log('Expected commit:', colors.cyan);
        console.log(`  ${expectedCommitInfo}`);
        console.log('');
        
        // Check if production is behind
        const behindCount = execSync(`git rev-list --count ${prodVersion}..${expectedCommit} 2>/dev/null`, { encoding: 'utf-8' }).trim();
        if (parseInt(behindCount) > 0) {
          logWarning(`Production is ${behindCount} commit(s) behind expected commit`);
        }
        
        const aheadCount = execSync(`git rev-list --count ${expectedCommit}..${prodVersion} 2>/dev/null`, { encoding: 'utf-8' }).trim();
        if (parseInt(aheadCount) > 0) {
          logWarning(`Production is ${aheadCount} commit(s) ahead of expected commit`);
        }
      } catch (error) {
        logWarning('Could not determine commit relationship (commits may be on different branches)');
      }
      
      console.log('');
      logWarning('To sync production with latest main:');
      console.log('  npm run sync:production');
      console.log('');
      return 1;
    }
    
  } catch (error) {
    logHeader('Version Check: ERROR');
    logError(`Failed to verify production: ${error.message}`);
    console.log('');
    
    if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
      logError('Production service is not accessible');
      console.log('');
      logInfo('Possible causes:');
      console.log('  - Service is not deployed yet');
      console.log('  - Service URL has changed');
      console.log('  - Network connectivity issues');
      console.log('');
      logInfo('To deploy the service:');
      console.log('  npm run sync:production');
    }
    
    console.log('');
    return 2;
  }
}

// Run verification
verify()
  .then(exitCode => {
    process.exit(exitCode);
  })
  .catch(error => {
    logError(`Unexpected error: ${error.message}`);
    console.error(error);
    process.exit(2);
  });
