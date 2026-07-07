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
 *    - REMINDER_JOB_URL: Optional. Defaults to the live Cloud Run reminder job.
 *    - REMINDER_API_KEY: Optional. Defaults to ALLOCATION_API_KEY.
 *    - ORDER_NOTIFICATION_JOB_URL: Optional. Defaults to the live Cloud Run order notification job.
 *    - ORDER_NOTIFICATION_API_KEY: Required. Dedicated manager notification secret.
 * 4. Run setupTrigger() once to create the automatic check
 * 5. Run setupUnsecuredReminderTrigger() once to create reminder checks
 * 6. Run setupManagerOrderNotificationTriggers() once to create manager order emails
 * 7. Authorize when prompted (Gmail access required)
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
    reminderJobUrl: props.getProperty('REMINDER_JOB_URL') ||
      'https://pre-order-dealer-exchange-tracker-842946218691.us-west1.run.app/jobs/unsecured-order-reminders',
    reminderApiKey: props.getProperty('REMINDER_API_KEY') ||
      props.getProperty('ALLOCATION_API_KEY') ||
      '',
    reminderEveryDays: parseInt(props.getProperty('REMINDER_EVERY_DAYS') || '3', 10),
    reminderMaxPerRun: parseInt(props.getProperty('REMINDER_MAX_PER_RUN') || '50', 10),
    orderNotificationJobUrl: props.getProperty('ORDER_NOTIFICATION_JOB_URL') ||
      'https://pre-order-dealer-exchange-tracker-842946218691.us-west1.run.app/jobs/order-notifications',
    orderNotificationApiKey: props.getProperty('ORDER_NOTIFICATION_API_KEY') || '',
    orderNotificationMaxPerRun: parseInt(props.getProperty('ORDER_NOTIFICATION_MAX_PER_RUN') || '25', 10),
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

  // Send PDF as base64 — Cloud Function extracts text server-side with pdf-parse.
  // This avoids Google Drive OCR rate limits entirely.
  var pdfBase64 = Utilities.base64Encode(pdfAttachment.getBytes());

  // Send to Cloud Function
  try {
    var response = UrlFetchApp.fetch(config.cloudFunctionUrl, {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'X-Api-Key': config.apiKey,
      },
      payload: JSON.stringify({
        pdfBase64: pdfBase64,
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

/**
 * Sends due unsecured-order reminders.
 *
 * Cloud Run returns the due orders and email bodies. Apps Script sends the
 * emails from the dealership Google account, then acknowledges successful sends
 * so each order waits REMINDER_EVERY_DAYS before emailing again.
 */
function sendUnsecuredOrderReminders() {
  var config = getConfig();

  if (!config.reminderJobUrl || !config.reminderApiKey) {
    Logger.log('ERROR: Missing REMINDER_JOB_URL or REMINDER_API_KEY/ALLOCATION_API_KEY in Script Properties');
    return;
  }

  var dueResponse = UrlFetchApp.fetch(config.reminderJobUrl, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'X-Api-Key': config.reminderApiKey,
    },
    payload: JSON.stringify({
      action: 'due',
      everyDays: config.reminderEveryDays,
      maxPerRun: config.reminderMaxPerRun,
    }),
    muteHttpExceptions: true,
  });

  var dueStatusCode = dueResponse.getResponseCode();
  var dueBody = JSON.parse(dueResponse.getContentText() || '{}');
  if (dueStatusCode !== 200 || !dueBody.success) {
    Logger.log('FAILED: Reminder due lookup returned ' + dueStatusCode + ': ' + (dueBody.error || dueResponse.getContentText()));
    return;
  }

  var reminders = dueBody.reminders || [];
  if (reminders.length === 0) {
    Logger.log('No unsecured-order reminders due.');
    return;
  }

  var sent = [];
  var failed = [];

  for (var i = 0; i < reminders.length; i++) {
    var reminder = reminders[i];
    try {
      MailApp.sendEmail({
        to: reminder.email,
        subject: reminder.subject,
        body: reminder.textBody,
        htmlBody: reminder.htmlBody,
        name: 'Priority Lexus Vehicle Orders',
      });
      sent.push({ orderId: reminder.orderId, email: reminder.email });
      Logger.log('SENT: ' + reminder.orderId + ' -> ' + reminder.email + ' (' + reminder.customerName + ')');
    } catch (e) {
      failed.push({
        orderId: reminder.orderId,
        email: reminder.email,
        error: e.toString(),
      });
      Logger.log('FAILED SEND: ' + reminder.orderId + ' -> ' + reminder.email + ': ' + e.toString());
    }
  }

  if (sent.length > 0) {
    var ackResponse = UrlFetchApp.fetch(config.reminderJobUrl, {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'X-Api-Key': config.reminderApiKey,
      },
      payload: JSON.stringify({
        action: 'ack',
        sent: sent,
        failed: failed,
      }),
      muteHttpExceptions: true,
    });
    Logger.log('ACK: ' + ackResponse.getResponseCode() + ' ' + ackResponse.getContentText());
  }

  Logger.log('Unsecured reminders complete. Sent: ' + sent.length + ', failed: ' + failed.length);
}

/**
 * Run this ONCE to set up automatic unsecured-order reminders.
 * Sends once per day; Cloud Run enforces the every-few-days cadence per order.
 */
function setupUnsecuredReminderTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'sendUnsecuredOrderReminders') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  ScriptApp.newTrigger('sendUnsecuredOrderReminders')
    .timeBased()
    .everyDays(1)
    .atHour(9)
    .create();

  Logger.log('Trigger created: sendUnsecuredOrderReminders will run daily around 9 AM.');
}

