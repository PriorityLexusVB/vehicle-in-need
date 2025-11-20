#!/bin/bash
# Script to synchronize production deployment with the latest main branch commit
# 
# This script ensures that production is deployed from a specific commit on the main branch,
# eliminating version mismatches and "manual deployment" states.
#
# Usage: 
#   ./scripts/sync-production-with-main.sh [commit-sha]
#
# If no commit SHA is provided, deploys from the current HEAD of main branch.

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

echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}${BLUE}Production Deployment Sync Script${NC}"
echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}❌ ERROR: gcloud CLI is not installed or not in PATH${NC}"
    echo "Install it from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Check if in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo -e "${RED}❌ ERROR: Not in a git repository${NC}"
    echo "Please run this script from the vehicle-in-need repository root"
    exit 1
fi

# Determine target commit
if [ -n "$1" ]; then
    TARGET_COMMIT="$1"
    echo -e "${BLUE}ℹ${NC} Using provided commit: ${BOLD}$TARGET_COMMIT${NC}"
else
    # Fetch latest from remote
    echo -e "${BLUE}ℹ${NC} Fetching latest from origin/main..."
    git fetch origin main
    
    # Get the latest commit from main
    TARGET_COMMIT=$(git rev-parse origin/main)
    echo -e "${BLUE}ℹ${NC} Using latest commit from origin/main: ${BOLD}$TARGET_COMMIT${NC}"
fi

# Verify the commit exists
if ! git rev-parse --verify "$TARGET_COMMIT" > /dev/null 2>&1; then
    echo -e "${RED}❌ ERROR: Commit $TARGET_COMMIT does not exist${NC}"
    exit 1
fi

# Get short SHA
SHORT_SHA=$(git rev-parse --short "$TARGET_COMMIT")
FULL_SHA=$(git rev-parse "$TARGET_COMMIT")

echo ""
echo -e "${GREEN}✓${NC} Target commit validated"
echo -e "  Full SHA:  ${BOLD}$FULL_SHA${NC}"
echo -e "  Short SHA: ${BOLD}$SHORT_SHA${NC}"
echo ""

# Show commit details
echo -e "${BLUE}Commit Details:${NC}"
git log --oneline --decorate -1 "$TARGET_COMMIT"
echo ""

# Confirm deployment
echo -e "${YELLOW}⚠${NC}  This will deploy to production:"
echo -e "  Service:  ${BOLD}$SERVICE_NAME${NC}"
echo -e "  Region:   ${BOLD}$REGION${NC}"
echo -e "  Project:  ${BOLD}$PROJECT_ID${NC}"
echo -e "  Version:  ${BOLD}$SHORT_SHA${NC}"
echo ""

read -p "Continue with deployment? (yes/no): " -r
echo
if [[ ! $REPLY =~ ^[Yy]es$ ]]; then
    echo -e "${YELLOW}Deployment cancelled${NC}"
    exit 0
fi

echo ""
echo -e "${BLUE}ℹ${NC} Submitting build to Cloud Build..."
echo ""

# Submit the build
BUILD_ID=$(gcloud builds submit \
  --config=cloudbuild.yaml \
  --substitutions="_REGION=$REGION,_SERVICE=$SERVICE_NAME,SHORT_SHA=$SHORT_SHA" \
  --format='value(id)')

if [ -z "$BUILD_ID" ]; then
    echo -e "${RED}❌ ERROR: Failed to submit build${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} Build submitted: ${BOLD}$BUILD_ID${NC}"
echo ""
echo -e "${BLUE}ℹ${NC} Streaming build logs (Ctrl+C to stop watching, build will continue)..."
echo ""

# Stream build logs
gcloud builds log "$BUILD_ID" --stream || true

echo ""
echo -e "${BLUE}ℹ${NC} Checking final build status..."
BUILD_STATUS=$(gcloud builds describe "$BUILD_ID" --format='value(status)')

if [ "$BUILD_STATUS" = "SUCCESS" ]; then
    echo -e "${GREEN}${BOLD}✅ Deployment successful!${NC}"
    echo ""
    echo -e "${BLUE}ℹ${NC} Verifying production version..."
    
    # Get service URL
    SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
        --region="$REGION" \
        --project="$PROJECT_ID" \
        --format='value(status.url)')
    
    echo -e "  Service URL: ${BOLD}$SERVICE_URL${NC}"
    
    # Wait a moment for service to stabilize
    sleep 5
    
    # Check version
    if PROD_VERSION=$(curl -sf "$SERVICE_URL/api/status" 2>/dev/null | grep -o '"version":"[^"]*"' | cut -d'"' -f4); then
        echo -e "  Production version: ${BOLD}$PROD_VERSION${NC}"
        
        if [ "$PROD_VERSION" = "$SHORT_SHA" ]; then
            echo -e "${GREEN}${BOLD}✓ Version verified: Production matches deployed commit!${NC}"
        else
            echo -e "${YELLOW}⚠${NC}  Version mismatch detected:"
            echo -e "     Expected: $SHORT_SHA"
            echo -e "     Actual:   $PROD_VERSION"
            echo -e "     This may take a few moments to propagate..."
        fi
    else
        echo -e "${YELLOW}⚠${NC}  Could not verify version (service may still be starting)"
    fi
    
    echo ""
    echo -e "${GREEN}Next steps:${NC}"
    echo -e "  1. Verify deployment: ${BOLD}npm run verify:deployment${NC}"
    echo -e "  2. Check version match: ${BOLD}npm run verify:version${NC}"
    echo -e "  3. Test the application: ${BOLD}$SERVICE_URL${NC}"
    
elif [ "$BUILD_STATUS" = "FAILURE" ]; then
    echo -e "${RED}${BOLD}❌ Deployment failed${NC}"
    echo ""
    echo "View build logs:"
    echo -e "  ${BOLD}gcloud builds log $BUILD_ID${NC}"
    echo ""
    echo "Or visit:"
    echo -e "  ${BOLD}https://console.cloud.google.com/cloud-build/builds/$BUILD_ID?project=$PROJECT_ID${NC}"
    exit 1
else
    echo -e "${YELLOW}Build status: $BUILD_STATUS${NC}"
    echo "Check the Cloud Build console for details:"
    echo -e "  ${BOLD}https://console.cloud.google.com/cloud-build/builds/$BUILD_ID?project=$PROJECT_ID${NC}"
    exit 1
fi
