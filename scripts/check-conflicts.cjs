#!/usr/bin/env node
const { execSync } = require('child_process');

try {
  const result = execSync(
    'find . -name node_modules -prune -o -type f \\( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.html" -o -name "*.md" -o -name "*.yaml" -o -name "*.yml" \\) -print0 | xargs -0 grep -l "^<<<<<<< \\|^=======$\\|^>>>>>>> " 2>/dev/null || true',
    { encoding: 'utf8' }
  );
  
  if (result.trim()) {
    console.error('❌ ERROR: Git merge conflict markers found in:');
    console.error(result);
    process.exit(1);
  }
  
  console.log('✓ No conflict markers detected');
} catch (error) {
  console.error('Error running conflict marker check:', error.message);
  process.exit(1);
}
