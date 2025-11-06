/**
 * Express server for Vehicle Order Tracker
 * Serves static files and provides API endpoints for AI-powered email generation
 */

const express = require('express');
const path = require('path');
const cors = require('cors');
const aiProxyRouter = require('./aiProxy');

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

// API status endpoint - returns whether Gemini is enabled
app.get('/api/status', (req, res) => {
  res.json({
    geminiEnabled: true, // Always return true since we're using Vertex AI
    version: process.env.APP_VERSION || 'unknown',
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
    // No-cache for index.html to ensure users get latest version
    if (filepath.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    // Long-term cache for hashed assets
    else if (filepath.includes('/assets/') && /\.[a-f0-9]{8}\.(js|css)/.test(filepath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
    // Short cache for service worker and manifest
    else if (filepath.match(/\/(sw\.js|workbox-.+\.js|manifest\.webmanifest)$/)) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    }
  }
}));

// SPA fallback - serve index.html for all other routes
app.get('*', (req, res) => {
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
  console.log(`
╔════════════════════════════════════════════════════╗
║  Vehicle Order Tracker Server                      ║
║  Running on: http://0.0.0.0:${PORT}                    ║
║  Environment: ${process.env.NODE_ENV || 'production'}                        ║
╚════════════════════════════════════════════════════╝
  `);
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
