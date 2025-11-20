#!/bin/bash
#
# Cloud Build Error Diagnosis Script
#
# This script diagnoses Cloud Build errors by checking:
# 1. Service account existence
# 2. IAM permissions and bindings
# 3. API enablement
# 4. Cloud Build trigger configuration
# 5. Secret Manager configuration
#
# Usage:
#   ./scripts/diagnose-cloud-build-error.sh [BUILD_ID]
#
# Options:
#   BUILD_ID    Optional Cloud Build ID to analyze (e.g., ba239e76-a1ad-4e30-bf0e-1ca4eb1fa401)
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
PROJECT_ID="gen-lang-client-0615287333"
CLOUD_BUILD_SA="cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com"
RUNTIME_SA="pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com"
SECRET_NAME="vehicle-in-need-gemini"
SERVICE_NAME="pre-order-dealer-exchange-tracker"
REGION="us-west1"
ARTIFACT_REGISTRY_REPO="vehicle-in-need"

BUILD_ID="${1:-}"

echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Cloud Build Error Diagnosis                       ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Project: ${PROJECT_ID}${NC}"
if [ -n "$BUILD_ID" ]; then
    echo -e "${BLUE}Build ID: ${BUILD_ID}${NC}"
fi
echo ""

ERRORS=0
WARNINGS=0

# Function to check if a command exists
command_exists() {
    command -v "$1" &> /dev/null
}

# Function to increment error counter
error() {
    echo -e "${RED}✗ ERROR: $1${NC}"
    ERRORS=$((ERRORS + 1))
}

# Function to increment warning counter
warning() {
    echo -e "${YELLOW}⚠ WARNING: $1${NC}"
    WARNINGS=$((WARNINGS + 1))
}

# Function to show success
success() {
    echo -e "${GREEN}✓ $1${NC}"
}

# ============================================================================
# STEP 0: Prerequisites Check
# ============================================================================
echo -e "${BLUE}[STEP 0] Checking Prerequisites${NC}"
echo ""

if ! command_exists gcloud; then
    error "gcloud CLI is not installed"
    echo "   Install from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi
success "gcloud CLI is installed"

if ! command_exists jq; then
    warning "jq is not installed (optional but recommended)"
    echo "   Install: sudo apt-get install jq (Ubuntu) or brew install jq (macOS)"
else
    success "jq is installed"
fi

# Check authentication
ACTIVE_ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null || echo "")
if [ -z "$ACTIVE_ACCOUNT" ]; then
    error "Not authenticated to gcloud"
    echo "   Run: gcloud auth login"
    exit 1
fi
success "Authenticated as: $ACTIVE_ACCOUNT"

# Set project
gcloud config set project "$PROJECT_ID" --quiet 2>/dev/null || true

echo ""

# ============================================================================
# STEP 1: Check Build Details (if BUILD_ID provided)
# ============================================================================
if [ -n "$BUILD_ID" ]; then
    echo -e "${BLUE}[STEP 1] Analyzing Build: ${BUILD_ID}${NC}"
    echo ""
    
    BUILD_INFO=$(gcloud builds describe "$BUILD_ID" --project="$PROJECT_ID" --format=json 2>/dev/null || echo "{}")
    
    if [ "$BUILD_INFO" = "{}" ]; then
        error "Could not retrieve build details for ID: $BUILD_ID"
        echo "   Verify the build ID is correct"
        echo "   Or check recent builds at: https://console.cloud.google.com/cloud-build/builds?project=$PROJECT_ID"
    else
        success "Found build: $BUILD_ID"
        
        # Extract status and error details
        STATUS=$(echo "$BUILD_INFO" | jq -r '.status // "UNKNOWN"' 2>/dev/null || echo "UNKNOWN")
        STATUS_DETAIL=$(echo "$BUILD_INFO" | jq -r '.statusDetail // ""' 2>/dev/null || echo "")
        
        echo "   Status: $STATUS"
        if [ -n "$STATUS_DETAIL" ]; then
            echo -e "   ${RED}Error Details:${NC}"
            echo "   $STATUS_DETAIL" | fold -s -w 70 | sed 's/^/   /'
            echo ""
            
            # Analyze the error
            if echo "$STATUS_DETAIL" | grep -qi "iam.serviceaccounts.actAs"; then
                error "Detected actAs permission error"
                echo ""
                echo -e "${YELLOW}   This is the most common Cloud Build error!${NC}"
                echo -e "${YELLOW}   Fix: Grant Service Account User role to Cloud Build SA${NC}"
                echo ""
                echo "   Run this command:"
                echo "   gcloud iam service-accounts add-iam-policy-binding \\"
                echo "     $RUNTIME_SA \\"
                echo "     --member='serviceAccount:$CLOUD_BUILD_SA' \\"
                echo "     --role='roles/iam.serviceAccountUser' \\"
                echo "     --project='$PROJECT_ID'"
                echo ""
            elif echo "$STATUS_DETAIL" | grep -qi "SERVICE_URL"; then
                error "Detected SERVICE_URL configuration error"
                echo ""
                echo -e "${YELLOW}   SERVICE_URL should NOT be a Cloud Build substitution!${NC}"
                echo -e "${YELLOW}   Fix: Remove SERVICE_URL from trigger configuration${NC}"
                echo ""
                echo "   See: docs/operations/CLOUD_BUILD_TRIGGER_RUNBOOK.md"
                echo ""
            elif echo "$STATUS_DETAIL" | grep -qi "permission"; then
                error "Detected general permission error"
                echo ""
                echo -e "${YELLOW}   Review IAM permissions for service accounts${NC}"
                echo "   See: CLOUD_BUILD_ERROR_FIX.md"
                echo ""
            fi
        fi
    fi
    echo ""
