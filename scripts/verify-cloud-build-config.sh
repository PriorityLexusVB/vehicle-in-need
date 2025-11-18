#!/bin/bash
# Verify Cloud Build trigger configuration
# This script checks that the Cloud Build trigger is configured correctly
# without SERVICE_URL as a substitution variable

set -e

TRIGGER_NAME="vehicle-in-need-deploy"
PROJECT_ID="gen-lang-client-0615287333"

echo "🔍 Verifying Cloud Build trigger configuration..."
echo ""

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ ERROR: gcloud CLI is not installed"
    echo "   Install from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo "❌ ERROR: jq is not installed"
    echo "   Install jq for JSON parsing:"
    echo "   - Ubuntu/Debian: sudo apt-get install jq"
    echo "   - macOS: brew install jq"
    echo "   - Or visit: https://stedolan.github.io/jq/download/"
    exit 1
fi

# Check authentication
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    echo "❌ ERROR: Not authenticated to gcloud"
    echo "   Run: gcloud auth login"
    exit 1
fi

echo "✅ Authenticated to gcloud"
echo ""

# Get trigger configuration
echo "Fetching trigger configuration for: $TRIGGER_NAME"
TRIGGER_JSON=$(gcloud builds triggers describe "$TRIGGER_NAME" --project="$PROJECT_ID" --format=json 2>/dev/null || echo "{}")

if [ "$TRIGGER_JSON" = "{}" ]; then
    echo "❌ ERROR: Could not find trigger '$TRIGGER_NAME'"
    echo "   Available triggers:"
    gcloud builds triggers list --project="$PROJECT_ID" --format="table(name,description)"
    exit 1
fi

echo "✅ Found trigger: $TRIGGER_NAME"
echo ""

# Check substitutions
echo "Checking substitution variables..."
SUBSTITUTIONS=$(echo "$TRIGGER_JSON" | jq -r '.substitutions // {}')

# Check for SERVICE_URL (invalid)
if echo "$SUBSTITUTIONS" | jq -e '.SERVICE_URL' > /dev/null 2>&1; then
    echo "❌ ERROR: Found 'SERVICE_URL' in substitutions"
    echo "   SERVICE_URL should NOT be a substitution variable"
    echo "   It is a bash variable dynamically retrieved at runtime"
    echo ""
    echo "   Current substitutions:"
    echo "$SUBSTITUTIONS" | jq .
    echo ""
    echo "📋 FIX REQUIRED:"
    echo "   1. Go to: https://console.cloud.google.com/cloud-build/triggers"
    echo "   2. Select project: $PROJECT_ID"
    echo "   3. Click on trigger: $TRIGGER_NAME"
    echo "   4. Click EDIT"
    echo "   5. Scroll to 'Substitution variables' section"
    echo "   6. Remove the 'SERVICE_URL' entry"
    echo "   7. Click SAVE"
    exit 1
fi

if echo "$SUBSTITUTIONS" | jq -e '._SERVICE_URL' > /dev/null 2>&1; then
    echo "❌ ERROR: Found '_SERVICE_URL' in substitutions"
    echo "   SERVICE_URL should NOT be a substitution variable"
    echo "   It is a bash variable dynamically retrieved at runtime"
    echo ""
    echo "   Current substitutions:"
    echo "$SUBSTITUTIONS" | jq .
    echo ""
    echo "📋 FIX REQUIRED: Remove '_SERVICE_URL' from trigger substitutions"
    exit 1
fi

echo "✅ No SERVICE_URL in substitutions (correct)"
echo ""

# Check for valid substitutions
echo "Valid substitution variables found:"
if echo "$SUBSTITUTIONS" | jq -e '._REGION' > /dev/null 2>&1; then
    REGION=$(echo "$SUBSTITUTIONS" | jq -r '._REGION')
    echo "  ✅ _REGION: $REGION"
fi

if echo "$SUBSTITUTIONS" | jq -e '._SERVICE' > /dev/null 2>&1; then
    SERVICE=$(echo "$SUBSTITUTIONS" | jq -r '._SERVICE')
    echo "  ✅ _SERVICE: $SERVICE"
fi

# Check if there are any other substitutions
OTHER_SUBS=$(echo "$SUBSTITUTIONS" | jq -r 'keys | map(select(. != "_REGION" and . != "_SERVICE")) | join(", ")')
if [ -n "$OTHER_SUBS" ] && [ "$OTHER_SUBS" != "" ]; then
    echo ""
    echo "⚠️  WARNING: Found additional substitution variables:"
    echo "   $OTHER_SUBS"
    echo "   These may be valid, but verify they are intentional"
fi

echo ""
echo "🎉 Cloud Build trigger configuration is valid!"
echo ""
echo "📋 Summary:"
echo "   Trigger: $TRIGGER_NAME"
echo "   Project: $PROJECT_ID"
echo "   Status: ✅ PASS"
echo ""
echo "💡 To test the build manually:"
echo "   gcloud builds submit --config cloudbuild.yaml \\"
echo "     --substitutions _REGION=us-west1,_SERVICE=pre-order-dealer-exchange-tracker,SHORT_SHA=test-\$(date +%Y%m%d-%H%M)"
