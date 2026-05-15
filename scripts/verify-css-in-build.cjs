#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const distDir = path.resolve(process.cwd(), 'dist');
const assetsDir = path.join(distDir, 'assets');

function fail(messageLines) {
  for (const line of messageLines) console.error(line);
  process.exit(1);
}

function walkFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(fullPath));
    else if (entry.isFile()) out.push(fullPath);
  }
  return out;
}

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = -1;
  do {
    size /= 1024;
    unitIndex += 1;
  } while (size >= 1024 && unitIndex < units.length - 1);
  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 1 : 2).replace(/\.0$/, '')} ${units[unitIndex]}`;
}

function relativeAssetPathFromHref(href) {
  return href.trim().replace(/^\.\//, '').replace(/^\//, '');
}

console.log('🔍 Verifying CSS in build output...');
console.log('');

if (!fs.existsSync(distDir) || !fs.statSync(distDir).isDirectory()) {
  fail([
    '❌ ERROR: dist directory not found!',
    "   Run 'npm run build' first"
  ]);
}

if (!fs.existsSync(assetsDir) || !fs.statSync(assetsDir).isDirectory()) {
  fail(['❌ ERROR: dist/assets directory not found!']);
}

const assetFiles = walkFiles(assetsDir);
const cssFiles = assetFiles.filter((file) => file.endsWith('.css'));

if (cssFiles.length === 0) {
  fail([
    '❌ ERROR: No CSS files found in dist/assets/',
    '',
    'This indicates Tailwind CSS was not compiled.',
    'Check:',
    '  1. postcss.config.js has @tailwindcss/postcss plugin',
    '  2. tailwind.config.js content paths include all component files',
    '  3. src/index.css imports Tailwind directives'
  ]);
}

console.log(`✅ Found ${cssFiles.length} CSS file(s):`);
for (const file of cssFiles) {
  const stat = fs.statSync(file);
  console.log(`   - ${path.basename(file)} (${humanSize(stat.size)})`);
}
console.log('');

const indexHtmlPath = path.join(distDir, 'index.html');
if (!fs.existsSync(indexHtmlPath) || !fs.statSync(indexHtmlPath).isFile()) {
  fail(['❌ ERROR: dist/index.html not found!']);
}

const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
const cssRefs = [...indexHtml.matchAll(/href=["']([^"']+\.css)["']/gi)].map((match) => match[1]);

if (cssRefs.length === 0) {
  fail([
    '❌ ERROR: No CSS references found in index.html',
    '',
    'The CSS file was generated but not linked in the HTML.',
    'This is a Vite configuration issue.'
  ]);
}

console.log(`✅ Found ${cssRefs.length} CSS reference(s) in index.html`);
console.log('');
console.log('📄 CSS files referenced in index.html:');

for (const ref of cssRefs) {
  const relativeRef = relativeAssetPathFromHref(ref);
  const fullPath = path.join(distDir, relativeRef);
  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
    console.log(`   ✅ ${ref} (exists)`);
  } else {
    fail([`   ❌ ${ref} (MISSING!)`]);
  }
}

console.log('');

const mainCss = cssFiles.find((file) => path.basename(file).startsWith('index-')) ?? cssFiles[0];
if (mainCss && fs.existsSync(mainCss)) {
  const cssContent = fs.readFileSync(mainCss, 'utf8');
  if (cssContent.includes('@tailwind')) {
    console.log('❌ WARNING: CSS file contains unprocessed @tailwind directives!');
    console.log('   PostCSS/Tailwind may not be running correctly');
  } else if (cssContent.includes('tw-')) {
    console.log('✅ CSS contains Tailwind utility classes (tw-* variables found)');
  } else {
    console.log("⚠️  WARNING: CSS file doesn't appear to contain Tailwind classes");
    console.log('   Check if Tailwind content paths match your component files');
  }
}

console.log('');
console.log('✅ Build verification complete!');
console.log('');

const jsFiles = assetFiles.filter((file) => file.endsWith('.js'));
const indexHtmlSize = humanSize(fs.statSync(indexHtmlPath).size);

console.log('📦 Build artifacts summary:');
console.log(`   dist/index.html: ${indexHtmlSize}`);
console.log(`   dist/assets/*.js: ${jsFiles.length} file(s)`);
console.log(`   dist/assets/*.css: ${cssFiles.length} file(s)`);
console.log('');
console.log('🚀 Ready for deployment!');
