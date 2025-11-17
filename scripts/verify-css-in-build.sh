#!/bin/bash
# Verify that CSS file is generated and properly linked in the build
# This script should be run after `npm run build` to validate the output

set -e

DIST_DIR="dist"
ASSETS_DIR="$DIST_DIR/assets"

echo "🔍 Verifying CSS in build output..."
echo ""

# Check if dist directory exists
if [ ! -d "$DIST_DIR" ]; then
    echo "❌ ERROR: dist directory not found!"
    echo "   Run 'npm run build' first"
    exit 1
fi

# Check if assets directory exists
if [ ! -d "$ASSETS_DIR" ]; then
    echo "❌ ERROR: dist/assets directory not found!"
    exit 1
fi

# Find CSS files
CSS_FILES=$(find "$ASSETS_DIR" -name "*.css" -type f)
CSS_COUNT=$(echo "$CSS_FILES" | grep -c "\.css$" || true)

if [ "$CSS_COUNT" -eq 0 ]; then
    echo "❌ ERROR: No CSS files found in dist/assets/"
    echo ""
    echo "This indicates Tailwind CSS was not compiled."
    echo "Check:"
    echo "  1. postcss.config.js has @tailwindcss/postcss plugin"
    echo "  2. tailwind.config.js content paths include all component files"
    echo "  3. src/index.css imports Tailwind directives"
    exit 1
fi

echo "✅ Found $CSS_COUNT CSS file(s):"
for file in $CSS_FILES; do
    size=$(du -h "$file" | cut -f1)
    echo "   - $(basename "$file") ($size)"
done
echo ""

# Check if index.html exists
if [ ! -f "$DIST_DIR/index.html" ]; then
    echo "❌ ERROR: dist/index.html not found!"
    exit 1
fi

# Check if index.html references CSS files
CSS_REFS=$(grep -c "\.css" "$DIST_DIR/index.html" || true)
if [ "$CSS_REFS" -eq 0 ]; then
    echo "❌ ERROR: No CSS references found in index.html"
    echo ""
    echo "The CSS file was generated but not linked in the HTML."
    echo "This is a Vite configuration issue."
    exit 1
fi

echo "✅ Found $CSS_REFS CSS reference(s) in index.html"
echo ""

# Extract the CSS filenames from index.html
echo "📄 CSS files referenced in index.html:"
grep -o 'href="/assets/[^"]*\.css"' "$DIST_DIR/index.html" | sed 's/href="//;s/"$//' | while read -r ref; do
    filename=$(basename "$ref")
    if [ -f "$DIST_DIR/assets/$filename" ]; then
        echo "   ✅ $ref (exists)"
    else
        echo "   ❌ $ref (MISSING!)"
        exit 1
    fi
done
echo ""

# Check CSS content for Tailwind
MAIN_CSS=$(find "$ASSETS_DIR" -name "index-*.css" -type f | head -n 1)
if [ -n "$MAIN_CSS" ]; then
    if grep -q "@tailwind" "$MAIN_CSS" 2>/dev/null; then
        echo "❌ WARNING: CSS file contains unprocessed @tailwind directives!"
        echo "   PostCSS/Tailwind may not be running correctly"
    elif grep -q "tw-" "$MAIN_CSS" 2>/dev/null; then
        echo "✅ CSS contains Tailwind utility classes (tw-* variables found)"
    else
        echo "⚠️  WARNING: CSS file doesn't appear to contain Tailwind classes"
        echo "   Check if Tailwind content paths match your component files"
    fi
fi

echo ""
echo "✅ Build verification complete!"
echo ""
echo "📦 Build artifacts summary:"
echo "   dist/index.html: $(du -h "$DIST_DIR/index.html" | cut -f1)"
echo "   dist/assets/*.js: $(find "$ASSETS_DIR" -name "*.js" -type f | wc -l) file(s)"
echo "   dist/assets/*.css: $CSS_COUNT file(s)"
echo ""
echo "🚀 Ready for deployment!"