else
    echo -e "${BLUE}[STEP 1] Build Analysis Skipped${NC}"
    echo "   Provide BUILD_ID as argument to analyze a specific build"
    echo "   Example: ./scripts/diagnose-cloud-build-error.sh ba239e76-a1ad-4e30-bf0e-1ca4eb1fa401"
    echo ""
fi

# ============================================================================
# STEP 2: Verify Service Accounts Exist
# ============================================================================
echo -e "${BLUE}[STEP 2] Verifying Service Accounts${NC}"
echo ""

echo "2.1. Checking Cloud Build SA: $CLOUD_BUILD_SA"
if gcloud iam service-accounts describe "$CLOUD_BUILD_SA" --project="$PROJECT_ID" >/dev/null 2>&1; then
    success "Cloud Build SA exists"
else
    error "Cloud Build SA does not exist: $CLOUD_BUILD_SA"
    echo "   This service account must be created manually in GCP Console"
    echo "   Go to: https://console.cloud.google.com/iam-admin/serviceaccounts?project=$PROJECT_ID"
fi

echo ""
echo "2.2. Checking Runtime SA: $RUNTIME_SA"
if gcloud iam service-accounts describe "$RUNTIME_SA" --project="$PROJECT_ID" >/dev/null 2>&1; then
    success "Runtime SA exists"
else
    error "Runtime SA does not exist: $RUNTIME_SA"
    echo "   Create it with:"
    echo "   gcloud iam service-accounts create pre-order-dealer-exchange-860 \\"
    echo "     --project=$PROJECT_ID \\"
    echo "     --display-name='Pre-order Dealer Exchange Runtime'"
fi

echo ""

# ============================================================================
# STEP 3: Check IAM Permissions
# ============================================================================
echo -e "${BLUE}[STEP 3] Checking IAM Permissions${NC}"
echo ""

echo "3.1. Checking Cloud Build SA project-level permissions"
CB_ROLES=$(gcloud projects get-iam-policy "$PROJECT_ID" \
    --flatten='bindings[].members' \
    --filter="bindings.members:$CLOUD_BUILD_SA" \
    --format='value(bindings.role)' 2>/dev/null || echo "")

if [ -z "$CB_ROLES" ]; then
    error "No project-level roles found for Cloud Build SA"
else
    success "Cloud Build SA has project roles:"
    echo "$CB_ROLES" | while read -r role; do
        echo "   - $role"
    done
    
    # Check for required roles
    if echo "$CB_ROLES" | grep -q "roles/run.admin"; then
        success "Has roles/run.admin (required)"
    else
        error "Missing roles/run.admin"
        echo "   Grant with: gcloud projects add-iam-policy-binding $PROJECT_ID \\"
        echo "     --member='serviceAccount:$CLOUD_BUILD_SA' \\"
        echo "     --role='roles/run.admin'"
    fi
    
    if echo "$CB_ROLES" | grep -q "roles/artifactregistry.writer"; then
        success "Has roles/artifactregistry.writer (required)"
    else
        error "Missing roles/artifactregistry.writer"
        echo "   Grant with: gcloud projects add-iam-policy-binding $PROJECT_ID \\"
        echo "     --member='serviceAccount:$CLOUD_BUILD_SA' \\"
        echo "     --role='roles/artifactregistry.writer'"
    fi
fi

echo ""
echo "3.2. Checking actAs permission (CRITICAL)"
ACTAS_POLICY=$(gcloud iam service-accounts get-iam-policy "$RUNTIME_SA" \
    --project="$PROJECT_ID" \
    --format=json 2>/dev/null || echo "{}")

