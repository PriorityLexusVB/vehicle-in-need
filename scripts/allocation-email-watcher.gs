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
 * Each allocation email is handled once (tracked by message id, not by
 * read/unread). If it cannot be put on the board, the account running this
 * script gets one email explaining why, and the thread is labeled
 * "Allocation/Needs Attention". Set ALLOCATION_ALERT_EMAIL to send the alert
 * somewhere else.
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
    // Label for allocation emails that could not be put on the board
    failedLabel: 'Allocation/Needs Attention',
    // Gmail search query — catches Toyota/Lexus DSM allocation emails.
    // Read/unread state is NOT used: opening the email before the 5-minute
    // check used to make the watcher skip it forever (Allocation 111, Nov 2026).
    // Each message is tracked by id instead (see getHandledMessageIds_).
    searchQuery: 'subject:(Allocation) from:(@toyota.com OR @lexus.com) has:attachment filename:pdf newer_than:21d',
    // Who gets told when an allocation email cannot be read. Defaults to the
    // account running this script.
    alertEmail: props.getProperty('ALLOCATION_ALERT_EMAIL') || '',
  };
}

// ─── Main Functions ─────────────────────────────────────────────────────────

/**
 * Main function — run by the time-based trigger every 5 minutes.
 * Searches for new allocation emails, extracts PDFs, and sends to Cloud Function.
 *
 * Every allocation message is handled exactly once: it either reaches the
 * board, or its failure is emailed to the alert address once and the thread
 * is labeled "Allocation/Needs Attention". Messages are processed oldest
 * first so an older allocation can never replace a newer one on the board.
 */
function checkForAllocationEmails() {
  const config = getConfig();

  if (!config.cloudFunctionUrl || !config.apiKey) {
    Logger.log('ERROR: Missing CLOUD_FUNCTION_URL or ALLOCATION_API_KEY in Script Properties');
    return;
  }

  // Two overlapping 5-minute runs must not post the same email twice.
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) {
    Logger.log('Another allocation check is still running; skipping this run.');
    return;
  }
  try {
    processPendingAllocationEmails_(config);
  } finally {
    lock.releaseLock();
  }
}

function processPendingAllocationEmails_(config) {
  var handled = getHandledMessageIds_();
  var baseline = getWatcherBaseline_();
  var threads = GmailApp.search(config.searchQuery, 0, 20);
  var pending = [];

  for (var i = 0; i < threads.length; i++) {
    var messages = threads[i].getMessages();
    for (var j = 0; j < messages.length; j++) {
      var message = messages[j];
      if (handled[message.getId()]) continue;
      if (message.getDate().getTime() < baseline) continue;
      // The search matches a whole thread; an internal reply or forward of an
      // old allocation inside it must not be sent to the board.
      if (!/@(toyota|lexus)\.com\b/i.test(message.getFrom())) continue;
      if (!hasPdfAttachment_(message)) continue;
      pending.push({ message: message, thread: threads[i] });
    }
  }

  if (pending.length === 0) {
    Logger.log('No new allocation emails found.');
    return;
  }

  pending.sort(function (a, b) {
    return a.message.getDate().getTime() - b.message.getDate().getTime();
  });
  Logger.log('Found ' + pending.length + ' allocation email(s) to process.');

  var processedLabel = getOrCreateLabel(config.processedLabel);
  var failedLabel = getOrCreateLabel(config.failedLabel);

  for (var k = 0; k < pending.length; k++) {
    var item = pending[k];
    var result = processAllocationMessage(item.message, config);

    if (result.success) {
      Logger.log('SUCCESS: Processed allocation from ' + item.message.getFrom() +
        ' — ' + result.vehicleCount + ' vehicles, snapshot: ' + result.snapshotId);
      item.message.markRead();
      item.thread.addLabel(processedLabel);
      item.thread.removeLabel(failedLabel);
      markMessageHandled_(item.message.getId(), 'ok');
    } else if (result.retryable && bumpRetryCount_(item.message.getId()) <= 6) {
      // Network or server hiccup: try again on the next 5-minute run (up to 6 times,
      // about 30 minutes), then alert like any other failure. Stop this run here
      // so a newer email never reaches the board ahead of this older one.
      Logger.log('RETRY LATER: ' + result.error + ' — subject: ' + item.message.getSubject());
      return;
    } else {
      Logger.log('FAILED: ' + result.error + ' — from: ' + item.message.getFrom() +
        ' subject: ' + item.message.getSubject());
      item.thread.addLabel(failedLabel);
      markMessageHandled_(item.message.getId(), 'failed');
      sendAllocationFailureAlert_(item.message, result, config);
    }
  }
}

function hasPdfAttachment_(message) {
  var attachments = message.getAttachments();
  for (var i = 0; i < attachments.length; i++) {
    if (attachments[i].getName().toLowerCase().endsWith('.pdf')) return true;
  }
  return false;
}

/**
 * The first time this version runs it records "now", so emails from before
 * the upgrade are not re-sent to the board. Run resetWatcherBaseline() with a
 * date to reprocess older emails on purpose.
 */
