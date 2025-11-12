#!/usr/bin/env bash
# UI Audit Script - Comprehensive UI verification with secret scanning and optional Lighthouse
set -euo pipefail

echo "========================================"
echo "  UI Audit - Pre-Deployment Verification"
echo "========================================"
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track overall status
AUDIT_PASSED=true

echo "Step 1: Installing dependencies..."
npm ci

echo ""
echo "Step 2: Checking for merge conflict markers..."
if npm run prebuild:check; then
  echo -e "${GREEN}✓ No conflict markers found${NC}"
else
  echo -e "${RED}✗ Conflict markers detected - cannot proceed${NC}"
  exit 1
fi

echo ""
echo "Step 3: Building production bundle..."
if npm run build; then
  echo -e "${GREEN}✓ Build succeeded${NC}"
else
  echo -e "${RED}✗ Build failed${NC}"
  exit 1
fi

echo ""
echo "Step 4: Scanning for exposed secrets in dist/..."
# Check for Gemini API key environment variable (should never be in dist/)
if grep -r "VITE_GEMINI_API_KEY" dist/ 2>/dev/null; then
  echo -e "${RED}✗ SECURITY ISSUE: VITE_GEMINI_API_KEY found in dist/${NC}"
  echo "  The Gemini API key environment variable was detected in the production bundle."
  echo "  This is a critical security issue - do not deploy!"
  AUDIT_PASSED=false
else
  echo -e "${GREEN}✓ No VITE_GEMINI_API_KEY in dist/${NC}"
  echo "  Note: Firebase Web SDK API keys (AIza...) are expected and safe in the bundle."
  echo "  They are protected by Firebase Security Rules and designed to be public."
fi

echo ""
echo "Step 5: Running Lighthouse audit (if available)..."
# Check if lighthouse and http-server are available
if command -v lighthouse >/dev/null 2>&1 && command -v http-server >/dev/null 2>&1; then
  echo "  Starting local server on port 8080..."
  
  # Start http-server in background
  http-server dist -p 8080 -c-1 --silent &
  SERVER_PID=$!
  
  # Wait for server to start
  sleep 2
  
  # Run Lighthouse
  echo "  Running Lighthouse audit..."
  if lighthouse http://localhost:8080 \
    --output=html \
    --output-path=./lh-report.html \
    --chrome-flags="--headless --no-sandbox --disable-dev-shm-usage" \
    --quiet 2>/dev/null; then
    echo -e "${GREEN}✓ Lighthouse audit complete${NC}"
    echo "  Report saved to: lh-report.html"
  else
    echo -e "${YELLOW}⚠️  Lighthouse audit encountered issues (non-fatal)${NC}"
  fi
  
  # Kill the server
  kill $SERVER_PID 2>/dev/null || true
  wait $SERVER_PID 2>/dev/null || true
else
  echo -e "${YELLOW}⚠️  Lighthouse or http-server not installed (skipping)${NC}"
  echo "  To enable Lighthouse audits, install globally:"
  echo "    npm install -g lighthouse http-server"
fi

echo ""
echo "========================================"
echo "  Audit Summary"
echo "========================================"

if [ "$AUDIT_PASSED" = true ]; then
  echo -e "${GREEN}✓ All critical checks passed${NC}"
  echo ""
  echo "Build artifacts are ready for deployment."
  exit 0
else
  echo -e "${RED}✗ Audit failed - DO NOT DEPLOY${NC}"
  echo ""
  echo "Fix the issues above before deploying to production."
  exit 1
fi