if [ "$ACTAS_POLICY" = "{}" ]; then
    error "Could not retrieve IAM policy for Runtime SA"
else
    if echo "$ACTAS_POLICY" | grep -q "$CLOUD_BUILD_SA"; then
        success "Cloud Build SA has permission to act as Runtime SA"
    else
        error "Cloud Build SA does NOT have actAs permission on Runtime SA"
        echo -e "${RED}   ★ THIS IS LIKELY THE ROOT CAUSE OF BUILD FAILURES! ★${NC}"
        echo ""
        echo "   Fix immediately with:"
        echo "   gcloud iam service-accounts add-iam-policy-binding \\"
        echo "     $RUNTIME_SA \\"
        echo "     --member='serviceAccount:$CLOUD_BUILD_SA' \\"
        echo "     --role='roles/iam.serviceAccountUser' \\"
        echo "     --project='$PROJECT_ID'"
    fi
fi

echo ""
echo "3.3. Checking Runtime SA permissions"
RT_ROLES=$(gcloud projects get-iam-policy "$PROJECT_ID" \
    --flatten='bindings[].members' \
    --filter="bindings.members:$RUNTIME_SA" \
    --format='value(bindings.role)' 2>/dev/null || echo "")

if [ -z "$RT_ROLES" ]; then
    warning "No project-level roles found for Runtime SA"
else
    success "Runtime SA has project roles:"
    echo "$RT_ROLES" | while read -r role; do
        echo "   - $role"
    done
    
    if echo "$RT_ROLES" | grep -q "roles/logging.logWriter"; then
        success "Has roles/logging.logWriter (required)"
    else
        warning "Missing roles/logging.logWriter (logs may not work)"
        echo "   Grant with: gcloud projects add-iam-policy-binding $PROJECT_ID \\"
        echo "     --member='serviceAccount:$RUNTIME_SA' \\"
        echo "     --role='roles/logging.logWriter'"
    fi
fi

echo ""
echo "3.4. Checking Secret Manager access"
SECRET_POLICY=$(gcloud secrets get-iam-policy "$SECRET_NAME" \
    --project="$PROJECT_ID" \
    --format=json 2>/dev/null || echo "{}")

if [ "$SECRET_POLICY" = "{}" ]; then
    error "Could not retrieve IAM policy for secret: $SECRET_NAME"
    echo "   Verify the secret exists"
else
    if echo "$SECRET_POLICY" | grep -q "$RUNTIME_SA"; then
        success "Runtime SA has access to secret: $SECRET_NAME"
    else
        error "Runtime SA does NOT have access to secret: $SECRET_NAME"
        echo "   Grant with: gcloud secrets add-iam-policy-binding $SECRET_NAME \\"
        echo "     --member='serviceAccount:$RUNTIME_SA' \\"
        echo "     --role='roles/secretmanager.secretAccessor' \\"
        echo "     --project=$PROJECT_ID"
    fi
fi

echo ""

# ============================================================================
# STEP 4: Check Required APIs
# ============================================================================
echo -e "${BLUE}[STEP 4] Checking Required APIs${NC}"
echo ""

check_api() {
    local api=$1
    local display_name=$2
    
    if gcloud services list --project="$PROJECT_ID" --filter="name:$api" --format="value(name)" 2>/dev/null | grep -q "$api"; then
        success "$display_name API is enabled"
    else
        error "$display_name API is NOT enabled"
        echo "   Enable with: gcloud services enable $api --project=$PROJECT_ID"
    fi
}

check_api "run.googleapis.com" "Cloud Run"
check_api "artifactregistry.googleapis.com" "Artifact Registry"
check_api "cloudbuild.googleapis.com" "Cloud Build"
check_api "secretmanager.googleapis.com" "Secret Manager"

echo ""

# ============================================================================
# STEP 5: Check Cloud Build Trigger Configuration
# ============================================================================
echo -e "${BLUE}[STEP 5] Checking Cloud Build Trigger${NC}"
echo ""

TRIGGER_NAME="vehicle-in-need-deploy"
TRIGGER_INFO=$(gcloud builds triggers describe "$TRIGGER_NAME" --project="$PROJECT_ID" --format=json 2>/dev/null || echo "{}")

if [ "$TRIGGER_INFO" = "{}" ]; then
    warning "Could not find trigger: $TRIGGER_NAME"
    echo "   List all triggers with:"
    echo "   gcloud builds triggers list --project=$PROJECT_ID"
