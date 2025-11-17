/**
 * Express server for Vehicle Order Tracker
 * Serves static files and provides API endpoints for AI-powered email generation
 */

const express = require("express");
const path = require("path");
const fs = require("fs");
const cors = require("cors");
const aiProxyRouter = require("./aiProxy.cjs");

const app = express();
const PORT = process.env.PORT || 8080;

// CRITICAL: Verify CSS files exist at startup (fail fast if missing)
function verifyCSSFilesExist() {
  const distPath = path.join(__dirname, "..", "dist");
  const assetsPath = path.join(distPath, "assets");
  
  console.log("🔍 Verifying CSS files at startup...");
  console.log(`   dist path: ${distPath}`);
  console.log(`   assets path: ${assetsPath}`);
  
  // Check if dist directory exists
  if (!fs.existsSync(distPath)) {
    console.error("❌ FATAL: dist/ directory not found!");
    console.error("   Expected at:", distPath);
    process.exit(1);
  }
  
  // Check if assets directory exists
  if (!fs.existsSync(assetsPath)) {
    console.error("❌ FATAL: dist/assets/ directory not found!");
    console.error("   Expected at:", assetsPath);
    console.error("   dist/ contents:", fs.readdirSync(distPath));
    process.exit(1);
  }
  
  // Check for CSS files
  const files = fs.readdirSync(assetsPath);
  const cssFiles = files.filter(f => f.endsWith('.css'));
  
  if (cssFiles.length === 0) {
    console.error("❌ FATAL: No CSS files found in dist/assets/!");
    console.error("   assets/ contents:", files);
    console.error("");
    console.error("This indicates the Docker image was built without CSS files.");
    console.error("Check the Dockerfile build process and ensure:");
    console.error("  1. npm run build completes successfully");
    console.error("  2. Tailwind CSS is configured correctly");
    console.error("  3. dist/assets/ is copied from builder stage");
    process.exit(1);
  }
  
  console.log(`✅ CSS verification passed: ${cssFiles.length} CSS file(s) found`);
  cssFiles.forEach(file => {
    const filePath = path.join(assetsPath, file);
    const stats = fs.statSync(filePath);
    console.log(`   - ${file} (${stats.size} bytes)`);
  });
  console.log("");
}

// Run CSS verification before starting server
verifyCSSFilesExist();

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).send("healthy\n");
});

// API status endpoint - returns service status and version info
app.get("/api/status", (req, res) => {
  res.json({
    status: "healthy",
    geminiEnabled: true, // Always return true since we're using Vertex AI
    version: process.env.APP_VERSION || "unknown",
    buildTime: process.env.BUILD_TIME || "unknown",
    nodeVersion: process.version,
    environment: process.env.NODE_ENV || "production",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Mount AI proxy routes
app.use("/api", aiProxyRouter);

// Serve static files from dist directory
const distPath = path.join(__dirname, "..", "dist");
app.use(
  express.static(distPath, {
    maxAge: "1h",
    setHeaders: (res, filepath) => {
      // No-cache for index.html to ensure users get latest version
      if (filepath.endsWith("index.html")) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
      }
      // Long-term cache for hashed assets (Vite uses base64-like hashes with underscores/dashes)
      else if (
        filepath.includes("/assets/") &&
        /\-[a-zA-Z0-9_-]{8,}\.(js|css)$/.test(filepath)
      ) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
      // Short cache for service worker and manifest
      else if (
        filepath.match(/\/(sw\.js|workbox-.+\.js|manifest\.webmanifest)$/)
      ) {
        res.setHeader("Cache-Control", "no-cache, must-revalidate");
      }
    },
  })
);

// SPA fallback - serve index.html for all other routes
app.get("*", (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("[Server Error]", err);
  res.status(500).json({
    success: false,
    error: "Internal server error",
  });
});

// Start server unless in test mode (so supertest can import without listening)
const disableListen =
  process.env.VITEST === "true" || process.env.DISABLE_SERVER_LISTEN === "true";
let serverInstance;
if (!disableListen) {
  serverInstance = app.listen(PORT, "0.0.0.0", () => {
    console.log(`
╔════════════════════════════════════════════════════╗
║  Vehicle Order Tracker Server                      ║
║  Running on: http://0.0.0.0:${PORT}                    ║
║  Environment: ${process.env.NODE_ENV || "production"}                        ║
╚════════════════════════════════════════════════════╝
    `);
  });
}

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully...");
  if (serverInstance) serverInstance.close(() => process.exit(0));
  else process.exit(0);
});

process.on("SIGINT", () => {
  console.log("SIGINT received, shutting down gracefully...");
  if (serverInstance) serverInstance.close(() => process.exit(0));
  else process.exit(0);
});

module.exports = app;
