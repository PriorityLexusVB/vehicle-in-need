#!/usr/bin/env bash
#
# collect_delete_debug.sh - Collect Cloud Run/Functions logs for delete operation failures
#
# This script uses gcloud to pull logs from Cloud Run or Cloud Functions services
# that match delete-related operations within a specified time window. The output
# is a JSON file containing matching log entries.
#
# Usage:
#   ./scripts/collect_delete_debug.sh --service SERVICE_NAME [options]
#
# Options:
#   --service NAME    Required. Name of the Cloud Run service or Cloud Function
#   --project ID      GCP project ID (uses gcloud default if not specified)
#   --since TIME      Start time (default: 1h ago). Accepts formats like "1h", "30m", "2024-01-01T00:00:00Z"
#   --until TIME      End time (default: now). Same format as --since
#   --output FILE     Output JSON file (default: delete_debug_<timestamp>.json)
#   --filter EXPR     Additional log filter expression
#   --limit N         Maximum number of log entries (default: 500)
#   --help            Show this help message
#
# Examples:
#   # Collect logs from the last hour for a Cloud Run service
#   ./scripts/collect_delete_debug.sh --service pre-order-dealer-exchange-tracker
#
#   # Collect logs from a specific time window
#   ./scripts/collect_delete_debug.sh --service my-service --since "2024-01-01T10:00:00Z" --until "2024-01-01T12:00:00Z"
#
#   # Add custom filter
#   ./scripts/collect_delete_debug.sh --service my-service --filter 'jsonPayload.orderId="abc123"'
#
# Prerequisites:
#   - gcloud CLI installed and configured
#   - User authenticated with appropriate permissions (roles/logging.viewer)
#   - GOOGLE_APPLICATION_CREDENTIALS set for service account usage (optional)
#
# References:
#   - Failing job: b7bbf4ce81bc133cf79910dea610113b18695186
#   - MD060 fixed in PR #134
#

set -euo pipefail

# Default values
SERVICE=""
PROJECT=""
SINCE="1h"
UNTIL=""
OUTPUT=""
CUSTOM_FILTER=""
LIMIT=500

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

usage() {
  cat << 'EOF'
Usage: ./scripts/collect_delete_debug.sh --service SERVICE_NAME [options]

Collect Cloud Run/Functions logs for delete operation failures.

Required:
  --service NAME    Name of the Cloud Run service or Cloud Function

Options:
  --project ID      GCP project ID (uses gcloud default if not specified)
  --since TIME      Start time (default: 1h). Examples: "1h", "30m", "2024-01-01T00:00:00Z"
  --until TIME      End time (default: now)
  --output FILE     Output JSON file (default: delete_debug_<timestamp>.json)
  --filter EXPR     Additional log filter expression
  --limit N         Maximum number of log entries (default: 500)
  --help            Show this help message

Examples:
  ./scripts/collect_delete_debug.sh --service pre-order-dealer-exchange-tracker
  ./scripts/collect_delete_debug.sh --service my-service --since "2h" --limit 1000
  ./scripts/collect_delete_debug.sh --service my-service --filter 'jsonPayload.error!=""'
EOF
  exit 0
}

log_info() {
  echo -e "${GREEN}ℹ️  $1${NC}"
}

log_warn() {
  echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
  echo -e "${RED}❌ $1${NC}" >&2
}

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --service)
      SERVICE="$2"
      shift 2
      ;;
    --project)
      PROJECT="$2"
      shift 2
      ;;
    --since)
      SINCE="$2"
      shift 2
      ;;
    --until)
      UNTIL="$2"
      shift 2
      ;;
    --output)
      OUTPUT="$2"
      shift 2
      ;;
    --filter)
      CUSTOM_FILTER="$2"
      shift 2
      ;;
    --limit)
      LIMIT="$2"
      shift 2
      ;;
    --help|-h)
      usage
      ;;
    *)
      log_error "Unknown option: $1"
      usage
      ;;
  esac
done

# Validate required arguments
if [[ -z "$SERVICE" ]]; then
  log_error "Missing required argument: --service"
  echo ""
  usage
fi

# Check for gcloud
if ! command -v gcloud &> /dev/null; then
  log_error "gcloud CLI is not installed or not in PATH"
  echo "Install gcloud: https://cloud.google.com/sdk/docs/install"
  exit 1
fi

# Get project ID
if [[ -z "$PROJECT" ]]; then
  PROJECT=$(gcloud config get-value project 2>/dev/null || true)
  if [[ -z "$PROJECT" ]]; then
    log_error "No project ID specified and no default project set"
    echo "Use --project or run: gcloud config set project PROJECT_ID"
    exit 1
  fi
  log_info "Using default project: $PROJECT"
fi

# Set default output file
if [[ -z "$OUTPUT" ]]; then
  TIMESTAMP=$(date +%Y%m%d_%H%M%S)
  OUTPUT="delete_debug_${TIMESTAMP}.json"
