#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const INCLUDED_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".html",
  ".md",
  ".yaml",
  ".yml",
]);

const SKIP_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".firebase",
  ".cache",
]);

function hasConflictMarkers(content) {
  // Match the same patterns as the previous grep:
  //   ^<<<<<<<  OR ^=======$ OR ^>>>>>>>
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    if (line.startsWith("<<<<<<< ")) return true;
    if (line === "=======") return true;
    if (line.startsWith(">>>>>>> ")) return true;
  }
  return false;
}

function walkDir(dirPath, results) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIR_NAMES.has(entry.name)) continue;
      walkDir(path.join(dirPath, entry.name), results);
      continue;
    }

    if (!entry.isFile()) continue;

    const fullPath = path.join(dirPath, entry.name);
    const ext = path.extname(entry.name).toLowerCase();
    if (!INCLUDED_EXTENSIONS.has(ext)) continue;

    let content;
    try {
      content = fs.readFileSync(fullPath, "utf8");
    } catch {
      // If a file can't be read, skip it rather than failing the build.
      continue;
    }

    if (hasConflictMarkers(content)) {
      results.push(path.relative(process.cwd(), fullPath));
    }
  }
}

try {
  const matches = [];
  walkDir(process.cwd(), matches);

  if (matches.length > 0) {
    console.error("❌ ERROR: Git merge conflict markers found in:");
    for (const file of matches) console.error(file);
    process.exit(1);
  }

  console.log("✓ No conflict markers detected");
} catch (error) {
  console.error(
    "Error running conflict marker check:",
    error?.message || error
  );
  process.exit(1);
}
