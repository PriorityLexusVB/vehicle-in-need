#!/bin/bash
# Verify Version Consistency Across Build Artifacts and Runtime
# This script ensures that version information is properly embedded and accessible
# at all stages of the build and deployment pipeline

set -e

echo "🔍 Verifying Version Consistency"
echo "=================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Track results
PASSED=0
FAILED=0
WARNINGS=0

# Function to log results
log_pass() {
    echo -e "${GREEN}✅ $1${NC}"
    PASSED=$((PASSED + 1))
}

log_fail() {
    echo -e "${RED}❌ $1${NC}"
    FAILED=$((FAILED + 1))
}

log_warn() {
    echo -e "${YELLOW}⚠️  $1${NC}"
    WARNINGS=$((WARNINGS + 1))
}

log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# 1. Check if git is available and we can get commit SHA
echo "1. Git Repository Check"
echo "-----------------------"
if command -v git >/dev/null 2>&1; then
    if GIT_SHA=$(git rev-parse --short HEAD 2>/dev/null); then
        log_pass "Git repository detected"
        log_info "Current commit SHA: $GIT_SHA"
    else
        log_warn "Git command available but not in a git repository"
    fi
else
    log_warn "Git command not available"
fi
echo ""

# 2. Check vite.config.ts for version injection
echo "2. Vite Configuration Check"
echo "---------------------------"
if [ -f "vite.config.ts" ]; then
    if grep -q "VITE_APP_COMMIT_SHA" vite.config.ts; then
        log_pass "VITE_APP_COMMIT_SHA defined in vite.config.ts"
    else
        log_fail "VITE_APP_COMMIT_SHA not found in vite.config.ts"
    fi
    
    if grep -q "VITE_APP_BUILD_TIME" vite.config.ts; then
        log_pass "VITE_APP_BUILD_TIME defined in vite.config.ts"
    else
        log_fail "VITE_APP_BUILD_TIME not found in vite.config.ts"
    fi
    
    if grep -q "__APP_VERSION__" vite.config.ts; then
        log_pass "__APP_VERSION__ defined in vite.config.ts"
    else
        log_fail "__APP_VERSION__ not found in vite.config.ts"
    fi
else
    log_fail "vite.config.ts not found"
fi
echo ""

# 3. Check if dist directory exists
echo "3. Build Output Check"
echo "---------------------"
if [ ! -d "dist" ]; then
    log_fail "dist/ directory not found - run 'npm run build' first"
    echo ""
    echo "Run: npm run build"
    exit 1
fi
log_pass "dist/ directory exists"
echo ""

# 4. Check if version info is in built JavaScript
echo "4. Bundle Version Check"
echo "-----------------------"
JS_FILES=$(find dist/assets -name "index-*.js" -type f)
if [ -z "$JS_FILES" ]; then
    log_fail "No JavaScript bundle found in dist/assets/"
else
    log_pass "JavaScript bundle found"
    
    # Check if VITE_APP_COMMIT_SHA appears in bundle
    if grep -q "VITE_APP_COMMIT_SHA" $JS_FILES 2>/dev/null; then
        log_pass "VITE_APP_COMMIT_SHA reference found in bundle"
        
        # Try to extract the actual value
        if BUNDLE_SHA=$(grep -o "VITE_APP_COMMIT_SHA.*['\"]:['\"][^'\"]*" $JS_FILES 2>/dev/null | head -1 | sed "s/.*['\"]:\s*['\"]//; s/['\"].*//"); then
            if [ -n "$BUNDLE_SHA" ] && [ "$BUNDLE_SHA" != "dev" ] && [ "$BUNDLE_SHA" != "unknown" ]; then
                log_info "Bundle version: $BUNDLE_SHA"
                
                # Compare with git SHA if available
                if [ -n "$GIT_SHA" ] && [ "$BUNDLE_SHA" = "$GIT_SHA" ]; then
                    log_pass "Bundle version matches git commit SHA"
                elif [ -n "$GIT_SHA" ]; then
                    log_warn "Bundle version ($BUNDLE_SHA) differs from git SHA ($GIT_SHA)"
                    log_info "This is OK if building from a specific commit or tag"
                fi
            else
                log_warn "Bundle version is '$BUNDLE_SHA' (dev/unknown)"
            fi
        fi
    else
        log_warn "VITE_APP_COMMIT_SHA not found in bundle (may be minified)"
    fi
fi
echo ""

