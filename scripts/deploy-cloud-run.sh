#!/bin/bash
#
# Cloud Run Deployment Script
# Deploys the pre-order-dealer-exchange-tracker service to Cloud Run
#
# Usage:
#   ./scripts/deploy-cloud-run.sh [OPTIONS]
#
# Options:
#   --build           Build new image via Cloud Build before deploying
#   --image-sha=SHA   Deploy specific image SHA (default: latest)
#   --help            Show this help message
#
# Environment Variables:
#   PROJECT_ID        GCP project ID (default: gen-lang-client-0615287333)
#   REGION            GCP region (default: us-west1)
#

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default configuration
DEFAULT_PROJECT_ID="gen-lang-client-0615287333"
DEFAULT_REGION="us-west1"
SERVICE_NAME="pre-order-dealer-exchange-tracker"
ARTIFACT_REPO="vehicle-in-need"

# Parse arguments
BUILD_IMAGE=false
IMAGE_SHA=""
SHOW_HELP=false

for arg in "$@"; do
  case $arg in
    --build)
      BUILD_IMAGE=true
      shift
      ;;
    --image-sha=*)
      IMAGE_SHA="${arg#*=}"
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

# Show help
if [ "$SHOW_HELP" = true ]; then
  cat << 'EOF'
Cloud Run Deployment Script

CRITICAL: This script deploys using pre-built Docker images from Artifact Registry.
          DO NOT use 'gcloud run deploy --source' as it creates corrupted images.

Usage:
  ./scripts/deploy-cloud-run.sh [OPTIONS]

Options:
  --build              Build new image via Cloud Build before deploying
  --image-sha=SHA      Deploy specific image SHA (default: auto-detect or latest)
  --help, -h           Show this help message

Environment Variables:
  PROJECT_ID           GCP project ID (default: gen-lang-client-0615287333)
  REGION               GCP region (default: us-west1)

Examples:
  # Build and deploy
  ./scripts/deploy-cloud-run.sh --build

  # Deploy specific image
  ./scripts/deploy-cloud-run.sh --image-sha=abc1234

  # Deploy latest
  ./scripts/deploy-cloud-run.sh

For detailed documentation, see CLOUD_RUN_DEPLOYMENT_RUNBOOK.md
EOF
  exit 0
fi

# Use environment variables or defaults
PROJECT_ID="${PROJECT_ID:-$DEFAULT_PROJECT_ID}"
REGION="${REGION:-$DEFAULT_REGION}"
IMAGE_BASE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPO}/${SERVICE_NAME}"

echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Cloud Run Deployment Script                       ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Configuration:${NC}"
echo -e "  Project:  ${PROJECT_ID}"
echo -e "  Region:   ${REGION}"
echo -e "  Service:  ${SERVICE_NAME}"
echo ""

# Verify gcloud is installed
if ! command -v gcloud &> /dev/null; then
  echo -e "${RED}Error: gcloud CLI is not installed${NC}"
  echo "Install from: https://cloud.google.com/sdk/docs/install"
  exit 1
fi

# Verify authentication
echo -e "${BLUE}[1/5] Verifying GCP authentication...${NC}"
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &> /dev/null; then
  echo -e "${RED}Error: Not authenticated with gcloud${NC}"
  echo "Run: gcloud auth login"
  exit 1
fi
ACTIVE_ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)")
echo -e "${GREEN}✓ Authenticated as: ${ACTIVE_ACCOUNT}${NC}"

# Set project
echo -e "${BLUE}[2/5] Setting GCP project...${NC}"
gcloud config set project "${PROJECT_ID}" --quiet
echo -e "${GREEN}✓ Project set to: ${PROJECT_ID}${NC}"

# Build image if requested
if [ "$BUILD_IMAGE" = true ]; then
  echo -e "${BLUE}[3/5] Building image via Cloud Build...${NC}"
  echo -e "${YELLOW}⚠️  DO NOT use 'gcloud run deploy --source' - it creates corrupted images${NC}"
  
  # Get current commit SHA
  if [ -z "$IMAGE_SHA" ]; then
    if command -v git &> /dev/null && [ -d .git ]; then
      IMAGE_SHA=$(git rev-parse --short=7 HEAD)
      echo -e "Using commit SHA: ${IMAGE_SHA}"
    else
      echo -e "${RED}Error: Could not determine commit SHA${NC}"
      echo "Either run from a git repository or specify --image-sha=<sha>"
      exit 1
    fi
  fi
  
  echo "Submitting build to Cloud Build..."
  gcloud builds submit \
    --config cloudbuild.yaml \
    --substitutions="SHORT_SHA=${IMAGE_SHA},_REGION=${REGION},_SERVICE=${SERVICE_NAME},_ARTIFACT_REPO=${ARTIFACT_REPO}"
  
  echo -e "${GREEN}✓ Build completed successfully${NC}"
