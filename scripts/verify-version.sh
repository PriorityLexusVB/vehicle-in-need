#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="$1"   # e.g. pre-order-dealer-exchange-tracker
REGION="$2"         # e.g. us-west1
EXPECTED_SHA="$3"   # SHORT_SHA from Cloud Build

echo "🔍 Verifying deployed version for service: ${SERVICE_NAME} in region: ${REGION}"
echo "Expected commit SHORT_SHA: ${EXPECTED_SHA}"

SERVICE_URL="$(gcloud run services describe "${SERVICE_NAME}" \
  --region="${REGION}" \
  --format='value(status.url)')"

if [[ -z "${SERVICE_URL}" ]]; then
  echo "❌ ERROR: Could not resolve Cloud Run service URL"
  exit 1
fi

echo "Service URL: ${SERVICE_URL}"

sleep 3

echo "Fetching version from /api/status..."
STATUS_JSON="$(curl -sS "${SERVICE_URL}/api/status" || echo "{}")"

if [[ -z "${STATUS_JSON}" || "${STATUS_JSON}" == "{}" ]]; then
  echo "❌ ERROR: Could not fetch /api/status"
  exit 1
fi

DEPLOYED_VERSION="$(echo "${STATUS_JSON}" | grep -o '"version":"[^"]*"' | cut -d'"' -f4 || echo "")"

if [[ -z "${DEPLOYED_VERSION}" ]]; then
  echo "❌ ERROR: Could not extract version from API status"
  echo "Response: ${STATUS_JSON}"
  exit 1
fi

echo "Deployed version: ${DEPLOYED_VERSION}"

if [[ "${DEPLOYED_VERSION}" =~ ^manual ]]; then
  echo "❌ ERROR: Deployed version shows MANUAL DEPLOYMENT!"
  echo "   Version: ${DEPLOYED_VERSION}"
  echo "   This should never happen in production!"
  exit 1
fi

if [[ "${DEPLOYED_VERSION}" == "unknown" ]]; then
  echo "❌ ERROR: Deployed version is 'unknown'"
  echo "   APP_VERSION environment variable was not set correctly"
  exit 1
fi

if [[ "${DEPLOYED_VERSION}" == "${EXPECTED_SHA}" ]]; then
  echo "✅ Version verification passed!"
  echo "   Deployed version matches commit SHA: ${EXPECTED_SHA}"
else
  echo "❌ ERROR: Version mismatch detected"
  echo "   Deployed: ${DEPLOYED_VERSION}"
  echo "   Expected: ${EXPECTED_SHA}"
  echo "   This indicates the deployment did not set APP_VERSION correctly"
  exit 1
fi

echo ""
echo "🎉 Version verification complete!"
