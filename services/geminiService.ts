import { Order } from "../types";

/**
 * Generate a follow-up email by calling the server-side API endpoint
 * This removes the need for client-side API keys and uses server-side Vertex AI
 */
export const generateFollowUpEmail = async (order: Order): Promise<string> => {
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

  } catch (error: any) {
    console.error("Error calling email generation API:", error);
    
    if (error.name === 'AbortError') {
      throw new Error("Request timed out. Please try again.");
    }
    
    if (error.message) {
      throw error;
    }
    
    throw new Error("Failed to generate email. Please check your connection and try again.");
  }
};