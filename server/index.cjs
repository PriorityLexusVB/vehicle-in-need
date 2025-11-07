/**
 * Express server for Vehicle Order Tracker
 * Serves static files and provides API endpoints for AI-powered email generation
 */

const express = require('express');
const path = require('path');
const cors = require('cors');
const aiProxyRouter = require('./aiProxy.cjs');

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('healthy\n');
});

// API status endpoint - returns version and metadata
app.get('/api/status', (req, res) => {
  const version = process.env.APP_VERSION || 'unknown';
  res.json({
    geminiEnabled: true, // Always return true since we're using Vertex AI
    version: version,
    appVersion: version,
    commitSha: version,
    buildTime: process.env.BUILD_TIME || 'unknown',
    kRevision: process.env.K_REVISION || undefined,
    timestamp: new Date().toISOString()
  });
});

// Mount AI proxy routes
app.use('/api', aiProxyRouter);

// Serve static files from dist directory
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath, {
  maxAge: '1h',
  setHeaders: (res, filepath) => {
    // Ensure correct MIME type for JavaScript modules
    if (filepath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
    // No-cache for index.html to ensure users get latest version
    if (filepath.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    // Long-term cache for hashed assets (JS, CSS, and fonts under /assets/ with hash patterns)
    // Vite generates filenames like: index-CwY8jhIn.css, workbox-window.prod.es5-CwtvwXb3.js
    else if (filepath.includes('/assets/') && /[\w.-]+-[A-Za-z0-9_-]{6,}\.(js|css|woff2?|ttf|eot|otf)$/.test(filepath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
    // Short cache for service worker and manifest
    else if (filepath.match(/\/(sw\.js|workbox-.+\.js|manifest\.webmanifest)$/)) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    }
  }
}));

// SPA fallback - serve index.html for all other routes (except assets)
app.get('*', (req, res) => {
  // Don't serve index.html for asset requests - let them 404
  if (req.path.startsWith('/assets/') || 
      req.path.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|json|webmanifest)$/)) {
    return res.status(404).send('Not found');
  }
  res.sendFile(path.join(distPath, 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  const version = process.env.APP_VERSION || 'unknown';
  const buildTime = process.env.BUILD_TIME || 'unknown';
  const kRevision = process.env.K_REVISION || 'N/A';
  
  console.log(`
╔════════════════════════════════════════════════════╗
║  Vehicle Order Tracker Server                      ║
║  Running on: http://0.0.0.0:${PORT}                    ║
║  Environment: ${process.env.NODE_ENV || 'production'}                        ║
║  Version: ${version}                           ║
║  Commit SHA: ${version}                        ║
║  Build Time: ${buildTime}                        ║
║  K_REVISION: ${kRevision}                            ║
╚════════════════════════════════════════════════════╝
  `);
  console.log(`[Server] App Version: ${version}`);
  console.log(`[Server] Build Time: ${buildTime}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});
