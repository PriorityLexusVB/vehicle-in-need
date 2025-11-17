#!/bin/bash
# Quick test script to verify CSS is accessible after deployment
# Usage: ./scripts/test-deployed-css.sh [SERVICE_URL]

set -e

SERVICE_URL="${1:-}"

if [ -z "$SERVICE_URL" ]; then
    echo "Usage: $0 <service-url>"
    echo ""
    echo "Example:"
    echo "  $0 https://pre-order-dealer-exchange-tracker-123456-uw.a.run.app"
    echo ""
    echo "Or get URL automatically:"
    echo "  SERVICE_URL=\$(gcloud run services describe pre-order-dealer-exchange-tracker --region=us-west1 --format='value(status.url)')"
    echo "  $0 \$SERVICE_URL"
    exit 1
fi

echo "🔍 Testing deployed CSS at: $SERVICE_URL"
echo ""

# 1. Fetch the HTML
echo "1️⃣  Fetching HTML..."
HTML=$(curl -sL "$SERVICE_URL")

# 2. Extract CSS references
echo "2️⃣  Extracting CSS references..."
CSS_REFS=$(echo "$HTML" | grep -o 'href="/assets/[^"]*\.css"' | sed 's/href="//;s/"$//' || true)

if [ -z "$CSS_REFS" ]; then
    echo "❌ ERROR: No CSS references found in HTML!"
    echo ""
    echo "This indicates the deployed HTML is missing CSS links."
    echo "The build may have failed or an old version is deployed."
    exit 1
fi

echo "✅ Found CSS references:"
echo "$CSS_REFS" | while read -r ref; do
    echo "   - $ref"
done
echo ""

# 3. Test each CSS file
echo "3️⃣  Testing CSS file accessibility..."
SUCCESS=0
FAILED=0

echo "$CSS_REFS" | while read -r ref; do
    CSS_URL="$SERVICE_URL$ref"
    echo -n "   Testing $ref ... "
    
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$CSS_URL")
    
    if [ "$HTTP_CODE" = "200" ]; then
        echo "✅ $HTTP_CODE"
        SUCCESS=$((SUCCESS + 1))
        
        # Check if CSS contains Tailwind classes
        CSS_CONTENT=$(curl -sL "$CSS_URL" | head -c 500)
        if echo "$CSS_CONTENT" | grep -q "tw-"; then
            echo "      ✅ Contains Tailwind classes"
        else
            echo "      ⚠️  WARNING: Doesn't appear to contain Tailwind classes"
        fi
    else
        echo "❌ $HTTP_CODE"
        FAILED=$((FAILED + 1))
    fi
done

echo ""

# 4. Test bundle version
echo "4️⃣  Checking bundle version..."
if echo "$HTML" | grep -q "VITE_APP_COMMIT_SHA"; then
    VERSION=$(echo "$HTML" | grep -o 'VITE_APP_COMMIT_SHA[^"]*' | head -1)
    echo "✅ Version info found: $VERSION"
else
    echo "⚠️  Version info not found in HTML source"
fi

echo ""
echo "✅ Deployment test complete!"
echo ""
echo "Next steps:"
echo "1. Open $SERVICE_URL in browser"
echo "2. Open DevTools Console (F12)"
echo "3. Look for '🚀 Application Bundle Info' and '📦 CSS Resources' logs"
echo "4. Check Network tab for CSS file (should be 200 OK)"
echo "5. If CSS shows red X in console, check error messages for diagnosis"
