#!/usr/bin/env node

/**
 * Pre-Deployment Validation Script
 * 
 * This script validates the local build before deployment to catch issues early.
 * Run this after `npm run build` and before deploying to production.
 * 
 * Usage:
 *   node scripts/pre-deploy-check.js
 */

const fs = require('fs');
const path = require('path');

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

const distPath = path.join(__dirname, '..', 'dist');
let errors = 0;
let warnings = 0;

logHeader('Pre-Deployment Validation');
log(`Build directory: ${distPath}\n`, colors.cyan);

// Check 1: Dist directory exists
logHeader('Check 1: Build Directory');
if (fs.existsSync(distPath)) {
  logSuccess('dist/ directory exists');
} else {
  logError('dist/ directory not found - run "npm run build" first');
  errors++;
  process.exit(1);
}

// Check 2: Critical files exist
logHeader('Check 2: Critical Files');
const criticalFiles = [
  'index.html',
  'favicon.ico',
  'favicon.svg',
  'sw.js',
  'manifest.webmanifest'
];

criticalFiles.forEach(file => {
  const filePath = path.join(distPath, file);
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    logSuccess(`${file} exists (${stats.size} bytes)`);
  } else {
    logError(`${file} not found in dist/`);
    errors++;
  }
});

// Check 3: Assets directory
logHeader('Check 3: Assets Directory');
const assetsPath = path.join(distPath, 'assets');
if (fs.existsSync(assetsPath)) {
  const assets = fs.readdirSync(assetsPath);
  logSuccess(`assets/ directory exists with ${assets.length} files`);
  
  // Check for hashed JS file
  const hashedJs = assets.find(f => /^index-[a-zA-Z0-9_-]{8,}\.js$/.test(f));
  if (hashedJs) {
    logSuccess(`Found hashed JS bundle: ${hashedJs}`);
  } else {
    logError('No hashed JS bundle found (expected index-[hash].js)');
    errors++;
  }
  
  // Check for hashed CSS file
  const hashedCss = assets.find(f => /^index-[a-zA-Z0-9_-]{8,}\.css$/.test(f));
  if (hashedCss) {
    logSuccess(`Found hashed CSS bundle: ${hashedCss}`);
  } else {
    logError('No hashed CSS bundle found (expected index-[hash].css)');
    errors++;
  }
} else {
  logError('assets/ directory not found');
  errors++;
}

// Check 4: Index.html content validation
logHeader('Check 4: Index.html Validation');
const indexPath = path.join(distPath, 'index.html');
if (fs.existsSync(indexPath)) {
  const indexContent = fs.readFileSync(indexPath, 'utf-8');
  
  // Check for Tailwind CDN (should NOT be present)
  if (indexContent.includes('cdn.tailwindcss.com')) {
    logError('Tailwind CDN script found in index.html (should use compiled CSS)');
    errors++;
  } else {
    logSuccess('No Tailwind CDN script (using compiled CSS)');
  }
  
  // Check for hashed asset references
  const hasHashedJs = /\/assets\/index-[a-zA-Z0-9_-]{8,}\.js/.test(indexContent);
  if (hasHashedJs) {
    logSuccess('Index.html references hashed JS bundle');
  } else {
    logError('Index.html does not reference hashed JS bundle');
    errors++;
  }
  
  const hasHashedCss = /\/assets\/index-[a-zA-Z0-9_-]{8,}\.css/.test(indexContent);
  if (hasHashedCss) {
    logSuccess('Index.html references hashed CSS bundle');
  } else {
    logError('Index.html does not reference hashed CSS bundle');
    errors++;
  }
  
  // Check for source file references (should NOT be present)
  if (indexContent.includes('/index.tsx"') || indexContent.includes('/App.tsx"')) {
    logError('Index.html references source .tsx files (should reference compiled bundles)');
    errors++;
  } else {
    logSuccess('No source .tsx file references');
  }
  
  // Check for service worker cleanup script
  if (indexContent.includes('sw_cleanup_v1_done')) {
    logSuccess('Service worker cleanup script present');
  } else {
    logWarning('Service worker cleanup script not found');
    warnings++;
  }
  
  // Check for favicon links
  if (indexContent.includes('favicon.ico') || indexContent.includes('favicon.svg')) {
    logSuccess('Favicon link tags present');
  } else {
    logError('No favicon link tags found');
    errors++;
  }
  
  // Check document structure
  if (indexContent.includes('<!DOCTYPE html>')) {
    logSuccess('Valid HTML5 doctype');
  } else {
    logError('Missing or invalid HTML5 doctype');
    errors++;
  }
  
  if (indexContent.includes('<div id="root"></div>')) {
    logSuccess('React root div present');
  } else {
    logError('React root div not found');
    errors++;
  }
}

