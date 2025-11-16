#!/bin/bash
#
# IAM Permission Setup Script for Cloud Build and Cloud Run
# 
# This script configures the IAM permissions required for:
# - cloud-build-deployer@gen-lang-client-0615287333.iam.gserviceaccount.com (Cloud Build SA)
# - pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com (Cloud Run Runtime SA)
# - 842946218691-compute@developer.gserviceaccount.com (Default Compute Engine SA - to be de-privileged)
#
# Prerequisites:
#   - You must have Owner or Security Admin role on the project gen-lang-client-0615287333
#   - gcloud CLI must be installed and authenticated
#
# Usage:
#   ./scripts/setup-iam-permissions.sh [--execute]
#
# Options:
#   --execute    Actually execute the commands (default: dry-run mode)
#   --help       Show this help message
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
DEFAULT_COMPUTE_SA="842946218691-compute@developer.gserviceaccount.com"
SECRET_NAME="vehicle-in-need-gemini"

# Parse arguments
DRY_RUN=true
SHOW_HELP=false

for arg in "$@"; do
  case $arg in
    --execute)
      DRY_RUN=false
      shift
      ;;
    --help|-h)
      SHOW_HELP=true
      shift
      ;;
    *)
      echo -e "${RED}Unknown option: $arg${NC}"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

if [ "$SHOW_HELP" = true ]; then
  cat << 'EOF'
IAM Permission Setup Script for Cloud Build and Cloud Run

This script sets up the IAM permissions required for secure Cloud Build and Cloud Run deployment.

Usage:
  ./scripts/setup-iam-permissions.sh [--execute]

Options:
  --execute    Actually execute the commands (default: dry-run mode)
  --help, -h   Show this help message

Prerequisites:
  - Owner or Security Admin role on project gen-lang-client-0615287333
  - gcloud CLI installed and authenticated

The script will:
  0. Verify service accounts exist (create runtime SA if missing)
  1. Grant minimal permissions to cloud-build-deployer SA
  2. Grant runtime permissions to pre-order-dealer-exchange-860 SA
  3. Display commands to remove overly broad permissions from default compute SA

EOF
  exit 0
fi

echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  IAM Permission Setup                              ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"
echo ""

if [ "$DRY_RUN" = true ]; then
  echo -e "${YELLOW}⚠️  DRY RUN MODE - Commands will be displayed but not executed${NC}"
  echo -e "${YELLOW}   Run with --execute to actually apply changes${NC}"
  echo ""
fi

echo -e "${BLUE}Project: ${PROJECT_ID}${NC}"
echo ""

# Function to run or display commands
run_cmd() {
  echo -e "${BLUE}→ $@${NC}"
  if [ "$DRY_RUN" = false ]; then
    eval "$@"
    echo -e "${GREEN}✓ Done${NC}"
  fi
  echo ""
}

# Function to check if service account exists
check_sa_exists() {
  local sa_email=$1
  if [ "$DRY_RUN" = false ]; then
    if gcloud iam service-accounts describe "$sa_email" --project="$PROJECT_ID" >/dev/null 2>&1; then
      return 0
    else
      return 1
    fi
  else
    # In dry-run mode, just note that we would check
    return 0
  fi
}

# ============================================================================
# STEP 0: Verify Service Accounts Exist
# ============================================================================
echo -e "${BLUE}[STEP 0] Verify Service Accounts${NC}"
echo ""

echo "0.1. List existing service accounts:"
if [ "$DRY_RUN" = false ]; then
  echo -e "${BLUE}→ gcloud iam service-accounts list --project=${PROJECT_ID} --format='table(email,displayName)'${NC}"
  gcloud iam service-accounts list --project="${PROJECT_ID}" --format='table(email,displayName)'
  echo ""
else
  echo -e "${BLUE}→ gcloud iam service-accounts list --project=${PROJECT_ID} --format='table(email,displayName)'${NC}"
  echo ""
fi

echo "0.2. Check Cloud Build SA exists:"
if [ "$DRY_RUN" = false ]; then
  if check_sa_exists "${CLOUD_BUILD_SA}"; then
    echo -e "${GREEN}✓ Cloud Build SA exists: ${CLOUD_BUILD_SA}${NC}"
  else
    echo -e "${RED}✗ Cloud Build SA NOT found: ${CLOUD_BUILD_SA}${NC}"
    echo -e "${RED}  Please create this service account before running this script.${NC}"
    exit 1
  fi
