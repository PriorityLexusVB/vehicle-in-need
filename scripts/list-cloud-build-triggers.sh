#!/bin/bash
# List all Cloud Build triggers and their substitution variables
# This helps operators identify triggers with incorrect SERVICE_URL configuration
#
# Usage: ./scripts/list-cloud-build-triggers.sh [PROJECT_ID]
# 
# Exit codes:
#   0 - All triggers are correctly configured
#   1 - Found triggers with SERVICE_URL misconfiguration
#   2 - gcloud or jq not available, or authentication failed

set -e

# Default project ID (can be overridden by argument)
PROJECT_ID="${1:-gen-lang-client-0615287333}"

echo "🔍 Listing Cloud Build triggers for project: $PROJECT_ID"
echo ""

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ ERROR: gcloud CLI is not installed"
    echo "   Install from: https://cloud.google.com/sdk/docs/install"
    exit 2
fi

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo "❌ ERROR: jq is not installed"
    echo "   Install jq for JSON parsing:"
    echo "   - Ubuntu/Debian: sudo apt-get install jq"
    echo "   - macOS: brew install jq"
    echo "   - Or visit: https://stedolan.github.io/jq/download/"
    exit 2
fi

# Check authentication
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null | grep -q .; then
    echo "❌ ERROR: Not authenticated to gcloud"
    echo "   Run: gcloud auth login"
    exit 2
fi

ACTIVE_ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)")
echo "✅ Authenticated as: $ACTIVE_ACCOUNT"
echo ""

# Get all triggers
TRIGGERS_JSON=$(gcloud builds triggers list --project="$PROJECT_ID" --format=json 2>/dev/null)

if [ -z "$TRIGGERS_JSON" ] || [ "$TRIGGERS_JSON" = "[]" ]; then
    echo "⚠️  No Cloud Build triggers found in project: $PROJECT_ID"
    exit 0
fi

TRIGGER_COUNT=$(echo "$TRIGGERS_JSON" | jq 'length')
echo "Found $TRIGGER_COUNT trigger(s)"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

ISSUES_FOUND=0

# Iterate through each trigger
for i in $(seq 0 $((TRIGGER_COUNT - 1))); do
    TRIGGER=$(echo "$TRIGGERS_JSON" | jq ".[$i]")
    
    # Extract trigger details
    TRIGGER_NAME=$(echo "$TRIGGER" | jq -r '.name // "unnamed"')
    TRIGGER_ID=$(echo "$TRIGGER" | jq -r '.id // "no-id"')
    REPO=$(echo "$TRIGGER" | jq -r '.github.name // .triggerTemplate.repoName // "unknown"')
    OWNER=$(echo "$TRIGGER" | jq -r '.github.owner // "unknown"')
    BRANCH=$(echo "$TRIGGER" | jq -r '.github.push.branch // .triggerTemplate.branchName // "unknown"')
    BUILD_CONFIG=$(echo "$TRIGGER" | jq -r '.filename // .build.source.storageSource.object // "unknown"')
    
    echo "Trigger: $TRIGGER_NAME"
    echo "  ID: $TRIGGER_ID"
    
    if [ "$OWNER" != "unknown" ] && [ "$REPO" != "unknown" ]; then
        echo "  Repository: github_${OWNER}_${REPO}"
    fi
    
    if [ "$BRANCH" != "unknown" ]; then
        echo "  Branch: $BRANCH"
    fi
    
    if [ "$BUILD_CONFIG" != "unknown" ]; then
        echo "  Build Config: $BUILD_CONFIG"
    fi
    
    # Extract and display substitutions
    SUBSTITUTIONS=$(echo "$TRIGGER" | jq -r '.substitutions // {}')
    
    if [ "$SUBSTITUTIONS" = "{}" ]; then
        echo "  Substitutions: (none)"
    else
        echo "  Substitutions:"
        # Get all substitution keys
        KEYS=$(echo "$SUBSTITUTIONS" | jq -r 'keys[]')
        
        HAS_SERVICE_URL=0
        
        for key in $KEYS; do
            value=$(echo "$SUBSTITUTIONS" | jq -r --arg k "$key" '.[$k]')
            
            # Check if this is a SERVICE_URL key
            if [ "$key" = "SERVICE_URL" ] || [ "$key" = "_SERVICE_URL" ]; then
                echo "    ❌ $key: $value  ← INVALID - MUST BE REMOVED"
                HAS_SERVICE_URL=1
            else
                echo "    $key: $value"
            fi
        done
        
        if [ "$HAS_SERVICE_URL" -eq 1 ]; then
            echo "  ❌ This trigger has SERVICE_URL configured as a substitution"
            echo "     SERVICE_URL must be removed from this trigger's configuration"
            echo "     See: CLOUD_BUILD_TRIGGER_RUNBOOK.md for fix instructions"
            ISSUES_FOUND=$((ISSUES_FOUND + 1))
        else
            echo "  ✅ No SERVICE_URL found (correct)"
        fi
    fi
    
    echo ""
    
    # Separator between triggers
    if [ "$i" -lt $((TRIGGER_COUNT - 1)) ]; then
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
    fi
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Summary:"
echo "  Total triggers: $TRIGGER_COUNT"

if [ "$ISSUES_FOUND" -eq 0 ]; then
    echo "  ✅ All triggers configured correctly"
    echo ""
    echo "💡 To verify a specific trigger in detail:"
    echo "   ./scripts/verify-cloud-build-config.sh"
    exit 0
else
    echo "  ❌ Found $ISSUES_FOUND trigger(s) with SERVICE_URL misconfiguration"
    echo ""
    echo "📋 Fix required:"
    echo "   1. For each trigger marked with ❌ above:"
    echo "   2. Go to Cloud Console → Cloud Build → Triggers"
    echo "   3. Click EDIT on the trigger"
    echo "   4. Remove SERVICE_URL or _SERVICE_URL from Substitution variables"
    echo "   5. Save the trigger"
    echo ""
    echo "   Detailed instructions: CLOUD_BUILD_TRIGGER_RUNBOOK.md"
    exit 1
fi