/**
 * Run this manually to test due reminders without sending emails.
 */
function previewUnsecuredOrderReminders() {
  var config = getConfig();
  var response = UrlFetchApp.fetch(config.reminderJobUrl, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'X-Api-Key': config.reminderApiKey,
    },
    payload: JSON.stringify({
      action: 'due',
      everyDays: config.reminderEveryDays,
      maxPerRun: config.reminderMaxPerRun,
    }),
    muteHttpExceptions: true,
  });

  Logger.log(response.getResponseCode() + ' ' + response.getContentText());
}

/**
 * Parses a Cloud Run JSON response without letting HTML/proxy errors crash a trigger.
 */
function parseJsonResponse_(response) {
  var text = response.getContentText() || '{}';
  try {
    return { body: JSON.parse(text), text: text, error: '' };
  } catch (e) {
    return { body: null, text: text, error: e.toString() };
  }
}

/**
 * Posts to the protected manager notification job.
 */
function postOrderNotificationJob_(config, payload) {
  return UrlFetchApp.fetch(config.orderNotificationJobUrl, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'X-Api-Key': config.orderNotificationApiKey,
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
}

/**
 * Posts an ack/release payload with short retries. This avoids repeat manager
 * emails after a transient Cloud Run or network hiccup.
 */
function postOrderNotificationJobWithRetry_(config, payload, label) {
  var lastResponse = null;
  for (var attempt = 1; attempt <= 3; attempt++) {
    lastResponse = postOrderNotificationJob_(config, payload);
    var parsed = parseJsonResponse_(lastResponse);
    if (lastResponse.getResponseCode() === 200 && parsed.body && parsed.body.success) {
      Logger.log(label + ': ' + lastResponse.getResponseCode() + ' ' + parsed.text);
      return true;
    }

    Logger.log(label + ' attempt ' + attempt + ' failed: ' +
      lastResponse.getResponseCode() + ' ' + (parsed.error || parsed.text));
    Utilities.sleep(attempt * 1000);
  }
  return false;
}

/**
 * Sends polished new-order emails to active managers.
 *
 * Recipient list is controlled inside Vehicle-in-Need: active users marked as
 * Manager receive the email. Cloud Run only returns orders created after the
 * notification go-live cutoff and not already acknowledged.
 */
function sendNewOrderNotifications() {
  var config = getConfig();

  if (!config.orderNotificationJobUrl || !config.orderNotificationApiKey) {
    Logger.log('ERROR: Missing ORDER_NOTIFICATION_JOB_URL or ORDER_NOTIFICATION_API_KEY in Script Properties');
    return;
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) {
    Logger.log('New-order notification run skipped because another run is still active.');
    return;
  }

  try {
    var response = postOrderNotificationJob_(config, {
      action: 'new-orders',
      maxPerRun: config.orderNotificationMaxPerRun,
    });

    var statusCode = response.getResponseCode();
    var parsed = parseJsonResponse_(response);
    var body = parsed.body;
    if (statusCode !== 200 || !body || !body.success) {
      Logger.log('FAILED: New-order lookup returned ' + statusCode + ': ' +
        (parsed.error || (body && body.error) || parsed.text));
      return;
    }

    var notifications = body.notifications || [];
    if (notifications.length === 0) {
      Logger.log('No new manager order notifications due.');
      return;
    }

    var sent = [];
    var failed = [];

    for (var i = 0; i < notifications.length; i++) {
      var notification = notifications[i];
      try {
        MailApp.sendEmail({
          to: notification.recipients.join(','),
          subject: notification.subject,
          body: notification.textBody,
          htmlBody: notification.htmlBody,
          name: 'Priority Lexus Vehicle Orders',
        });
        sent.push({
          orderId: notification.orderId,
          queueId: notification.queueId,
          recipients: notification.recipients,
        });
        Logger.log('SENT NEW ORDER: ' + notification.orderId + ' -> ' + notification.recipients.join(','));
      } catch (e) {
        failed.push({
          orderId: notification.orderId,
          queueId: notification.queueId,
          recipients: notification.recipients,
          error: e.toString(),
        });
        Logger.log('FAILED NEW ORDER SEND: ' + notification.orderId + ': ' + e.toString());
      }
    }

    if (sent.length > 0) {
      postOrderNotificationJobWithRetry_(config, {
        action: 'ack-new-orders',
        sent: sent,
      }, 'NEW ORDER ACK');
    }

    if (failed.length > 0) {
      postOrderNotificationJobWithRetry_(config, {
        action: 'release-new-orders',
        failed: failed,
      }, 'NEW ORDER RELEASE');
    }

    Logger.log('New-order notifications complete. Sent: ' + sent.length + ', failed: ' + failed.length);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Sends the weekly manager digest.
 */
function sendWeeklyOrderDigest() {
  var config = getConfig();

  if (!config.orderNotificationJobUrl || !config.orderNotificationApiKey) {
    Logger.log('ERROR: Missing ORDER_NOTIFICATION_JOB_URL or ORDER_NOTIFICATION_API_KEY in Script Properties');
    return;
  }

  var response = postOrderNotificationJob_(config, { action: 'weekly-digest' });

  var statusCode = response.getResponseCode();
  var parsed = parseJsonResponse_(response);
  var body = parsed.body;
  if (statusCode !== 200 || !body || !body.success) {
    Logger.log('FAILED: Weekly digest lookup returned ' + statusCode + ': ' +
      (parsed.error || (body && body.error) || parsed.text));
    return;
  }

  if (!body.recipients || body.recipients.length === 0) {
    Logger.log('No manager recipients found for weekly digest.');
    return;
  }

  MailApp.sendEmail({
    to: body.recipients.join(','),
    subject: body.subject,
    body: body.textBody,
    htmlBody: body.htmlBody,
    name: 'Priority Lexus Vehicle Orders',
  });

  Logger.log('Weekly order digest sent to ' + body.recipients.join(',') + ': ' + JSON.stringify(body.counts || {}));
}

/**
 * Run this ONCE to set up manager new-order and weekly digest emails.
 * New-order checks run every 5 minutes. Weekly digest runs Monday around 8 AM.
 */
function setupManagerOrderNotificationTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  var functionsToReplace = {
    sendNewOrderNotifications: true,
    sendWeeklyOrderDigest: true,
  };

  for (var i = 0; i < triggers.length; i++) {
    if (functionsToReplace[triggers[i].getHandlerFunction()]) {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  ScriptApp.newTrigger('sendNewOrderNotifications')
    .timeBased()
    .everyMinutes(5)
    .create();

  ScriptApp.newTrigger('sendWeeklyOrderDigest')
    .timeBased()
    .everyWeeks(1)
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(8)
    .create();

  Logger.log('Triggers created: sendNewOrderNotifications every 5 minutes; sendWeeklyOrderDigest Mondays around 8 AM.');
}

/**
 * Run this manually to preview new manager order notifications without sending.
 */
function previewManagerOrderNotifications() {
  var config = getConfig();
  var response = postOrderNotificationJob_(config, {
    action: 'new-orders',
    maxPerRun: config.orderNotificationMaxPerRun,
    dryRun: true,
  });

  Logger.log(response.getResponseCode() + ' ' + response.getContentText());
}

/**
 * Run this manually to preview the weekly digest without sending.
 */
function previewWeeklyOrderDigest() {
  var config = getConfig();
  var response = postOrderNotificationJob_(config, { action: 'weekly-digest' });

  Logger.log(response.getResponseCode() + ' ' + response.getContentText());
}