else
  echo -e "${BLUE}[3/5] Skipping build (use --build to rebuild)${NC}"
  
  # Determine image SHA to deploy
  if [ -z "$IMAGE_SHA" ]; then
    # Try to get current git commit SHA
    if command -v git &> /dev/null && [ -d .git ]; then
      GIT_SHA=$(git rev-parse --short=7 HEAD)
      echo -e "Auto-detected commit SHA: ${GIT_SHA}"
      
      # Check if this image exists in registry
      if gcloud artifacts docker images list "${IMAGE_BASE}" --filter="version=${GIT_SHA}" --format="value(version)" --limit=1 | grep -q "${GIT_SHA}"; then
        IMAGE_SHA="${GIT_SHA}"
        echo -e "${GREEN}✓ Found image for current commit: ${IMAGE_SHA}${NC}"
      else
        echo -e "${YELLOW}⚠️  No image found for current commit${NC}"
        IMAGE_SHA="latest"
      fi
    else
      IMAGE_SHA="latest"
    fi
  fi
  
  echo -e "Will deploy image tag: ${IMAGE_SHA}"
fi

# Verify image exists
echo -e "${BLUE}[4/5] Verifying image exists in Artifact Registry...${NC}"
IMAGE_PATH="${IMAGE_BASE}:${IMAGE_SHA}"
if ! gcloud artifacts docker images list "${IMAGE_BASE}" --filter="version=${IMAGE_SHA}" --format="value(version)" --limit=1 | grep -q "${IMAGE_SHA}"; then
  echo -e "${RED}Error: Image not found: ${IMAGE_PATH}${NC}"
  echo ""
  echo "Available images:"
  gcloud artifacts docker images list "${IMAGE_BASE}" --limit=5 --format="table(version,createTime)"
  echo ""
  echo "Options:"
  echo "  1. Build a new image: ./scripts/deploy-cloud-run.sh --build"
  echo "  2. Deploy a specific image: ./scripts/deploy-cloud-run.sh --image-sha=<sha>"
  exit 1
fi
echo -e "${GREEN}✓ Image exists: ${IMAGE_PATH}${NC}"

# Deploy to Cloud Run
echo -e "${BLUE}[5/5] Deploying to Cloud Run...${NC}"
echo -e "${YELLOW}⚠️  Using explicit --image flag (DO NOT use --source)${NC}"

BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)

gcloud run deploy "${SERVICE_NAME}" \
  --image="${IMAGE_PATH}" \
  --region="${REGION}" \
  --platform=managed \
  --allow-unauthenticated \
  --service-account=pre-order-dealer-exchange-860@gen-lang-client-0615287333.iam.gserviceaccount.com \
  --set-env-vars="NODE_ENV=production,APP_VERSION=${IMAGE_SHA},BUILD_TIME=${BUILD_TIME}" \
  --update-secrets="API_KEY=vehicle-in-need-gemini:latest"

echo -e "${GREEN}✓ Deployment completed${NC}"

# Get service URL
echo ""
echo -e "${BLUE}Deployment Summary:${NC}"
SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" --region="${REGION}" --format='value(status.url)')
echo -e "  Service URL: ${SERVICE_URL}"
echo -e "  Image:       ${IMAGE_PATH}"
echo -e "  Region:      ${REGION}"

# Health check
echo ""
echo -e "${BLUE}Running health check...${NC}"
if curl -f -s "${SERVICE_URL}/health" > /dev/null; then
  echo -e "${GREEN}✓ Health check passed${NC}"
  echo ""
  echo -e "${GREEN}╔════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║  Deployment Successful!                            ║${NC}"
  echo -e "${GREEN}╚════════════════════════════════════════════════════╝${NC}"
  echo ""
  echo -e "Service is now running at: ${SERVICE_URL}"
else
  echo -e "${RED}✗ Health check failed${NC}"
  echo ""
  echo "Check logs for errors:"
  echo "  gcloud run services logs read ${SERVICE_NAME} --region=${REGION} --limit=50"
  exit 1
fi
