import { Order, OrderStatus } from "../types";

// Read from Vite env (import.meta.env.VITE_*)
const CLIENT_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

// Check if client-side Gemini is available
const hasClientKey = !!CLIENT_API_KEY;

// Export flag to indicate if any AI features are available (client or server)
// In production, server-side is preferred; client-side key is for development/fallback
export const isGeminiEnabled = true; // Always true since we support both methods

if (hasClientKey) {
  console.log("Gemini client-side API key detected. Using direct API calls.");
} else {
  console.log("No client-side API key. Will use server-side Vertex AI proxy.");
}

/**
 * Generate a follow-up email using either:
 * 1. Client-side Gemini API (if VITE_GEMINI_API_KEY is set)
 * 2. Server-side Vertex AI proxy (fallback/preferred for production)
 */
export const generateFollowUpEmail = async (order: Order): Promise<string> => {
  // If client-side API key is available, use it directly
  if (hasClientKey) {
    return generateEmailClientSide(order);
  }
  
  // Otherwise, use server-side proxy
  return generateEmailServerSide(order);
};

/**
 * Generate email using client-side Gemini API
 * Uses dynamic import to avoid bundling @google/genai when not needed
 */
async function generateEmailClientSide(order: Order): Promise<string> {
  const prompt = buildEmailPrompt(order);

  try {
    // Dynamic import to enable tree-shaking when not using client-side mode
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: CLIENT_API_KEY! });
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: prompt,
    });
    
    return response.text.trim();
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    throw new Error("Failed to generate email content using Gemini API.");
  }
}

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
}

/**
 * Build the email prompt based on order details
 */
function buildEmailPrompt(order: Order): string {
  const extOptions = [order.extOption1, order.extOption2].filter(Boolean).join(', ');
  const intOptions = [order.intOption1, order.intOption2].filter(Boolean).join(', ');

  const vehicleDetails = [
    `- Vehicle: ${order.year} ${order.model}`,
    order.modelNumber ? `- Model Number: ${order.modelNumber}` : '',
    `- Exterior Color #: ${order.color}`,
    order.interiorColor ? `- Interior Color #: ${order.interiorColor}` : '',
    extOptions ? `- Exterior Option #'s: ${extOptions}` : '',
    intOptions ? `- Interior Option #'s: ${intOptions}` : '',
  ].filter(Boolean).join('\n    ');

  const financialDetails = [
    typeof order.depositAmount === 'number' ? `- Deposit Amount: $${order.depositAmount.toFixed(2)}` : '',
    typeof order.sellingPrice === 'number' ? `- Selling Price: $${order.sellingPrice.toFixed(2)}` : '',
    typeof order.msrp === 'number' ? `- MSRP: $${order.msrp.toFixed(2)}` : ''
  ].filter(Boolean).join('\n    ');

  let statusInstructions = '';
  let acknowledgement = "Acknowledge that their deposit has been received.";
  let reassurance = "Reassure them that you will keep them updated on the progress.";
  let coreInstruction = "Your task is to write a friendly and professional follow-up email to a customer about their recent pre-order.";

  switch (order.status) {
    case OrderStatus.FactoryOrder:
      statusInstructions = `Briefly explain what the current status ('${order.status}') means for them (e.g., for 'Factory Order', mention that the order has been placed with the manufacturer).`;
      break;
    case OrderStatus.Locate:
    case OrderStatus.DealerExchange:
      statusInstructions = `Briefly explain what the current status ('${order.status}') means for them (e.g., for 'Locate' or 'Dealer Exchange', mention that you are actively searching for their vehicle).`;
      break;
    case OrderStatus.Received:
      acknowledgement = "Focus on the exciting news of the vehicle's arrival instead of the deposit.";
      statusInstructions = `Announce the exciting news that their vehicle has arrived at the dealership! Instruct them to contact you to schedule a convenient time for pickup and final paperwork.`;
      reassurance = ''; // No need for this reassurance when the car has arrived.
      break;
    case OrderStatus.Delivered:
      coreInstruction = "Your task is to write a friendly and professional 'Thank You' email to a customer who has just taken delivery of their new vehicle."
      acknowledgement = '';
      statusInstructions = `1. Thank the customer for their business.
      2. Express hope that they are enjoying their new ${order.model}.
      3. Politely mention that great reviews are important to you and that you'd appreciate it if they shared their positive experience.
      4. Offer future assistance with any questions they may have about their new vehicle.`;
      reassurance = '';
      break;
    default:
      statusInstructions = `Reassure them that you will keep them updated on the progress.`;
  }

  const prompt = `
    You are an assistant for a car salesperson. ${coreInstruction}

    Use the following details to draft the email:
    - Salesperson Name: ${order.salesperson}
    - Customer Name: ${order.customerName}
    ${vehicleDetails}
    - Order Status: ${order.status}
    ${financialDetails}

    The email should:
    1.  Start with a friendly greeting to the customer.
    2.  ${order.status !== OrderStatus.Delivered ? 'Confirm the details of their vehicle order.' : ''}
    3.  ${acknowledgement}
    4.  ${statusInstructions}
    5.  ${reassurance}
    6.  End with a professional closing from the salesperson.

    Do not include a subject line. The output should be only the body of the email.
  `;

  return prompt;
}