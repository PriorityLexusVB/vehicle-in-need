/**
 * Allocation Email Watcher — Google Apps Script
 *
 * Monitors Gmail for Toyota/Lexus allocation emails with PDF attachments,
 * extracts the text, and sends it to the Cloud Function for parsing and
 * publishing to the allocation board.
 *
 * SETUP:
 * 1. Go to https://script.google.com and create a new project
 * 2. Paste this entire file into Code.gs
 * 3. Set the script properties (Project Settings → Script Properties):
 *    - CLOUD_FUNCTION_URL: The deployed Cloud Function URL
 *    - ALLOCATION_API_KEY: The shared secret for authentication
 * 4. Run setupTrigger() once to create the automatic check
 * 5. Authorize when prompted (Gmail access required)
 *
 * The script checks every 5 minutes for new allocation emails.
 * It processes only unread emails and marks them as read after processing.
 */

// ─── Configuration ──────────────────────────────────────────────────────────

/**
 * Get config from Script Properties (secure, not hardcoded)
 */
function getConfig() {
  const props = PropertiesService.getScriptProperties();
  return {
    cloudFunctionUrl: props.getProperty('CLOUD_FUNCTION_URL') || '',
    apiKey: props.getProperty('ALLOCATION_API_KEY') || '',
    // Label to mark processed emails (auto-created if missing)
    processedLabel: 'Allocation/Processed',
    // Gmail search query — catches Toyota/Lexus DSM allocation emails
    searchQuery: 'subject:(Allocation) from:(@toyota.com OR @lexus.com) has:attachment filename:pdf is:unread',
  };
}

// ─── Main Functions ─────────────────────────────────────────────────────────

/**
 * Main function — run by the time-based trigger every 5 minutes.
 * Searches for new allocation emails, extracts PDFs, and sends to Cloud Function.
 */
function checkForAllocationEmails() {
  const config = getConfig();

  if (!config.cloudFunctionUrl || !config.apiKey) {
    Logger.log('ERROR: Missing CLOUD_FUNCTION_URL or ALLOCATION_API_KEY in Script Properties');
    return;
  }

  // Search for unread allocation emails
  var threads = GmailApp.search(config.searchQuery, 0, 5);

  if (threads.length === 0) {
    Logger.log('No new allocation emails found.');
    return;
  }

  Logger.log('Found ' + threads.length + ' allocation email(s) to process.');

  // Get or create the "processed" label
  var label = getOrCreateLabel(config.processedLabel);

  for (var i = 0; i < threads.length; i++) {
    var thread = threads[i];
    var messages = thread.getMessages();

    for (var j = 0; j < messages.length; j++) {
      var message = messages[j];

      // Skip already-read messages
      if (!message.isUnread()) continue;

      var result = processAllocationMessage(message, config);

      if (result.success) {
        Logger.log('SUCCESS: Processed allocation from ' + message.getFrom() +
          ' — ' + result.vehicleCount + ' vehicles, snapshot: ' + result.snapshotId);
        // Mark as read and label
        message.markRead();
        thread.addLabel(label);
      } else {
        Logger.log('FAILED: ' + result.error + ' — from: ' + message.getFrom() +
          ' subject: ' + message.getSubject());
      }
    }
  }
}

/**
 * Process a single allocation email message.
 * Extracts PDF attachment text and sends to Cloud Function.
 */
