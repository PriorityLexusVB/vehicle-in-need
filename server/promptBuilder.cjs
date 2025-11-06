/**
 * Builds email prompts for the Gemini AI model based on order details
 * Replicated from the original geminiService.ts logic
 */

const OrderStatus = {
  FactoryOrder: 'Factory Order',
  Locate: 'Locate',
  DealerExchange: 'Dealer Exchange',
  Received: 'Received',
  Delivered: 'Delivered',
};

/**
 * Build the email prompt for a given order
 * @param {Object} order - Order object with all details
 * @returns {string} The complete prompt for the AI model
 */
function buildEmailPrompt(order) {
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

module.exports = { buildEmailPrompt };
