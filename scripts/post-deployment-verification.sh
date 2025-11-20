#!/bin/bash
# Post-Deployment Verification Script
# 
# This script runs comprehensive checks after a deployment to ensure:
# - Service is accessible
# - Version matches expected commit
# - CSS is properly deployed
# - All critical endpoints work
#
# Usage: ./scripts/post-deployment-verification.sh [expected-commit-sha]

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Configuration
SERVICE_NAME="pre-order-dealer-exchange-tracker"
REGION="us-west1"
PROJECT_ID="gen-lang-client-0615287333"

# Counters
CHECKS_PASSED=0
CHECKS_FAILED=0
CHECKS_WARNING=0

echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}${BLUE}Post-Deployment Verification${NC}"
echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Get expected commit
EXPECTED_COMMIT="$1"
if [ -z "$EXPECTED_COMMIT" ]; then
    if git rev-parse --git-dir > /dev/null 2>&1; then
        EXPECTED_COMMIT=$(git rev-parse --short HEAD)
        echo -e "${BLUE}ℹ${NC} Using local HEAD commit: ${BOLD}$EXPECTED_COMMIT${NC}"
    else
        echo -e "${YELLOW}⚠${NC} No expected commit provided and not in git repository"
        echo "Usage: $0 [expected-commit-sha]"
    fi
fi

# Get service URL
if command -v gcloud &> /dev/null; then
    SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
        --region="$REGION" \
        --project="$PROJECT_ID" \
        --format='value(status.url)' 2>/dev/null || echo "")
    
    if [ -z "$SERVICE_URL" ]; then
        echo -e "${YELLOW}⚠${NC} Could not get service URL from gcloud, using default"
        SERVICE_URL="https://pre-order-dealer-exchange-tracker-842946218691.us-west1.run.app"
    fi
else
    echo -e "${YELLOW}⚠${NC} gcloud not available, using default URL"
    SERVICE_URL="https://pre-order-dealer-exchange-tracker-842946218691.us-west1.run.app"
fi

echo -e "${BLUE}ℹ${NC} Service URL: ${BOLD}$SERVICE_URL${NC}"
echo ""

# Helper function for checks
check() {
    local status=$1
    local message=$2
    
    if [ "$status" = "pass" ]; then
        echo -e "${GREEN}✓${NC} $message"
        CHECKS_PASSED=$((CHECKS_PASSED + 1))
    elif [ "$status" = "fail" ]; then
        echo -e "${RED}✗${NC} $message"
        CHECKS_FAILED=$((CHECKS_FAILED + 1))
    else
        echo -e "${YELLOW}⚠${NC} $message"
        CHECKS_WARNING=$((CHECKS_WARNING + 1))
    fi
}

# Check 1: Health Endpoint
echo -e "${BOLD}Check 1: Health Endpoint${NC}"
if curl -sf "$SERVICE_URL/health" > /dev/null 2>&1; then
    check "pass" "Health endpoint accessible"
else
    check "fail" "Health endpoint not accessible"
fi
echo ""

# Check 2: API Status Endpoint
echo -e "${BOLD}Check 2: API Status Endpoint${NC}"
STATUS_JSON=$(curl -sf "$SERVICE_URL/api/status" 2>/dev/null || echo "{}")
if [ -n "$STATUS_JSON" ] && [ "$STATUS_JSON" != "{}" ]; then
    check "pass" "API status endpoint accessible"
    
    # Parse status fields
    PROD_VERSION=$(echo "$STATUS_JSON" | grep -o '"version":"[^"]*"' | cut -d'"' -f4)
    PROD_ENV=$(echo "$STATUS_JSON" | grep -o '"environment":"[^"]*"' | cut -d'"' -f4)
    
    echo -e "  Environment: ${BOLD}$PROD_ENV${NC}"
    echo -e "  Version: ${BOLD}$PROD_VERSION${NC}"
    
    # Check environment
    if [ "$PROD_ENV" = "production" ]; then
        check "pass" "Environment is production"
    else
        check "warn" "Environment is not production: $PROD_ENV"
    fi
    
    # Check version format
    if [[ "$PROD_VERSION" =~ ^manual ]]; then
        check "fail" "Version shows MANUAL DEPLOYMENT: $PROD_VERSION"
    elif [ "$PROD_VERSION" = "unknown" ]; then
        check "fail" "Version is unknown (APP_VERSION not set)"
    elif [[ "$PROD_VERSION" =~ ^[a-fA-F0-9]{7,40}$ ]]; then
        check "pass" "Version format is valid git commit SHA"
        
        # Check if matches expected
        if [ -n "$EXPECTED_COMMIT" ]; then
            if [ "$PROD_VERSION" = "$EXPECTED_COMMIT" ]; then
                check "pass" "Version matches expected commit: $EXPECTED_COMMIT"
            else
                check "warn" "Version mismatch: expected $EXPECTED_COMMIT, got $PROD_VERSION"
            fi
        fi
    else
        check "warn" "Version format unexpected: $PROD_VERSION"
    fi