function processAllocationMessage(message, config) {
  var attachments = message.getAttachments();
  var pdfAttachment = null;

  // Find the allocation PDF attachment
  for (var i = 0; i < attachments.length; i++) {
    var attachment = attachments[i];
    var name = attachment.getName().toLowerCase();
    if (name.endsWith('.pdf') && name.indexOf('allocation') >= 0) {
      pdfAttachment = attachment;
      break;
    }
  }

  // Fallback: any PDF if no "allocation" in name
  if (!pdfAttachment) {
    for (var i = 0; i < attachments.length; i++) {
      if (attachments[i].getContentType() === 'application/pdf') {
        pdfAttachment = attachments[i];
        break;
      }
    }
  }

  if (!pdfAttachment) {
    return { success: false, error: 'No PDF attachment found' };
  }

  // Extract text from PDF
  // Apps Script can't natively parse PDFs, so we use Google Drive's OCR conversion
  var pdfText = extractTextFromPdf(pdfAttachment);

  if (!pdfText || pdfText.trim().length < 50) {
    return { success: false, error: 'Could not extract text from PDF (empty or too short)' };
  }

  // Send to Cloud Function
  try {
    var response = UrlFetchApp.fetch(config.cloudFunctionUrl, {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'X-Api-Key': config.apiKey,
      },
      payload: JSON.stringify({
        pdfText: pdfText,
        senderEmail: message.getFrom(),
        subject: message.getSubject(),
      }),
      muteHttpExceptions: true,
    });

    var statusCode = response.getResponseCode();
    var body = JSON.parse(response.getContentText());

    if (statusCode === 200 && body.success) {
      return {
        success: true,
        vehicleCount: body.vehicleCount,
        snapshotId: body.snapshotId,
      };
    } else {
      return { success: false, error: 'Cloud Function returned ' + statusCode + ': ' + (body.error || body.message) };
    }
  } catch (e) {
    return { success: false, error: 'Request failed: ' + e.toString() };
  }
}

/**
 * Extract text from a PDF attachment using Google Drive's OCR.
 * Uploads the PDF to Drive as a Google Doc (with OCR), reads the text, then deletes.
 */
function extractTextFromPdf(pdfAttachment) {
  var tempFile = null;
  var tempDoc = null;

  try {
    // Upload PDF to Drive with OCR conversion
    var blob = pdfAttachment.copyBlob();
    blob.setName('temp_allocation_' + new Date().getTime() + '.pdf');

    tempFile = Drive.Files.insert(
      { title: blob.getName(), mimeType: 'application/pdf' },
      blob,
      { ocr: true, ocrLanguage: 'en' }
    );

    // Open as Doc and extract text
    tempDoc = DocumentApp.openById(tempFile.id);
    var text = tempDoc.getBody().getText();

    return text;
  } catch (e) {
    Logger.log('PDF extraction error: ' + e.toString());
    return null;
  } finally {
    // Clean up temp file
    try {
      if (tempFile && tempFile.id) {
        Drive.Files.remove(tempFile.id);
      }
    } catch (cleanupError) {
      Logger.log('Cleanup warning: ' + cleanupError.toString());
    }
  }
}

// ─── Setup & Utility ────────────────────────────────────────────────────────

/**
 * Get or create a Gmail label for processed emails.
 */
function getOrCreateLabel(labelName) {
  var label = GmailApp.getUserLabelByName(labelName);
  if (!label) {
    label = GmailApp.createLabel(labelName);
  }
  return label;
}

/**
 * Run this ONCE to set up the automatic time-based trigger.
 * Checks for new allocation emails every 5 minutes.
 */
function setupTrigger() {
  // Remove any existing triggers for this function
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'checkForAllocationEmails') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  // Create new 5-minute trigger
  ScriptApp.newTrigger('checkForAllocationEmails')
    .timeBased()
    .everyMinutes(5)
    .create();

  Logger.log('Trigger created: checkForAllocationEmails will run every 5 minutes.');
}

/**
 * Run this to manually test the email search without processing.
 * Shows what emails would be picked up by the search query.
 */
function testSearch() {
  var config = getConfig();
  var threads = GmailApp.search(config.searchQuery, 0, 10);

  Logger.log('Search query: ' + config.searchQuery);
  Logger.log('Found ' + threads.length + ' matching thread(s):');

  for (var i = 0; i < threads.length; i++) {
    var firstMessage = threads[i].getMessages()[0];
    Logger.log('  ' + (i + 1) + '. From: ' + firstMessage.getFrom() +
      ' | Subject: ' + firstMessage.getSubject() +
      ' | Date: ' + firstMessage.getDate() +
      ' | Attachments: ' + firstMessage.getAttachments().length);
  }
}

/**
 * Run this to manually process the most recent allocation email.
 * Useful for testing without waiting for the trigger.
 */
function processLatest() {
  checkForAllocationEmails();
}