else
  echo -e "${BLUE}→ gcloud iam service-accounts describe ${CLOUD_BUILD_SA} --project=${PROJECT_ID}${NC}"
  echo -e "${YELLOW}  (Would verify Cloud Build SA exists)${NC}"
fi
echo ""

echo "0.3. Check Runtime SA exists (create if missing):"
if [ "$DRY_RUN" = false ]; then
  if check_sa_exists "${RUNTIME_SA}"; then
    echo -e "${GREEN}✓ Runtime SA exists: ${RUNTIME_SA}${NC}"
  else
    echo -e "${YELLOW}⚠ Runtime SA NOT found, creating it...${NC}"
    echo -e "${BLUE}→ gcloud iam service-accounts create pre-order-dealer-exchange-860 --project=${PROJECT_ID} --display-name='Pre-order Dealer Exchange Runtime'${NC}"
    gcloud iam service-accounts create pre-order-dealer-exchange-860 \
      --project="${PROJECT_ID}" \
      --display-name="Pre-order Dealer Exchange Runtime" \
      --description="Runtime service account for pre-order-dealer-exchange-tracker Cloud Run service"
    echo -e "${GREEN}✓ Runtime SA created${NC}"
  fi
else
  echo -e "${BLUE}→ gcloud iam service-accounts describe ${RUNTIME_SA} --project=${PROJECT_ID}${NC}"
  echo -e "${YELLOW}  (Would check if Runtime SA exists, create if missing)${NC}"
  echo -e "${BLUE}→ gcloud iam service-accounts create pre-order-dealer-exchange-860 --project=${PROJECT_ID} --display-name='Pre-order Dealer Exchange Runtime'${NC}"
  echo -e "${YELLOW}  (Would create Runtime SA if it doesn't exist)${NC}"
fi
echo ""

# ============================================================================
# STEP 1: Grant permissions to Cloud Build SA
# ============================================================================
echo -e "${BLUE}[STEP 1] Configure Cloud Build Service Account${NC}"
echo -e "Service Account: ${CLOUD_BUILD_SA}"
echo ""

echo "1.1. Grant Cloud Run Admin (to deploy Cloud Run services):"
run_cmd "gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member='serviceAccount:${CLOUD_BUILD_SA}' \
  --role='roles/run.admin'"

echo "1.2. Grant Artifact Registry Writer (to push images):"
run_cmd "gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member='serviceAccount:${CLOUD_BUILD_SA}' \
  --role='roles/artifactregistry.writer'"

echo "1.3. Grant Cloud Build Builds Editor (to manage builds):"
run_cmd "gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member='serviceAccount:${CLOUD_BUILD_SA}' \
  --role='roles/cloudbuild.builds.editor'"

echo "1.4. Grant Service Account User on runtime SA (to deploy as runtime SA):"
run_cmd "gcloud iam service-accounts add-iam-policy-binding ${RUNTIME_SA} \
  --member='serviceAccount:${CLOUD_BUILD_SA}' \
  --role='roles/iam.serviceAccountUser' \
  --project=${PROJECT_ID}"

# ============================================================================
# STEP 2: Configure Runtime SA
# ============================================================================
echo -e "${BLUE}[STEP 2] Configure Cloud Run Runtime Service Account${NC}"
echo -e "Service Account: ${RUNTIME_SA}"
echo ""

echo "2.1. Grant Log Writer (for Cloud Logging):"
run_cmd "gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member='serviceAccount:${RUNTIME_SA}' \
  --role='roles/logging.logWriter'"

echo "2.2. Grant Secret Manager Secret Accessor (for runtime secrets):"
run_cmd "gcloud secrets add-iam-policy-binding ${SECRET_NAME} \
  --member='serviceAccount:${RUNTIME_SA}' \
  --role='roles/secretmanager.secretAccessor' \
  --project=${PROJECT_ID}"

# Note: Add any additional roles needed by the application here
# For example, if the app uses Firestore, Pub/Sub, etc.

# ============================================================================
# STEP 3: De-privilege Default Compute SA (CAUTION)
# ============================================================================
echo -e "${BLUE}[STEP 3] De-privilege Default Compute Engine Service Account${NC}"
echo -e "Service Account: ${DEFAULT_COMPUTE_SA}"
echo -e "${YELLOW}⚠️  CAUTION: These commands remove roles from the default compute SA${NC}"
echo -e "${YELLOW}   Only run if you're certain no other services depend on these roles${NC}"
echo ""

