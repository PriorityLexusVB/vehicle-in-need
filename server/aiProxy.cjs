/**
 * Express router for AI-powered email generation using Vertex AI
 * Handles POST /api/generate-email endpoint
 */

const express = require('express');
const { VertexAI } = require('@google-cloud/vertexai');
const { buildEmailPrompt } = require('./promptBuilder.cjs');

const router = express.Router();

// Initialize Vertex AI client
// This will use Application Default Credentials (ADC) automatically
const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT || 'auto-detect';
const location = process.env.VERTEX_AI_LOCATION || 'us-central1';

let vertexAI;
let generativeModel;

try {
  vertexAI = new VertexAI({ project: projectId, location: location });
  generativeModel = vertexAI.preview.getGenerativeModel({
    model: 'gemini-2.0-flash-exp',
  });
  console.log(`[AI Proxy] Vertex AI initialized for project: ${projectId}, location: ${location}`);
} catch (error) {
  console.error('[AI Proxy] Failed to initialize Vertex AI:', error.message);
  generativeModel = null;
}

/**
 * POST /api/generate-email
 * Generate a follow-up email for a customer order
 * 
 * Request body:
 * {
 *   order: Order object with all required fields
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   email: "Generated email content..."
 * }
 * or
 * {
 *   success: false,
 *   error: "Error message"
 * }
 */
router.post('/generate-email', async (req, res) => {
  try {
    const { order } = req.body;

    if (!order) {
      return res.status(400).json({
        success: false,
        error: 'Missing order data in request body'
      });
    }

    // Check if Vertex AI is available
    if (!generativeModel) {
      console.error('[AI Proxy] Vertex AI not initialized');
      return res.status(503).json({
        success: false,
        error: 'AI service temporarily unavailable. Please try again later.'
      });
    }

    // Build the prompt from order details
    const prompt = buildEmailPrompt(order);

    console.log(`[AI Proxy] Generating email for order ${order.id} (${order.customerName})`);

    // Call Vertex AI Gemini model
    const result = await generativeModel.generateContent(prompt);
    const response = result.response;
    const emailContent = response.candidates[0].content.parts[0].text.trim();

    console.log(`[AI Proxy] Successfully generated email for order ${order.id}`);

    return res.json({
      success: true,
      email: emailContent
    });

  } catch (error) {
    console.error('[AI Proxy] Error generating email:', error);

    // Check if it's a permission/auth error
    if (error.message && (error.message.includes('permission') || error.message.includes('authentication'))) {
      return res.status(503).json({
        success: false,
        error: 'AI service authentication failed. Please contact administrator.'
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Failed to generate email. Please try again later.'
    });
  }
});

module.exports = router;