function getWatcherBaseline_() {
  var props = PropertiesService.getScriptProperties();
  var value = props.getProperty('ALLOCATION_WATCH_SINCE_MS');
  if (!value) {
    value = String(Date.now());
    props.setProperty('ALLOCATION_WATCH_SINCE_MS', value);
  }
  return Number(value);
}

function resetWatcherBaseline(isoDate) {
  var ms = isoDate ? new Date(isoDate).getTime() : Date.now();
  PropertiesService.getScriptProperties().setProperty('ALLOCATION_WATCH_SINCE_MS', String(ms));
  Logger.log('Allocation watcher now considers emails received after ' + new Date(ms));
}

function getHandledMessageIds_() {
  var raw = PropertiesService.getScriptProperties().getProperty('ALLOCATION_HANDLED_IDS');
  try {
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function markMessageHandled_(messageId, outcome) {
  var handled = getHandledMessageIds_();
  handled[messageId] = outcome + '@' + new Date().toISOString();
  // Keep the newest 80 entries (about 3.7 KB) so the property stays far below
  // Apps Script's 9 KB per-value limit. The search only looks back 21 days.
  var ids = Object.keys(handled);
  if (ids.length > 80) {
    ids.sort(function (a, b) { return handled[a].split('@')[1] < handled[b].split('@')[1] ? -1 : 1; });
    for (var i = 0; i < ids.length - 80; i++) delete handled[ids[i]];
  }
  var props = PropertiesService.getScriptProperties();
  props.setProperty('ALLOCATION_HANDLED_IDS', JSON.stringify(handled));
  // A handled message never needs its retry counter again.
  var counts = getRetryCounts_();
  if (counts[messageId] !== undefined) {
    delete counts[messageId];
    props.setProperty('ALLOCATION_RETRY_COUNTS', JSON.stringify(counts));
  }
}

function getRetryCounts_() {
  try {
    return JSON.parse(PropertiesService.getScriptProperties().getProperty('ALLOCATION_RETRY_COUNTS') || '{}');
  } catch (e) {
    return {};
  }
}

function bumpRetryCount_(messageId) {
  var counts = getRetryCounts_();
  counts[messageId] = (counts[messageId] || 0) + 1;
  PropertiesService.getScriptProperties().setProperty('ALLOCATION_RETRY_COUNTS', JSON.stringify(counts));
  return counts[messageId];
}

/**
 * Allow an email that failed (for example before a fix was deployed) to be
 * tried again on the next run. Pass the Gmail message id from the alert log.
 */
function retryAllocationMessage(messageId) {
  var handled = getHandledMessageIds_();
  delete handled[messageId];
  PropertiesService.getScriptProperties().setProperty('ALLOCATION_HANDLED_IDS', JSON.stringify(handled));
  Logger.log('Message ' + messageId + ' will be tried again on the next run.');
}

function describeAllocationFailure_(error) {
  if (/Older than the allocation on the board/i.test(error)) {
    return 'It is older than the allocation already on the board, so it was not used. (Usually a forwarded or re-sent old allocation. Nothing to do.)';
  }
  if (/too short or empty/i.test(error)) {
    return 'The PDF has no readable text. It was most likely made with "Print to PDF", which turns the letters into pictures.';
  }
  if (/No vehicles found/i.test(error)) {
    return 'The PDF was read, but no vehicles were recognised in it.';
  }
  if (/No PDF attachment/i.test(error)) {
    return 'The email has no PDF attached.';
  }
  return error;
}

function sendAllocationFailureAlert_(message, result, config) {
  var to = config.alertEmail || Session.getEffectiveUser().getEmail();
  if (!to) return;
  var subject = 'Allocation board NOT updated: ' + message.getSubject();
  var body = [
    'This allocation email could not be put on the Allocation Board automatically.',
    '',
    'Email: ' + message.getSubject(),
    'From: ' + message.getFrom(),
    'Received: ' + message.getDate(),
    '',
    'Why: ' + describeAllocationFailure_(result.error),
    '',
    'The board still shows the previous allocation.',
    '',
    'To fix it, either:',
    '  1. Ask the DSM to resend the allocation PDF saved straight from the allocation application (not "Print to PDF"), or',
    '  2. Open the tracker, go to Allocation Board > Update Allocation, and paste the allocation text.',
    '',
    'Technical detail: ' + result.error,
  ].join('\n');
  MailApp.sendEmail(to, subject, body);
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
    var body;
    try {
      body = JSON.parse(response.getContentText());
    } catch (parseError) {
      body = { error: response.getContentText().slice(0, 200) };
    }

    if (statusCode === 200 && body.success) {
      return {
        success: true,
        vehicleCount: body.vehicleCount,
        snapshotId: body.snapshotId,
      };
    } else {
      return {
        success: false,
        retryable: statusCode >= 500 || statusCode === 429,
        error: 'Cloud Function returned ' + statusCode + ': ' + (body.error || body.message),
      };
    }
  } catch (e) {
    return { success: false, retryable: true, error: 'Request failed: ' + e.toString() };
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