if [ "$DRY_RUN" = true ]; then
  echo "The following commands would remove roles from the default compute SA:"
  echo ""
  echo "3.1. Remove Editor role (if present):"
  echo "  gcloud projects remove-iam-policy-binding ${PROJECT_ID} \\"
  echo "    --member='serviceAccount:${DEFAULT_COMPUTE_SA}' \\"
  echo "    --role='roles/editor'"
  echo ""
  echo "3.2. Remove Cloud Run Admin (if present):"
  echo "  gcloud projects remove-iam-policy-binding ${PROJECT_ID} \\"
  echo "    --member='serviceAccount:${DEFAULT_COMPUTE_SA}' \\"
  echo "    --role='roles/run.admin'"
  echo ""
  echo "3.3. Remove Service Account Admin (if present):"
  echo "  gcloud projects remove-iam-policy-binding ${PROJECT_ID} \\"
  echo "    --member='serviceAccount:${DEFAULT_COMPUTE_SA}' \\"
  echo "    --role='roles/iam.serviceAccountAdmin'"
  echo ""
  echo -e "${YELLOW}⚠️  Review current bindings before removing:${NC}"
  echo "  gcloud projects get-iam-policy ${PROJECT_ID} \\"
  echo "    --flatten='bindings[].members' \\"
  echo "    --filter='bindings.members:${DEFAULT_COMPUTE_SA}'"
  echo ""
else
  echo -e "${RED}⚠️  Skipping removal commands in --execute mode${NC}"
  echo -e "${RED}   Please review and run these manually if needed:${NC}"
  echo ""
  echo "# First, check current roles:"
  echo "gcloud projects get-iam-policy ${PROJECT_ID} \\"
  echo "  --flatten='bindings[].members' \\"
  echo "  --filter='bindings.members:${DEFAULT_COMPUTE_SA}'"
  echo ""
  echo "# Then, if confirmed unnecessary, remove them:"
  echo "# gcloud projects remove-iam-policy-binding ${PROJECT_ID} --member='serviceAccount:${DEFAULT_COMPUTE_SA}' --role='roles/editor'"
  echo "# gcloud projects remove-iam-policy-binding ${PROJECT_ID} --member='serviceAccount:${DEFAULT_COMPUTE_SA}' --role='roles/run.admin'"
  echo ""
fi

# ============================================================================
# STEP 4: Verify Configuration
# ============================================================================
echo -e "${BLUE}[STEP 4] Verify IAM Configuration${NC}"
echo ""

echo "To verify the IAM bindings after setup, run these commands:"
echo ""
echo "# Cloud Build SA permissions:"
echo "gcloud projects get-iam-policy ${PROJECT_ID} \\"
echo "  --flatten='bindings[].members' \\"
echo "  --filter='bindings.members:${CLOUD_BUILD_SA}' \\"
echo "  --format='table(bindings.role)'"
echo ""
echo "# Runtime SA permissions:"
echo "gcloud projects get-iam-policy ${PROJECT_ID} \\"
echo "  --flatten='bindings[].members' \\"
echo "  --filter='bindings.members:${RUNTIME_SA}' \\"
echo "  --format='table(bindings.role)'"
echo ""
echo "# Check impersonation permission:"
echo "gcloud iam service-accounts get-iam-policy ${RUNTIME_SA} \\"
echo "  --project=${PROJECT_ID}"
echo ""

if [ "$DRY_RUN" = false ]; then
  echo -e "${GREEN}╔════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║  IAM Setup Complete!                               ║${NC}"
  echo -e "${GREEN}╚════════════════════════════════════════════════════╝${NC}"
  echo ""
  echo "Next steps:"
  echo "1. Verify permissions using the commands above"
  echo "2. Test Cloud Build trigger deployment"
  echo "3. Review and manually de-privilege default compute SA if needed"
else
  echo -e "${YELLOW}╔════════════════════════════════════════════════════╗${NC}"
  echo -e "${YELLOW}║  Dry Run Complete - No Changes Made               ║${NC}"
  echo -e "${YELLOW}╚════════════════════════════════════════════════════╝${NC}"
  echo ""
  echo "To apply these changes, run:"
  echo "  ./scripts/setup-iam-permissions.sh --execute"
fi
