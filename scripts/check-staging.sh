#!/usr/bin/env bash
set -euo pipefail

STAGING_URL="${STAGING_URL:-}"
TEST_MANAGER_TOKEN="${TEST_MANAGER_TOKEN:-}"

if [ -z "$STAGING_URL" ]; then
  echo "STAGING_URL is not set; skipping staging checks"
  exit 0
fi

echo "Checking staging health at $STAGING_URL"
# Try /health then fallback to root
if curl --fail --silent --show-error -I "$STAGING_URL/health" >/dev/null 2>&1; then
  echo "/health ok"
elif curl --fail --silent --show-error -I "$STAGING_URL" >/dev/null 2>&1; then
  echo "root ok"
else
  echo "Staging health check failed against $STAGING_URL" >&2
  exit 2
fi

if [ -n "$TEST_MANAGER_TOKEN" ]; then
  echo "Attempting optional manager-access verification using TEST_MANAGER_TOKEN"
  # Optional custom endpoint that can perform a manager-only Firestore operation server-side for verification.
  VERIFY_URL="$STAGING_URL/__verify_manager_access"
  status_code=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TEST_MANAGER_TOKEN" "$VERIFY_URL" || true)
  if [ "$status_code" = "200" ]; then
    echo "Manager access verification endpoint returned 200 OK"
  elif [ "$status_code" = "404" ]; then
    echo "Manager verification endpoint not implemented (404); skipping this check"
  else
    echo "Manager verification endpoint returned HTTP $status_code" >&2
    exit 3
  fi
else
  echo "TEST_MANAGER_TOKEN not set; skipping manager-access verification"
fi

echo "Staging checks passed"
