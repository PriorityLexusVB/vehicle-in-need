#!/bin/bash
# Pre-deployment CSS verification script
# Run this before deploying to catch CSS issues early
#
# Usage:
#   bash scripts/pre-deploy-css-check.sh

set -e

echo "========================================"
echo "  Pre-Deployment CSS Verification"
echo "========================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check 1: Clean build
echo -e "${BLUE}[1/6]${NC} Running clean build..."
if [ -d "dist" ]; then
  rm -rf dist/
  echo "      Cleaned existing dist/"
fi

if npm run build > /tmp/build-output.log 2>&1; then
  echo -e "      ${GREEN}✅ Build succeeded${NC}"
else
  echo -e "      ${RED}❌ Build failed${NC}"
  echo ""
  echo "Build output:"
  cat /tmp/build-output.log
  exit 1
fi
echo ""

# Check 2: CSS files exist
echo -e "${BLUE}[2/6]${NC} Checking CSS files..."
CSS_COUNT=$(find dist/assets -name "*.css" -type f | wc -l)
if [ "$CSS_COUNT" -gt 0 ]; then
  echo -e "      ${GREEN}✅ Found $CSS_COUNT CSS file(s)${NC}"
  find dist/assets -name "*.css" -type f -exec basename {} \; | while read -r file; do
    size=$(du -h "dist/assets/$file" | cut -f1)
    echo "         - $file ($size)"
  done
else
  echo -e "      ${RED}❌ No CSS files found${NC}"
  exit 1
fi
echo ""

# Check 3: CSS contains Tailwind
echo -e "${BLUE}[3/6]${NC} Verifying CSS contains Tailwind..."
MAIN_CSS=$(find dist/assets -name "index-*.css" -type f | head -n 1)
if grep -q "tw-" "$MAIN_CSS" 2>/dev/null; then
  echo -e "      ${GREEN}✅ CSS contains Tailwind utility classes${NC}"
else
  echo -e "      ${RED}❌ CSS does not contain Tailwind classes${NC}"
  echo "      First 20 lines of CSS:"
  head -20 "$MAIN_CSS"
  exit 1
fi
echo ""

# Check 4: HTML references CSS
echo -e "${BLUE}[4/6]${NC} Checking HTML references CSS..."
if grep -q "\.css" dist/index.html; then
  CSS_REF=$(grep -o 'href="/assets/[^"]*\.css"' dist/index.html | sed 's/href="//;s/"$//')
  echo -e "      ${GREEN}✅ HTML references CSS${NC}"
  echo "         $CSS_REF"
else
  echo -e "      ${RED}❌ HTML does not reference CSS${NC}"
  exit 1
fi
echo ""

# Check 5: Server can start
echo -e "${BLUE}[5/6]${NC} Testing server startup..."
timeout 5 node server/index.cjs > /tmp/server-test.log 2>&1 &
SERVER_PID=$!
sleep 2

if ps -p $SERVER_PID > /dev/null; then
  echo -e "      ${GREEN}✅ Server started successfully${NC}"
  if grep -q "CSS verification passed" /tmp/server-test.log; then
    echo "         Server verified CSS files"
  fi
  kill $SERVER_PID 2>/dev/null || true
else
  echo -e "      ${RED}❌ Server failed to start${NC}"
  echo "Server output:"
  cat /tmp/server-test.log
  exit 1
fi
echo ""

# Check 6: CSS accessible via HTTP
echo -e "${BLUE}[6/6]${NC} Testing CSS accessibility..."
timeout 10 node server/index.cjs > /dev/null 2>&1 &
SERVER_PID=$!
sleep 3

CSS_FILE=$(basename $(find dist/assets -name "index-*.css" -type f | head -n 1))
HTTP_STATUS=$(curl -o /dev/null -s -w "%{http_code}" "http://localhost:8080/assets/$CSS_FILE" 2>/dev/null || echo "000")

kill $SERVER_PID 2>/dev/null || true
wait $SERVER_PID 2>/dev/null || true

if [ "$HTTP_STATUS" = "200" ]; then
  echo -e "      ${GREEN}✅ CSS accessible via HTTP${NC}"
  echo "         http://localhost:8080/assets/$CSS_FILE → $HTTP_STATUS"
else
  echo -e "      ${RED}❌ CSS not accessible (HTTP $HTTP_STATUS)${NC}"
  exit 1
fi
echo ""

# Summary
echo "========================================"
echo -e "${GREEN}✅ All checks passed!${NC}"
echo "========================================"
echo ""
echo "Your build is ready for deployment:"
echo "  • CSS files are generated"
echo "  • Tailwind styles are present"
echo "  • HTML references CSS correctly"
echo "  • Server can start and serve CSS"
echo ""
echo "Next steps:"
echo "  1. Commit your changes: git add . && git commit -m \"...\""
echo "  2. Push to GitHub: git push"
echo "  3. Deploy: gcloud builds submit --config cloudbuild.yaml \\"
echo "             --substitutions SHORT_SHA=\$(git rev-parse --short HEAD)"
echo ""
echo "Or let CI/CD handle it automatically via GitHub Actions."
echo ""
