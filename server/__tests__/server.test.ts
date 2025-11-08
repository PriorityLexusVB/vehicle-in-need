/**
 * Server endpoint tests
 * Tests health, status, and API endpoints
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';

// Dynamically import the CommonJS module
const getApp = async () => {
  const module = await import('../index.cjs');
  return module.default || module;
};

describe('Server Endpoints', () => {
  describe('GET /health', () => {
    it('should return healthy status', async () => {
      const app = await getApp();
      const response = await request(app)
        .get('/health')
        .expect(200);
      
      expect(response.text).toBe('healthy\n');
    });
  });

  describe('GET /api/status', () => {
    it('should return status information', async () => {
      const app = await getApp();
      const response = await request(app)
        .get('/api/status')
        .expect(200)
        .expect('Content-Type', /json/);
      
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('geminiEnabled', true);
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('buildTime');
      expect(response.body).toHaveProperty('nodeVersion');
      expect(response.body).toHaveProperty('environment');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
    });

    it('should have valid timestamp format', async () => {
      const app = await getApp();
      const response = await request(app)
        .get('/api/status')
        .expect(200);
      
      const timestamp = new Date(response.body.timestamp);
      expect(timestamp.toString()).not.toBe('Invalid Date');
    });

    it('should have positive uptime', async () => {
      const app = await getApp();
      const response = await request(app)
        .get('/api/status')
        .expect(200);
      
      expect(response.body.uptime).toBeGreaterThan(0);
    });
  });
});
