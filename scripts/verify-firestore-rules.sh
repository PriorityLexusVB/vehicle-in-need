#!/bin/bash

# Script to verify that Firestore rules are deployed correctly
# This helps diagnose permission errors by checking if local rules match production

set -e

echo "🔍 Verifying Firestore Rules Deployment"
echo "========================================"
echo ""

# Check if Firebase CLI is available
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI not found. Please install it:"
    echo "   npm install -g firebase-tools"
    exit 1
fi

# Check if logged in
if ! firebase projects:list &> /dev/null; then
    echo "❌ Not logged into Firebase. Please run:"
    echo "   firebase login"
    exit 1
fi

# Get the project name using firebase use --json for reliable parsing
# Check if jq is available for JSON parsing
if ! command -v jq &> /dev/null; then
    echo "❌ jq not found. Please install jq to use this script:"
    echo "   - On Cloud Shell: jq is pre-installed"
    echo "   - On Ubuntu/Debian: sudo apt-get install jq"
    echo "   - On Fedora/RHEL/CentOS: sudo dnf install jq   # or: sudo yum install jq"
    echo "   - On Alpine: sudo apk add jq"
    echo "   - On macOS: brew install jq"
    exit 1
fi

# Use --json flag for reliable parsing
if ! FIREBASE_USE_OUTPUT=$(firebase use --json 2>/dev/null); then
    echo "❌ Failed to get Firebase project information."
    echo "   Please ensure Firebase CLI is properly configured."
    exit 1
fi

# Extract active project from JSON output
# Firebase CLI versions may structure output differently:
# - Older versions: .result.activeProject
# - Newer versions: .activeProject at root level
# The // operator provides fallback behavior for robustness
PROJECT=$(echo "$FIREBASE_USE_OUTPUT" | jq -r '.result.activeProject // .activeProject // empty')

# Check if we got a valid project
if [ -z "$PROJECT" ]; then
    echo "❌ Cannot determine active Firebase project."
    echo "   Please run 'firebase use <project-name>' first."
    echo ""
    echo "   Available commands:"
    echo "   - 'firebase use <project-id>' to set a project"
    echo "   - 'firebase projects:list' to see available projects"
    exit 1
fi

echo "📦 Project: $PROJECT"
echo ""

# Check local rules file
if [ ! -f "firestore.rules" ]; then
    echo "❌ firestore.rules file not found in current directory"
    exit 1
fi

echo "📄 Local rules file: firestore.rules"
echo "   Lines: $(wc -l < firestore.rules)"
echo ""

# Get checksum of local rules (use shasum for cross-platform compatibility)
if command -v shasum &> /dev/null; then
    LOCAL_CHECKSUM=$(shasum -a 256 firestore.rules | awk '{print $1}')
elif command -v md5sum &> /dev/null; then
    LOCAL_CHECKSUM=$(md5sum firestore.rules | awk '{print $1}')
elif command -v md5 &> /dev/null; then
    LOCAL_CHECKSUM=$(md5 -r firestore.rules | awk '{print $1}')
else
    LOCAL_CHECKSUM="N/A (no checksum tool available)"
fi
echo "🔐 Local rules checksum: $LOCAL_CHECKSUM"
echo ""

echo "⚠️  To verify production rules match local rules:"
echo "   1. Go to Firebase Console: https://console.firebase.google.com/project/$PROJECT/firestore/rules"
echo "   2. Check if the rules match the content of firestore.rules"
echo "   3. If they don't match, deploy with: firebase deploy --only firestore:rules"
echo ""

echo "📋 Key rules to verify in production:"
echo "   - Order creation requires: createdByUid, createdByEmail, createdAt"
echo "   - createdByUid must match request.auth.uid"
echo "   - createdByEmail must match request.auth.token.email"
echo "   - status must be one of: Factory Order, Locate, Dealer Exchange, Received, Delivered"
echo ""

# Extract the order creation rule dynamically
echo "📝 Current order creation rule (orders collection create):"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
# Find and extract the create rule from orders collection
if ORDER_CREATE_RULE=$(awk '/allow create:/{found=1} found{print; if(/;$/)exit}' firestore.rules); then
    echo "$ORDER_CREATE_RULE" | sed 's/^/   /'
else
    echo "   ⚠️  Could not extract order creation rule automatically."
    echo "   Please manually check lines around 'match /orders/{orderId}' and 'allow create'"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "✅ Verification complete. To deploy rules to production:"
echo "   firebase deploy --only firestore:rules"
