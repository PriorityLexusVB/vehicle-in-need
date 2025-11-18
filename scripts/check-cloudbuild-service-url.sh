#!/bin/bash
# Static check to prevent SERVICE_URL from being misused as a Cloud Build substitution
# This script ensures that SERVICE_URL never appears as a substitution key in cloudbuild.yaml
# or in any build/deployment scripts.
#
# Usage: ./scripts/check-cloudbuild-service-url.sh
# Exit code: 0 if valid, 1 if SERVICE_URL misuse detected

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "🔍 Checking for SERVICE_URL misuse in Cloud Build configuration..."
echo ""

ERRORS=0

# Check if cloudbuild.yaml exists
if [ ! -f "$REPO_ROOT/cloudbuild.yaml" ]; then
    echo "❌ ERROR: cloudbuild.yaml not found at $REPO_ROOT/cloudbuild.yaml"
    exit 1
fi

echo "✅ Found cloudbuild.yaml"
echo ""

# Check if cloudbuild.yaml is valid YAML
if command -v yamllint &> /dev/null; then
    if ! yamllint -d relaxed "$REPO_ROOT/cloudbuild.yaml" > /dev/null 2>&1; then
        echo "⚠️  WARNING: cloudbuild.yaml has YAML syntax issues (detected by yamllint)"
        echo "   This may or may not be a problem. Review manually."
        echo ""
    fi
elif command -v python3 &> /dev/null; then
    # Use Python's YAML parser as fallback
    if ! python3 -c "import yaml; yaml.safe_load(open('$REPO_ROOT/cloudbuild.yaml'))" > /dev/null 2>&1; then
        echo "❌ ERROR: cloudbuild.yaml is not valid YAML"
        ERRORS=$((ERRORS + 1))
    fi
fi

# Check for SERVICE_URL in substitutions block
echo "Checking substitutions block..."
if grep -E '^\s*substitutions:\s*$' "$REPO_ROOT/cloudbuild.yaml" > /dev/null; then
    # Extract substitutions block (simplified check)
    if sed -n '/^substitutions:/,/^[a-zA-Z]/p' "$REPO_ROOT/cloudbuild.yaml" | grep -E '^\s+(_?SERVICE_URL|SERVICE_URL):' > /dev/null; then
        echo "❌ ERROR: Found SERVICE_URL or _SERVICE_URL in substitutions block of cloudbuild.yaml"
        echo "   SERVICE_URL must NOT be a Cloud Build substitution."
        echo "   It should only be a bash variable retrieved at runtime."
        echo ""
        ERRORS=$((ERRORS + 1))
    else
        echo "✅ No SERVICE_URL in substitutions block"
    fi
fi

# Check for SERVICE_URL in --substitutions flags in scripts and workflows
echo ""
echo "Checking scripts and workflows for --substitutions=SERVICE_URL usage..."
SCRIPT_FILES=$(find "$REPO_ROOT/scripts" "$REPO_ROOT/.github/workflows" -type f \( -name "*.sh" -o -name "*.bash" -o -name "*.yml" -o -name "*.yaml" \) 2>/dev/null || true)
if [ -n "$SCRIPT_FILES" ]; then
    for script in $SCRIPT_FILES; do
        # Skip this check script itself
        if [ "$(basename "$script")" = "check-cloudbuild-service-url.sh" ]; then
            continue
        fi
        
        # Check for SERVICE_URL in substitutions (excluding comments and error messages)
        if grep -n "substitutions.*SERVICE_URL" "$script" 2>/dev/null | \
           grep -v "^[[:space:]]*#" | \
           grep -v "ERROR" | \
           grep -v "WRONG" | \
           grep -v "Remove" > /dev/null; then
            echo "❌ ERROR: Found SERVICE_URL in substitutions in $script"
            grep -n "substitutions.*SERVICE_URL" "$script" | head -3
            echo ""
            ERRORS=$((ERRORS + 1))
        fi
    done
    
    if [ "$ERRORS" -eq 0 ]; then
        echo "✅ No SERVICE_URL misuse in scripts or workflows"
    fi
fi

# Check documentation files for incorrect examples
echo ""
echo "Checking documentation for incorrect SERVICE_URL examples..."
DOC_FILES="$REPO_ROOT/CLOUD_BUILD_SERVICE_URL_FIX.md $REPO_ROOT/QUICK_FIX_CHECKLIST.md $REPO_ROOT/README.md"
for doc in $DOC_FILES; do
    if [ -f "$doc" ]; then
        # Look for uncommented examples showing SERVICE_URL as substitution (not in error messages or "WRONG" sections)
        if grep -n "substitutions.*SERVICE_URL" "$doc" 2>/dev/null | \
           grep -v "ERROR" | \
           grep -v "WRONG" | \
           grep -v "❌" | \
           grep -v "Remove" | \
           grep -v "Don't" | \
           grep -v "NOT" | \
           grep -v "^[[:space:]]*#" > /dev/null; then
            echo "⚠️  WARNING: Found potentially incorrect SERVICE_URL example in $(basename "$doc")"
            echo "   Please verify this is shown as an incorrect example, not as valid usage"
            echo ""
        fi
    fi
done

echo ""
if [ "$ERRORS" -eq 0 ]; then
    echo "🎉 All checks passed!"
    echo ""
    echo "✅ cloudbuild.yaml is valid"
    echo "✅ No SERVICE_URL in substitutions block"
    echo "✅ No SERVICE_URL misuse in scripts or workflows"
    echo ""
    echo "SERVICE_URL is correctly used only as a runtime bash variable."
    exit 0
else
    echo "❌ Found $ERRORS error(s)"
    echo ""
    echo "📋 Fix required:"
    echo "   - SERVICE_URL must NEVER be a Cloud Build substitution"
    echo "   - It should only appear as a bash variable: SERVICE_URL=\$(gcloud run services describe ...)"
    echo "   - Remove any SERVICE_URL keys from substitutions in cloudbuild.yaml"
    echo "   - Remove any --substitutions=SERVICE_URL from scripts"
    echo ""
    exit 1
fi
