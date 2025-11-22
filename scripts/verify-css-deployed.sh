#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="$1"   # e.g. pre-order-dealer-exchange-tracker
REGION="$2"         # e.g. us-west1

echo "🔍 Verifying CSS deployment for service: ${SERVICE_NAME} in region: ${REGION}"

# Get the Cloud Run URL for the service
SERVICE_URL="$(gcloud run services describe "${SERVICE_NAME}" \
  --region="${REGION}" \
  --format='value(status.url)')"

if [[ -z "${SERVICE_URL}" ]]; then
  echo "❌ ERROR: Could not resolve Cloud Run service URL"
  exit 1
fi

echo "Service URL: ${SERVICE_URL}"

echo "Waiting 10 seconds for service to stabilize..."
sleep 10

echo "Fetching index.html..."
HTML_CONTENT="$(curl -sS "${SERVICE_URL}/" || echo "")"

if [[ -z "${HTML_CONTENT}" ]]; then
  echo "❌ ERROR: Could not fetch index.html from ${SERVICE_URL}"
  exit 1
fi

# Extract CSS filename from HTML - match common patterns
CSS_HREF="$(echo "${HTML_CONTENT}" | grep -oE '/(assets|static)/[^"]*\.css' | head -n 1 || echo "")"

if [[ -z "${CSS_HREF}" ]]; then
  echo "❌ ERROR: No CSS file referenced in index.html!"
  echo "HTML content preview:"
  echo "${HTML_CONTENT}" | head -30
  exit 1
fi

echo "Found CSS reference: ${CSS_HREF}"

CSS_URL="${SERVICE_URL}${CSS_HREF}"

echo "Verifying CSS file is accessible: ${CSS_URL}"
HTTP_STATUS="$(curl -o /dev/null -s -w "%{http_code}" "${CSS_URL}")"

if [[ "${HTTP_STATUS}" != "200" ]]; then
  echo "❌ ERROR: CSS file returned HTTP ${HTTP_STATUS}"
  echo "CSS URL: ${CSS_URL}"
  exit 1
fi

CSS_CONTENT="$(curl -sS "${CSS_URL}")"
CSS_SIZE="$(echo -n "${CSS_CONTENT}" | wc -c)"

if [[ "${CSS_SIZE}" -lt 1000 ]]; then
  echo "❌ ERROR: CSS file is too small (${CSS_SIZE} bytes)"
  echo "Expected at least 1000 bytes"
  exit 1
fi

if echo "${CSS_CONTENT}" | grep -qE 'tw-|tailwind|@tailwind'; then
  TAILWIND_CHECK="YES"
else
  echo "⚠️  WARNING: CSS file does not contain obvious Tailwind markers (tw-, tailwind, @tailwind)"
  echo "   This may be OK if Tailwind classes are compiled differently"
  TAILWIND_CHECK="UNCERTAIN"
fi

echo "✅ CSS verification passed!"
echo "   URL: ${CSS_URL}"
echo "   HTTP Status: ${HTTP_STATUS}"
echo "   Size: ${CSS_SIZE} bytes"
echo "   Contains Tailwind: ${TAILWIND_CHECK}"
echo ""
echo "🎉 Deployment verification complete - CSS is properly deployed!"
