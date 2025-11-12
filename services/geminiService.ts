import { Order } from "../types";

// The application uses server-side Vertex AI with Application Default Credentials
// No client-side API key is used or exposed
export const isGeminiEnabled = true; // Server-side AI proxy is always available

console.log("Using server-side Vertex AI proxy for AI features.");

/**
 * Generate a follow-up email using server-side Vertex AI proxy
 * This ensures the API key is never exposed to the client
 */
export const generateFollowUpEmail = async (order: Order): Promise<string> => {
  return generateEmailServerSide(order);
};

/**
 * Generate email by calling the server-side API endpoint
 * This uses server-side Vertex AI with Application Default Credentials
 */
async function generateEmailServerSide(order: Order): Promise<string> {
  try {
    // Call server-side endpoint with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    const response = await fetch('/api/generate-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ order }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error("Server error generating email:", errorData);
      
      if (response.status === 503) {
        throw new Error("AI service is temporarily unavailable. Please try again later.");
      }
      
      throw new Error(errorData.error || "Failed to generate email content.");
    }

    const data = await response.json();
    
    if (!data.success || !data.email) {
      throw new Error("Invalid response from server");
    }

    return data.email;

  } catch (error: unknown) {
    console.error("Error calling email generation API:", error);
    
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error("Request timed out. Please try again.");
    }
    
    if (error instanceof Error && error.message) {
      throw error;
    }
    
    throw new Error("Failed to generate email. Please check your connection and try again.");
  }
}