else
    success "Found trigger: $TRIGGER_NAME"
    
    # Check for SERVICE_URL misconfiguration
    if echo "$TRIGGER_INFO" | grep -q '"SERVICE_URL"' || echo "$TRIGGER_INFO" | grep -q '"_SERVICE_URL"'; then
        error "Trigger has SERVICE_URL in substitutions (INVALID)"
        echo -e "${RED}   ★ SERVICE_URL MUST NOT BE A SUBSTITUTION VARIABLE! ★${NC}"
        echo ""
        echo "   Fix by removing SERVICE_URL from trigger configuration"
        echo "   See: docs/operations/CLOUD_BUILD_TRIGGER_RUNBOOK.md"
    else
        success "No SERVICE_URL misconfiguration detected"
    fi
    
    # Check service account used by trigger
    TRIGGER_SA=$(echo "$TRIGGER_INFO" | jq -r '.serviceAccount // ""' 2>/dev/null || echo "")
    if [ -n "$TRIGGER_SA" ]; then
        if [ "$TRIGGER_SA" = "$CLOUD_BUILD_SA" ]; then
            success "Trigger uses correct service account: $CLOUD_BUILD_SA"
        else
            warning "Trigger uses service account: $TRIGGER_SA"
            echo "   Expected: $CLOUD_BUILD_SA"
        fi
    else
        warning "Trigger does not specify a service account (uses default)"
        echo "   Consider specifying: $CLOUD_BUILD_SA"
    fi
fi

echo ""

# ============================================================================
# STEP 6: Check Artifact Registry
# ============================================================================
echo -e "${BLUE}[STEP 6] Checking Artifact Registry${NC}"
echo ""

if gcloud artifacts repositories describe "$ARTIFACT_REGISTRY_REPO" \
    --location="$REGION" \
    --project="$PROJECT_ID" >/dev/null 2>&1; then
    success "Artifact Registry repository exists: $ARTIFACT_REGISTRY_REPO"
else
    error "Artifact Registry repository NOT found: $ARTIFACT_REGISTRY_REPO"
    echo "   Create with:"
    echo "   gcloud artifacts repositories create $ARTIFACT_REGISTRY_REPO \\"
    echo "     --repository-format=docker \\"
    echo "     --location=$REGION \\"
    echo "     --project=$PROJECT_ID"
fi

echo ""

# ============================================================================
# STEP 7: Check Cloud Run Service
# ============================================================================
echo -e "${BLUE}[STEP 7] Checking Cloud Run Service${NC}"
echo ""

if gcloud run services describe "$SERVICE_NAME" \
    --region="$REGION" \
    --project="$PROJECT_ID" >/dev/null 2>&1; then
    success "Cloud Run service exists: $SERVICE_NAME"
    
    SERVICE_SA=$(gcloud run services describe "$SERVICE_NAME" \
        --region="$REGION" \
        --project="$PROJECT_ID" \
        --format='value(spec.template.spec.serviceAccountName)' 2>/dev/null || echo "")
    
    if [ "$SERVICE_SA" = "$RUNTIME_SA" ]; then
        success "Service uses correct service account: $RUNTIME_SA"
    else
        warning "Service uses service account: $SERVICE_SA"
        echo "   Expected: $RUNTIME_SA"
    fi
else
    warning "Cloud Run service NOT found: $SERVICE_NAME"
    echo "   It will be created on first deployment"
fi

echo ""

# ============================================================================
# Summary
# ============================================================================
echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Diagnosis Summary                                 ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"
echo ""

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✓ No errors or warnings found!${NC}"
    echo ""
    echo "Your Cloud Build configuration appears to be correct."
    echo "If builds are still failing, check:"
    echo "  1. Recent build logs for specific errors"
    echo "  2. Network connectivity to GCP services"
    echo "  3. Quota limits on your project"
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}Found $WARNINGS warning(s) but no critical errors${NC}"
    echo ""
    echo "Your configuration should work, but there are minor issues to address."
else
    echo -e "${RED}Found $ERRORS error(s) and $WARNINGS warning(s)${NC}"
    echo ""
    echo -e "${RED}★ ACTION REQUIRED ★${NC}"
    echo ""
    echo "Follow the commands shown above to fix the errors."
    echo ""
    echo "For comprehensive fix instructions, see:"
    echo "  • CLOUD_BUILD_ERROR_FIX.md (step-by-step guide)"
    echo "  • ./scripts/setup-iam-permissions.sh --execute (automated fix)"
    echo ""
    echo "Quick fix for most common error (actAs permission):"
    echo "  gcloud iam service-accounts add-iam-policy-binding \\"
    echo "    $RUNTIME_SA \\"
    echo "    --member='serviceAccount:$CLOUD_BUILD_SA' \\"
    echo "    --role='roles/iam.serviceAccountUser' \\"
    echo "    --project='$PROJECT_ID'"
fi

echo ""

exit $ERRORS