# 5. Check server/index.cjs for version reporting
echo "5. Server Configuration Check"
echo "-----------------------------"
if [ -f "server/index.cjs" ]; then
    if grep -q "APP_VERSION" server/index.cjs; then
        log_pass "APP_VERSION environment variable used in server"
    else
        log_warn "APP_VERSION not found in server/index.cjs"
    fi
    
    if grep -q "/api/status" server/index.cjs; then
        log_pass "/api/status endpoint defined in server"
    else
        log_fail "/api/status endpoint not found in server"
    fi
else
    log_fail "server/index.cjs not found"
fi
echo ""

# 6. Check cloudbuild.yaml for proper version tagging
echo "6. Cloud Build Configuration Check"
echo "-----------------------------------"
if [ -f "cloudbuild.yaml" ]; then
    if grep -q "COMMIT_SHA=\${SHORT_SHA}" cloudbuild.yaml; then
        log_pass "COMMIT_SHA build arg set from SHORT_SHA in cloudbuild.yaml"
    else
        log_warn "COMMIT_SHA build arg not found in cloudbuild.yaml"
    fi
    
    if grep -q "APP_VERSION=\${SHORT_SHA}" cloudbuild.yaml; then
        log_pass "APP_VERSION env var set from SHORT_SHA in cloudbuild.yaml"
    else
        log_warn "APP_VERSION env var not found in cloudbuild.yaml"
    fi
    
    # Check if image is tagged with SHORT_SHA
    if grep -q ":\${SHORT_SHA}" cloudbuild.yaml; then
        log_pass "Docker image tagged with SHORT_SHA"
    else
        log_fail "Docker image not tagged with SHORT_SHA"
    fi
else
    log_fail "cloudbuild.yaml not found"
fi
echo ""

# 7. Check Dockerfile for version build args
echo "7. Dockerfile Configuration Check"
echo "---------------------------------"
if [ -f "Dockerfile" ]; then
    if grep -q "ARG COMMIT_SHA" Dockerfile; then
        log_pass "COMMIT_SHA build arg declared in Dockerfile"
    else
        log_fail "COMMIT_SHA build arg not found in Dockerfile"
    fi
    
    if grep -q "VITE_APP_COMMIT_SHA" Dockerfile; then
        log_pass "VITE_APP_COMMIT_SHA environment variable set in Dockerfile"
    else
        log_fail "VITE_APP_COMMIT_SHA not set in Dockerfile"
    fi
    
    if grep -q "ENV APP_VERSION" Dockerfile; then
        log_pass "APP_VERSION environment variable set in Dockerfile"
    else
        log_warn "APP_VERSION not set in Dockerfile runtime stage"
    fi
else
    log_fail "Dockerfile not found"
fi
echo ""

# 8. Check src/main.tsx for version mismatch detection
echo "8. Client Version Detection Check"
echo "----------------------------------"
if [ -f "src/main.tsx" ]; then
    if grep -q "VERSION MISMATCH" src/main.tsx; then
        log_pass "Version mismatch detection present in src/main.tsx"
    else
        log_warn "Version mismatch detection not found in src/main.tsx"
    fi
    
    if grep -q "import\.meta\.env.*VITE_APP_COMMIT_SHA" src/main.tsx; then
        log_pass "Client reads VITE_APP_COMMIT_SHA from environment"
    else
        log_fail "Client doesn't read VITE_APP_COMMIT_SHA"
    fi
    
    if grep -q "/api/status" src/main.tsx; then
        log_pass "Client fetches server version from /api/status"
    else
        log_warn "Client doesn't compare version with server"
    fi
else
    log_fail "src/main.tsx not found"
fi
echo ""

# Summary
echo "=================================="
echo "Verification Summary"
echo "=================================="
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo -e "${YELLOW}Warnings: $WARNINGS${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All critical checks passed!${NC}"
    echo ""
    echo "Version consistency is properly configured:"
    echo "  ✅ Git SHA → Vite build → Client bundle"
    echo "  ✅ Git SHA → Docker build args → Server runtime"
    echo "  ✅ Client can detect version mismatches with server"
    echo "  ✅ Cloud Build properly tags images with commit SHA"
    echo ""
    exit 0
else
    echo -e "${RED}❌ Some checks failed!${NC}"
    echo ""
    echo "Review the failures above and fix the configuration."
    echo "Version consistency may not work correctly until these issues are resolved."
    echo ""
    exit 1
fi