// Check 5: Manifest validation
logHeader('Check 5: Manifest Validation');
const manifestPath = path.join(distPath, 'manifest.webmanifest');
if (fs.existsSync(manifestPath)) {
  try {
    const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestContent);
    
    if (manifest.name) {
      logSuccess(`Manifest name: "${manifest.name}"`);
    } else {
      logWarning('Manifest missing "name" field');
      warnings++;
    }
    
    if (manifest.short_name) {
      logSuccess(`Manifest short_name: "${manifest.short_name}"`);
    } else {
      logWarning('Manifest missing "short_name" field');
      warnings++;
    }
    
    if (manifest.theme_color) {
      logSuccess(`Manifest theme_color: "${manifest.theme_color}"`);
    } else {
      logWarning('Manifest missing "theme_color" field');
      warnings++;
    }
  } catch (error) {
    logError(`Failed to parse manifest.webmanifest: ${error.message}`);
    errors++;
  }
}

// Check 6: Service worker validation
logHeader('Check 6: Service Worker Validation');
const swPath = path.join(distPath, 'sw.js');
if (fs.existsSync(swPath)) {
  const swContent = fs.readFileSync(swPath, 'utf-8');
  const swSize = fs.statSync(swPath).size;
  
  logSuccess(`Service worker exists (${swSize} bytes)`);
  
  if (swContent.length > 100) {
    logSuccess('Service worker has content');
  } else {
    logWarning('Service worker seems too small (possible empty file)');
    warnings++;
  }
  
  // Check for workbox reference
  if (swContent.includes('workbox')) {
    logSuccess('Service worker includes Workbox runtime');
  } else {
    logWarning('Service worker does not reference Workbox (might be using custom implementation)');
    warnings++;
  }
}

// Check 7: File size validation
logHeader('Check 7: Bundle Size Check');
if (fs.existsSync(assetsPath)) {
  const assets = fs.readdirSync(assetsPath);
  assets.forEach(file => {
    const filePath = path.join(assetsPath, file);
    const stats = fs.statSync(filePath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    
    if (file.endsWith('.js')) {
      if (stats.size > 5 * 1024 * 1024) { // > 5MB
        logWarning(`Large JS bundle: ${file} (${sizeMB} MB) - consider code splitting`);
        warnings++;
      } else {
        logSuccess(`${file}: ${sizeMB} MB`);
      }
    } else if (file.endsWith('.css')) {
      if (stats.size > 1 * 1024 * 1024) { // > 1MB
        logWarning(`Large CSS bundle: ${file} (${sizeMB} MB) - consider optimization`);
        warnings++;
      } else {
        logSuccess(`${file}: ${sizeMB} MB`);
      }
    }
  });
}

// Check 8: Git status (should be clean for production builds)
logHeader('Check 8: Git Status');
const { execSync } = require('child_process');
try {
  const gitStatus = execSync('git status --porcelain', { encoding: 'utf-8' });
  if (gitStatus.trim() === '') {
    logSuccess('Working directory is clean (no uncommitted changes)');
  } else {
    logWarning('Working directory has uncommitted changes:');
    console.log(gitStatus);
    warnings++;
  }
  
  try {
    const currentBranch = execSync('git branch --show-current', { encoding: 'utf-8' }).trim();
    log(`Current branch: ${currentBranch}`, colors.cyan);
    
    if (currentBranch !== 'main') {
      logWarning(`Not on main branch (currently on: ${currentBranch})`);
      warnings++;
    } else {
      logSuccess('On main branch');
    }
  } catch (error) {
    logWarning('Could not determine current branch');
  }
  
  try {
    const commitSha = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
    logSuccess(`Current commit: ${commitSha}`);
  } catch (error) {
    logWarning('Could not determine current commit SHA');
  }
} catch (error) {
  logWarning('Could not check git status (not a git repository or git not installed)');
  warnings++;
}

// Summary
logHeader('Validation Summary');
log(`Errors: ${errors}`, errors > 0 ? colors.red : colors.green);
log(`Warnings: ${warnings}`, warnings > 0 ? colors.yellow : colors.reset);

if (errors > 0) {
  log('\n❌ Pre-deployment validation FAILED', colors.red + colors.bold);
  log('Fix the errors above before deploying to production.\n', colors.red);
  process.exit(1);
} else if (warnings > 0) {
  log('\n⚠️  Pre-deployment validation PASSED with warnings', colors.yellow + colors.bold);
  log('Review the warnings above. Build is deployable but may have issues.\n', colors.yellow);
  process.exit(0);
} else {
  log('\n✅ Pre-deployment validation PASSED', colors.green + colors.bold);
  log('Build is ready for deployment!\n', colors.green);
  process.exit(0);
}
