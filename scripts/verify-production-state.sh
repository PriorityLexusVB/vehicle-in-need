#!/bin/bash
# Comprehensive Production State Verification Script
# 
# This script verifies that the production URL:
# - Reflects the latest GitHub main branch code
# - Has properly compiled and accessible CSS
# - Is deployed via the correct CI/CD pipeline
# - Has all safeguards in place
#
# Usage: ./scripts/verify-production-state.sh

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Production configuration
PRODUCTION_URL="https://pre-order-dealer-exchange-tracker-842946218691.us-west1.run.app"
SERVICE_NAME="pre-order-dealer-exchange-tracker"
REGION="us-west1"
PROJECT_ID="gen-lang-client-0615287333"

# Counters
CHECKS_PASSED=0
CHECKS_FAILED=0
CHECKS_WARNING=0
TOTAL_CHECKS=0

# Helper functions
print_header() {
    echo -e "\n${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${BLUE}$1${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

print_check() {
    local status=$1
    local message=$2
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    
    if [ "$status" = "pass" ]; then
        echo -e "${GREEN}✓${NC} $message"
        CHECKS_PASSED=$((CHECKS_PASSED + 1))
    elif [ "$status" = "fail" ]; then
        echo -e "${RED}✗${NC} $message"
        CHECKS_FAILED=$((CHECKS_FAILED + 1))
    elif [ "$status" = "warn" ]; then
        echo -e "${YELLOW}⚠${NC} $message"
        CHECKS_WARNING=$((CHECKS_WARNING + 1))
    else
        echo -e "  $message"
    fi
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

# Main verification
print_header "Production State Verification"
echo -e "Production URL: ${BOLD}$PRODUCTION_URL${NC}"
echo -e "Started: $(date -u +%Y-%m-%dT%H:%M:%SZ)\n"

# ============================================================================
# 1. LOCAL REPOSITORY STATE
# ============================================================================
print_header "1. Local Repository State"

# Check git repository
if git rev-parse --git-dir > /dev/null 2>&1; then
    print_check "pass" "Git repository detected"
    
    # Get current branch
    CURRENT_BRANCH=$(git branch --show-current)
    if [ "$CURRENT_BRANCH" = "main" ]; then
        print_check "pass" "On main branch"
    else
        print_check "warn" "Not on main branch (currently on: $CURRENT_BRANCH)"
    fi
    
    # Get local commit SHA
    LOCAL_SHA=$(git rev-parse --short HEAD)
    print_info "Local commit: $LOCAL_SHA"
    
    # Check for uncommitted changes
    if git diff-index --quiet HEAD --; then
        print_check "pass" "No uncommitted changes"
    else
        print_check "warn" "Uncommitted changes detected"
    fi
else
    print_check "fail" "Not in a git repository"
fi

# ============================================================================
# 2. BUILD SYSTEM VERIFICATION
# ============================================================================
print_header "2. Build System Verification"

# Check for required files
for file in package.json cloudbuild.yaml Dockerfile tailwind.config.js vite.config.ts; do
    if [ -f "$file" ]; then
        print_check "pass" "File exists: $file"
    else
        print_check "fail" "File missing: $file"
    fi
done

# Check for CSS source
if [ -f "src/index.css" ]; then
    if grep -q "@tailwind" src/index.css; then
        print_check "pass" "Tailwind directives found in src/index.css"
    else
        print_check "fail" "Tailwind directives missing in src/index.css"
    fi
else
    print_check "fail" "src/index.css not found"
fi

# Check for verification scripts
for script in scripts/verify-css-in-build.sh scripts/test-deployed-css.sh scripts/verify-deploy-parity.cjs; do
    if [ -f "$script" ]; then
        print_check "pass" "Verification script exists: $script"
    else
        print_check "warn" "Verification script missing: $script"
    fi
done

# ============================================================================
# 3. PRODUCTION SERVICE STATUS
# ============================================================================
print_header "3. Production Service Status"

# Check if production URL is accessible
print_info "Checking production URL accessibility..."
if curl -sf "$PRODUCTION_URL/health" > /dev/null 2>&1; then
    print_check "pass" "Production URL accessible ($PRODUCTION_URL/health)"
else
    print_check "fail" "Production URL not accessible ($PRODUCTION_URL/health)"
fi

# Check production version
print_info "Fetching production version..."
if PROD_STATUS=$(curl -sf "$PRODUCTION_URL/api/status" 2>/dev/null); then
    PROD_VERSION=$(echo "$PROD_STATUS" | grep -o '"version":"[^"]*"' | cut -d'"' -f4)
    PROD_ENV=$(echo "$PROD_STATUS" | grep -o '"environment":"[^"]*"' | cut -d'"' -f4)
    
    if [ -n "$PROD_VERSION" ]; then
        print_check "pass" "Production version: $PROD_VERSION"
        
        if [ -n "$LOCAL_SHA" ] && [ "$PROD_VERSION" = "$LOCAL_SHA" ]; then
            print_check "pass" "Production version matches local commit"
        elif [ -n "$LOCAL_SHA" ]; then
            print_check "warn" "Version mismatch (local: $LOCAL_SHA, prod: $PROD_VERSION)"
        fi
    else
        print_check "warn" "Could not determine production version"
    fi
    
    if [ "$PROD_ENV" = "production" ]; then
        print_check "pass" "Environment: production"
    else
        print_check "warn" "Environment: $PROD_ENV (expected: production)"
    fi
else
    print_check "warn" "Could not fetch /api/status"
fi

# ============================================================================
# 4. CSS VERIFICATION
# ============================================================================
print_header "4. CSS Verification"

print_info "Fetching production HTML..."
if HTML_CONTENT=$(curl -sL "$PRODUCTION_URL/" 2>/dev/null); then
    print_check "pass" "Successfully fetched index.html"
    
    # Check for CSS links
    if echo "$HTML_CONTENT" | grep -q '\.css'; then
        CSS_COUNT=$(echo "$HTML_CONTENT" | grep -c '\.css' || true)
        print_check "pass" "Found $CSS_COUNT CSS reference(s) in HTML"
        
        # Extract CSS href
        CSS_HREF=$(echo "$HTML_CONTENT" | grep -o 'href="/assets/[^"]*\.css"' | head -n 1 | sed 's/href="//;s/"$//')
        if [ -n "$CSS_HREF" ]; then
            print_info "CSS file: $CSS_HREF"
            
            # Check CSS accessibility
            CSS_URL="$PRODUCTION_URL$CSS_HREF"
            if curl -sf "$CSS_URL" > /tmp/prod-css.tmp 2>&1; then
                CSS_SIZE=$(wc -c < /tmp/prod-css.tmp)
                print_check "pass" "CSS file accessible ($CSS_SIZE bytes)"
                
                if [ "$CSS_SIZE" -gt 1000 ]; then
                    print_check "pass" "CSS file size acceptable (> 1KB)"
                else
                    print_check "fail" "CSS file too small (< 1KB)"
                fi
                
                # Check for Tailwind indicators
                if grep -q "tw-\|tailwind" /tmp/prod-css.tmp; then
                    print_check "pass" "CSS contains Tailwind indicators"
                else
                    print_check "warn" "CSS might not contain Tailwind (no tw- prefix found)"
                fi
                
                rm -f /tmp/prod-css.tmp
            else
                print_check "fail" "CSS file not accessible: $CSS_URL"
            fi
        else
            print_check "fail" "Could not extract CSS filename from HTML"
        fi
    else
        print_check "fail" "No CSS references found in HTML"
    fi
    
    # Check for Tailwind CDN (should NOT be present)
    if echo "$HTML_CONTENT" | grep -q "cdn.tailwindcss.com"; then
        print_check "fail" "Tailwind CDN detected (should use compiled CSS)"
    else
        print_check "pass" "No Tailwind CDN (using compiled CSS)"
    fi
else
    print_check "fail" "Could not fetch production HTML"
fi

# ============================================================================
# 5. BUILD CONFIGURATION VERIFICATION
# ============================================================================
print_header "5. Build Configuration"

# Check cloudbuild.yaml structure
if [ -f "cloudbuild.yaml" ]; then
    # Check for required steps
    if grep -q "id: check-conflicts" cloudbuild.yaml; then
        print_check "pass" "Conflict marker check present in cloudbuild.yaml"
    else
        print_check "warn" "Conflict marker check missing in cloudbuild.yaml"
    fi
    
    if grep -q "id: verify-css-deployed" cloudbuild.yaml; then
        print_check "pass" "CSS deployment verification present in cloudbuild.yaml"
    else
        print_check "warn" "CSS deployment verification missing in cloudbuild.yaml"
    fi
    
    # Check build configuration variables
    # Verify only correct variables are present (not the invalid SERVICE_URL key)
    SUBS_BLOCK=$(grep "substitutions:" -A 10 cloudbuild.yaml 2>/dev/null || echo "")
    INVALID_KEY="SERVICE_URL"
    if echo "$SUBS_BLOCK" | grep -q "$INVALID_KEY:"; then
        print_check "fail" "ERROR: Invalid key $INVALID_KEY found in config (must remove)"
    else
        print_check "pass" "No invalid SERVICE_URL key in config (correct)"
    fi
    
    # Check correct service name
    if grep -q "_SERVICE: $SERVICE_NAME" cloudbuild.yaml; then
        print_check "pass" "Service name correct in cloudbuild.yaml"
    else
        print_check "warn" "Service name might not match in cloudbuild.yaml"
    fi
fi

# Check Dockerfile
if [ -f "Dockerfile" ]; then
    if grep -q "CSS_COUNT" Dockerfile; then
        print_check "pass" "CSS verification present in Dockerfile"
    else
        print_check "warn" "CSS verification missing in Dockerfile"
    fi
    
    if grep -q "npm run build" Dockerfile || grep -q "npm ci" Dockerfile; then
        print_check "pass" "NPM build steps present in Dockerfile"
    else
        print_check "warn" "NPM build steps might be missing in Dockerfile"
    fi
fi

# ============================================================================
# 6. DOCUMENTATION CHECK
# ============================================================================
print_header "6. Documentation"

# Check for key documentation files
for doc in docs/DEPLOYMENT_RUNBOOK.md docs/CSS_EXECUTION_FINAL.md DEPLOYMENT_GUIDE.md; do
    if [ -f "$doc" ]; then
        print_check "pass" "Documentation exists: $doc"
    else
        print_check "warn" "Documentation missing: $doc"
    fi
done

# Check for runbooks
if [ -d "docs/operations" ]; then
    RUNBOOK_COUNT=$(find docs/operations -name "*.md" -type f | wc -l)
    print_check "pass" "Operations runbooks found ($RUNBOOK_COUNT files)"
else
    print_check "warn" "Operations runbooks directory missing"
fi

# ============================================================================
# 7. PACKAGE.JSON SCRIPTS
# ============================================================================
print_header "7. Package.json Scripts"

if [ -f "package.json" ]; then
    # Check for essential scripts
    for script in build verify:css verify:parity lint cloudbuild:verify-trigger; do
        if grep -q "\"$script\":" package.json; then
            print_check "pass" "Script exists: $script"
        else
            print_check "warn" "Script missing: $script"
        fi
    done
    
    # Check postbuild hook
    if grep -q "\"postbuild\":" package.json; then
        print_check "pass" "Postbuild hook configured"
    else
        print_check "warn" "Postbuild hook missing"
    fi
fi

# ============================================================================
# SUMMARY
# ============================================================================
print_header "Verification Summary"

echo -e "Total checks: ${BOLD}$TOTAL_CHECKS${NC}"
echo -e "Passed: ${GREEN}${BOLD}$CHECKS_PASSED${NC}"
echo -e "Failed: ${RED}${BOLD}$CHECKS_FAILED${NC}"
echo -e "Warnings: ${YELLOW}${BOLD}$CHECKS_WARNING${NC}"
echo ""

PASS_RATE=$((CHECKS_PASSED * 100 / TOTAL_CHECKS))
echo -e "Pass rate: ${BOLD}$PASS_RATE%${NC}\n"

echo -e "Completed: $(date -u +%Y-%m-%dT%H:%M:%SZ)\n"

# Exit status
if [ $CHECKS_FAILED -gt 0 ]; then
    echo -e "${RED}${BOLD}❌ VERIFICATION FAILED${NC}"
    echo -e "${RED}Critical issues detected. Review failures above and fix before deploying.${NC}\n"
    exit 1
elif [ $CHECKS_WARNING -gt 0 ]; then
    echo -e "${YELLOW}${BOLD}⚠️  VERIFICATION PASSED WITH WARNINGS${NC}"
    echo -e "${YELLOW}System is operational but some recommendations need attention.${NC}\n"
    exit 0
else
    echo -e "${GREEN}${BOLD}✅ VERIFICATION PASSED${NC}"
    echo -e "${GREEN}All checks passed! System is in optimal state.${NC}\n"
    exit 0
fi