else
    check "fail" "API status endpoint not accessible"
fi
echo ""

# Check 3: Index HTML
echo -e "${BOLD}Check 3: Index HTML${NC}"
HTML_CONTENT=$(curl -sL "$SERVICE_URL/" 2>/dev/null || echo "")
if [ -n "$HTML_CONTENT" ]; then
    check "pass" "Index HTML accessible"
    
    # Check for CSS references
    if echo "$HTML_CONTENT" | grep -q '\.css'; then
        CSS_COUNT=$(echo "$HTML_CONTENT" | grep -c '\.css' || true)
        check "pass" "Found $CSS_COUNT CSS reference(s) in HTML"
    else
        check "fail" "No CSS references found in HTML"
    fi
    
    # Check for Tailwind CDN (should NOT be present)
    if echo "$HTML_CONTENT" | grep -q "cdn.tailwindcss.com"; then
        check "fail" "Tailwind CDN detected (should use compiled CSS)"
    else
        check "pass" "No Tailwind CDN (using compiled CSS)"
    fi
    
    # Check for hashed assets
    if echo "$HTML_CONTENT" | grep -qE '/assets/index-[a-zA-Z0-9_-]{8,}\.js'; then
        check "pass" "Hashed JavaScript bundle found"
    else
        check "warn" "No hashed JavaScript bundle found"
    fi
    
    if echo "$HTML_CONTENT" | grep -qE '/assets/index-[a-zA-Z0-9_-]{8,}\.css'; then
        check "pass" "Hashed CSS bundle found"
    else
        check "warn" "No hashed CSS bundle found"
    fi
else
    check "fail" "Could not fetch index HTML"
fi
echo ""

# Check 4: CSS Accessibility
echo -e "${BOLD}Check 4: CSS File Accessibility${NC}"
if [ -n "$HTML_CONTENT" ]; then
    CSS_HREF=$(echo "$HTML_CONTENT" | grep -oE '/(assets|static)/[^"]*\.css' | head -n 1)
    
    if [ -n "$CSS_HREF" ]; then
        echo -e "  CSS file: ${BOLD}$CSS_HREF${NC}"
        CSS_URL="$SERVICE_URL$CSS_HREF"
        
        if CSS_CONTENT=$(curl -sf "$CSS_URL" 2>/dev/null); then
            CSS_SIZE=$(echo -n "$CSS_CONTENT" | wc -c)
            check "pass" "CSS file accessible ($CSS_SIZE bytes)"
            
            if [ "$CSS_SIZE" -gt 1000 ]; then
                check "pass" "CSS file size acceptable (> 1KB)"
            else
                check "fail" "CSS file too small (< 1KB)"
            fi
            
            # Check for Tailwind indicators
            if echo "$CSS_CONTENT" | grep -qE 'tw-|tailwind'; then
                check "pass" "CSS contains Tailwind indicators"
            else
                check "warn" "CSS might not contain Tailwind"
            fi
        else
            check "fail" "CSS file not accessible: $CSS_URL"
        fi
    else
        check "fail" "Could not extract CSS filename from HTML"
    fi
else
    echo -e "${YELLOW}⚠${NC} Skipped (HTML not available)"
fi
echo ""

# Check 5: Service Worker
echo -e "${BOLD}Check 5: Service Worker${NC}"
if curl -sf "$SERVICE_URL/sw.js" > /dev/null 2>&1; then
    check "pass" "Service worker accessible"
else
    check "warn" "Service worker not accessible (may not be critical)"
fi
echo ""

# Summary
echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}${BLUE}Summary${NC}"
echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "Passed:   ${GREEN}${BOLD}$CHECKS_PASSED${NC}"
echo -e "Failed:   ${RED}${BOLD}$CHECKS_FAILED${NC}"
echo -e "Warnings: ${YELLOW}${BOLD}$CHECKS_WARNING${NC}"
echo ""

# Exit status
if [ $CHECKS_FAILED -gt 0 ]; then
    echo -e "${RED}${BOLD}❌ VERIFICATION FAILED${NC}"
    echo ""
    echo "Critical issues detected. Review failures above."
    echo ""
    echo "Common fixes:"
    echo "  - Version issues: npm run sync:production"
    echo "  - CSS issues: Redeploy with proper build"
    echo "  - Service unavailable: Check Cloud Run logs"
    echo ""
    exit 1
elif [ $CHECKS_WARNING -gt 0 ]; then
    echo -e "${YELLOW}${BOLD}⚠️  VERIFICATION PASSED WITH WARNINGS${NC}"
    echo ""
    echo "Service is operational but some recommendations need attention."
    echo ""
    exit 0
else
    echo -e "${GREEN}${BOLD}✅ VERIFICATION PASSED${NC}"
    echo ""
    echo "All checks passed! Deployment is healthy."
    echo ""
    exit 0
fi
