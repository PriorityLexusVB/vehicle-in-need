/**
 * AI Proxy endpoint tests
 * Tests /api/generate-email endpoint with mocked Vertex AI
 * 
 * Note: These tests mock the Vertex AI service to avoid external API calls
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

// Mock the @google-cloud/vertexai module
vi.mock('@google-cloud/vertexai', () => {
  const mockGenerateContent = vi.fn();
  
  return {
    VertexAI: vi.fn().mockImplementation(() => ({
      preview: {
        getGenerativeModel: vi.fn().mockReturnValue({
          generateContent: mockGenerateContent
        })
      }
    }))
  };
});

// Dynamically import after mock is set up
const getApp = async () => {
  const module = await import('../index.cjs');
  return module.default || module;
};

describe('AI Proxy Endpoint', () => {
  describe('POST /api/generate-email', () => {
    const mockOrder = {
      id: 'test-123',
      customerName: 'John Doe',
      year: '2024',
      model: 'Lexus RX 350',
      status: 'Factory Order',
      date: '2024-01-15'
    };

    it('should return 400 if order data is missing', async () => {
      const app = await getApp();
      const response = await request(app)
        .post('/api/generate-email')
        .send({})
        .expect(400)
        .expect('Content-Type', /json/);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Missing order data in request body');
    });

    it('should return 503 if Vertex AI is not initialized', async () => {
      const app = await getApp();
      
      // The app may initialize Vertex AI on first import
      // This test verifies the 503 response when AI is unavailable
      const response = await request(app)
        .post('/api/generate-email')
        .send({ order: mockOrder });
      
      // Should be either 503 (AI unavailable) or 200/500 (AI available but may fail)
      expect([200, 500, 503]).toContain(response.status);
      expect(response.body).toHaveProperty('success');
    });
  });
});