fi

# Build the log filter
# Look for delete-related operations: DELETE requests, delete operations, errors
FILTER='(
  resource.type="cloud_run_revision" OR 
  resource.type="cloud_function"
) AND (
  resource.labels.service_name="'"$SERVICE"'" OR
  resource.labels.function_name="'"$SERVICE"'"
) AND (
  httpRequest.requestMethod="DELETE" OR
  jsonPayload.message=~"(?i)delete" OR
  textPayload=~"(?i)delete" OR
  jsonPayload.error!="" OR
  severity>=WARNING
)'

# Add time constraints
if [[ -n "$SINCE" ]]; then
  # Handle relative time (e.g., "1h", "30m") or absolute time
  if [[ "$SINCE" =~ ^[0-9]+[hms]$ ]]; then
    # Relative time - gcloud handles this natively
    FILTER="$FILTER AND timestamp>=\"$(date -u -d "-${SINCE%[hms]} ${SINCE: -1}" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-${SINCE}S +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo "")\"" 
    # Fallback: let gcloud parse it if date command fails
    if [[ "$FILTER" == *'""'* ]]; then
      FILTER='(
  resource.type="cloud_run_revision" OR 
  resource.type="cloud_function"
) AND (
  resource.labels.service_name="'"$SERVICE"'" OR
  resource.labels.function_name="'"$SERVICE"'"
) AND (
  httpRequest.requestMethod="DELETE" OR
  jsonPayload.message=~"(?i)delete" OR
  textPayload=~"(?i)delete" OR
  jsonPayload.error!="" OR
  severity>=WARNING
)'
    fi
  else
    # Absolute time
    FILTER="$FILTER AND timestamp>=\"$SINCE\""
  fi
fi

if [[ -n "$UNTIL" ]]; then
  FILTER="$FILTER AND timestamp<=\"$UNTIL\""
fi

# Add custom filter if provided
if [[ -n "$CUSTOM_FILTER" ]]; then
  FILTER="$FILTER AND ($CUSTOM_FILTER)"
fi

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  Collect Delete Debug Logs                                     ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
log_info "Project: $PROJECT"
log_info "Service: $SERVICE"
log_info "Time window: ${SINCE} to ${UNTIL:-now}"
log_info "Output file: $OUTPUT"
log_info "Max entries: $LIMIT"
echo ""

# Run the query
log_info "Querying logs..."
echo ""

# Execute gcloud logging read
if ! gcloud logging read "$FILTER" \
  --project="$PROJECT" \
  --format=json \
  --limit="$LIMIT" \
  > "$OUTPUT" 2>&1; then
  log_error "Failed to query logs"
  cat "$OUTPUT"
  rm -f "$OUTPUT"
  exit 1
fi

# Check results
ENTRY_COUNT=$(jq 'length' "$OUTPUT" 2>/dev/null || echo "0")

if [[ "$ENTRY_COUNT" == "0" || "$ENTRY_COUNT" == "null" ]]; then
  log_warn "No log entries found matching the criteria"
  echo ""
  echo "Suggestions:"
  echo "  - Expand the time window with --since"
  echo "  - Check if the service name is correct"
  echo "  - Verify you have logging.viewer permissions"
  rm -f "$OUTPUT"
  exit 0
fi

log_info "Found $ENTRY_COUNT log entries"
echo ""

# Summary of log severities
log_info "Log severity breakdown:"
jq -r 'group_by(.severity) | .[] | "  \(.[0].severity // "DEFAULT"): \(length)"' "$OUTPUT" 2>/dev/null || true
echo ""

# Extract any error messages
ERROR_COUNT=$(jq '[.[] | select(.severity == "ERROR" or .severity == "CRITICAL")] | length' "$OUTPUT" 2>/dev/null || echo "0")
if [[ "$ERROR_COUNT" -gt 0 ]]; then
  log_warn "Found $ERROR_COUNT error/critical entries"
  echo ""
  echo "Sample error messages:"
  jq -r '.[] | select(.severity == "ERROR" or .severity == "CRITICAL") | .textPayload // .jsonPayload.message // "N/A"' "$OUTPUT" 2>/dev/null | head -5
  echo ""
fi

# Show sample entries
log_info "Sample log entries (first 3):"
echo ""
jq '.[0:3] | .[] | {
  timestamp: .timestamp,
  severity: .severity,
  method: .httpRequest.requestMethod,
  path: .httpRequest.requestUrl,
  message: (.textPayload // .jsonPayload.message // "N/A")
}' "$OUTPUT" 2>/dev/null || true
echo ""

log_info "Full logs saved to: $OUTPUT"
echo ""
echo "To view the logs:"
echo "  cat $OUTPUT | jq ."
echo ""
echo "To filter errors only:"
echo "  cat $OUTPUT | jq '[.[] | select(.severity == \"ERROR\")]'"
echo ""
