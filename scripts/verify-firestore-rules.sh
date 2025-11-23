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

# Get the project name
PROJECT=$(firebase use 2>/dev/null | grep "active project" | awk '{print $NF}' || echo "vehicles-in-need")
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

# Get checksum of local rules
LOCAL_CHECKSUM=$(md5sum firestore.rules | awk '{print $1}')
echo "🔐 Local rules checksum: $LOCAL_CHECKSUM"
echo ""

echo "⚠️  To verify production rules match local rules:"
echo "   1. Go to Firebase Console: https://console.firebase.google.com/project/$PROJECT/firestore/rules"
echo "   2. Check if the rules match the content of firestore.rules"
echo "   3. If they don't match, deploy with: firebase deploy --only firestore:rules"
echo ""

echo "📋 Key rules to verify in production:"
echo "   - Line 108-114: Order creation requires createdByUid, createdByEmail, createdAt"
echo "   - Line 111-112: createdByUid must match request.auth.uid"
echo "   - Line 112: createdByEmail must match request.auth.token.email"
echo "   - Line 114: status must be one of: Factory Order, Locate, Dealer Exchange, Received, Delivered"
echo ""

# Extract the order creation rule
echo "📝 Current order creation rule (lines 108-114):"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
sed -n '108,114p' firestore.rules | sed 's/^/   /'
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "✅ Verification complete. To deploy rules to production:"
echo "   firebase deploy --only firestore:rules"
