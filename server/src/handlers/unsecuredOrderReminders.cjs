/**
 * Unsecured order reminders.
 *
 * Cloud Run decides which active orders are due. Google Apps Script sends the
 * actual Gmail/MailApp messages, then calls back here to record successful sends.
 */

"use strict";

const express = require("express");
const { getFirestore, admin } = require("../lib/firebaseAdmin.cjs");

const router = express.Router();

const ACTIVE_STATUSES = new Set(["Factory Order", "Locate", "Dealer Exchange"]);
const DEFAULT_EVERY_DAYS = 3;
const DEFAULT_MAX_PER_RUN = 50;
const PRIORITY_EMAIL_RE = /^[^\s@]+@priorityautomotive\.com$/i;

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^\w\s.-]/g, "")
    .replace(/\s+/g, " ");
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return PRIORITY_EMAIL_RE.test(email) ? email : "";
}

function timestampToMillis(value) {
  if (!value) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? null : parsed;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isAuthorized(req) {
  const expected = process.env.UNSECURED_REMINDER_KEY;
  if (!expected) return false;

  const headerKey =
    req.get("x-reminder-key") ||
    req.get("x-api-key") ||
    String(req.get("authorization") || "").replace(/^Bearer\s+/i, "");

  return headerKey && headerKey === expected;
}

function getOrderAnchorMillis(order) {
  return (
    timestampToMillis(order.lastUnsecuredReminderAt) ||
    timestampToMillis(order.createdAt) ||
    timestampToMillis(order.date)
  );
}

function isOrderDue(order, nowMs, everyDays) {
  if (!ACTIVE_STATUSES.has(order.status)) return false;
  if (order.unsecuredReminderMuted === true) return false;

  const anchorMs = getOrderAnchorMillis(order);
  if (!anchorMs) return true;

  return nowMs - anchorMs >= everyDays * 24 * 60 * 60 * 1000;
}

function buildUserDirectory(users) {
  const byDisplayName = new Map();

  for (const user of users) {
    if (user.isActive === false) continue;

    const email = normalizeEmail(user.email);
    const displayName = normalizeName(user.displayName);
    if (!email || !displayName) continue;

    const existing = byDisplayName.get(displayName) || [];
    existing.push(email);
    byDisplayName.set(displayName, existing);
  }

  return { byDisplayName };
}

function resolveRecipient(order, directory) {
  const directSalespersonEmail = normalizeEmail(order.salespersonEmail);
  if (directSalespersonEmail) {
    return { email: directSalespersonEmail, source: "salespersonEmail" };
  }

  const salespersonName = normalizeName(order.salesperson);
  const matchedEmails = salespersonName
    ? directory.byDisplayName.get(salespersonName) || []
    : [];
  const uniqueMatchedEmails = [...new Set(matchedEmails)];

  if (uniqueMatchedEmails.length === 1) {
    return { email: uniqueMatchedEmails[0], source: "users.displayName" };
  }

  const ownerEmail = normalizeEmail(order.createdByEmail);
  if (ownerEmail) {
    return { email: ownerEmail, source: "createdByEmail" };
  }

  return {
    email: "",
    source: uniqueMatchedEmails.length > 1 ? "ambiguousSalespersonName" : "missingEmail",
  };
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function compactOrderLine(order) {
  return [order.year, order.model, order.modelNumber].filter(Boolean).join(" ");
}

function buildReminder(order, recipient, appUrl) {
  const vehicle = compactOrderLine(order) || "Vehicle order";
  const customer = order.customerName || "Customer";
  const subject = `Vehicle order still needs to be secured: ${customer} - ${vehicle}`;
  const orderUrl = `${appUrl.replace(/\/+$/, "")}/#/orders?scrollTo=${encodeURIComponent(order.id)}`;

  const textBody = [
    "Quick reminder: this vehicle order is still active and needs to be secured when the vehicle is handled.",
    "",
    `Customer: ${customer}`,
    `Vehicle: ${vehicle}`,
    `Status: ${order.status || "Active"}`,
    `Deal #: ${order.dealNumber || "N/A"}`,
    order.allocatedVehicleInfo ? `Linked vehicle: ${order.allocatedVehicleInfo}` : "",
    "",
    `Open the tracker: ${orderUrl}`,
    "",
    "This reminder stops automatically after the order is marked secured.",
  ]
    .filter((line) => line !== "")
    .join("\n");

  const htmlBody = `
    <p>Quick reminder: this vehicle order is still active and needs to be secured when the vehicle is handled.</p>
    <table cellpadding="6" cellspacing="0" style="border-collapse:collapse">
      <tr><td><strong>Customer</strong></td><td>${escapeHtml(customer)}</td></tr>
      <tr><td><strong>Vehicle</strong></td><td>${escapeHtml(vehicle)}</td></tr>
      <tr><td><strong>Status</strong></td><td>${escapeHtml(order.status || "Active")}</td></tr>
      <tr><td><strong>Deal #</strong></td><td>${escapeHtml(order.dealNumber || "N/A")}</td></tr>
      ${
        order.allocatedVehicleInfo
          ? `<tr><td><strong>Linked vehicle</strong></td><td>${escapeHtml(order.allocatedVehicleInfo)}</td></tr>`
          : ""
      }
    </table>
    <p><a href="${escapeHtml(orderUrl)}">Open the tracker</a></p>
    <p style="color:#666;font-size:12px">This reminder stops automatically after the order is marked secured.</p>
  `;

  return {
    orderId: order.id,
    email: recipient.email,
    recipientSource: recipient.source,
    subject,
    textBody,
    htmlBody,
    customerName: customer,
    salesperson: order.salesperson || "",
    status: order.status || "",
    vehicle,
    dealNumber: order.dealNumber || "",
    orderUrl,
  };
}

async function loadDueReminders({ db, nowMs, everyDays, maxPerRun, appUrl }) {
  const [ordersSnap, usersSnap] = await Promise.all([
    db.collection("orders").where("status", "in", [...ACTIVE_STATUSES]).get(),
    db.collection("users").get(),
  ]);

  const directory = buildUserDirectory(usersSnap.docs.map((doc) => doc.data()));
  const reminders = [];
  const skipped = {
    notDue: 0,
    missingRecipient: 0,
    inactive: 0,
    muted: 0,
  };

  for (const doc of ordersSnap.docs) {
    const order = { id: doc.id, ...doc.data() };

    if (!ACTIVE_STATUSES.has(order.status)) {
      skipped.inactive++;
      continue;
    }
    if (order.unsecuredReminderMuted === true) {
      skipped.muted++;
      continue;
    }
    if (!isOrderDue(order, nowMs, everyDays)) {
      skipped.notDue++;
      continue;
    }

    const recipient = resolveRecipient(order, directory);
    if (!recipient.email) {
      skipped.missingRecipient++;
      continue;
    }

    reminders.push(buildReminder(order, recipient, appUrl));
    if (reminders.length >= maxPerRun) break;
  }

  return {
    reminders,
    skipped,
    everyDays,
    maxPerRun,
    generatedAt: new Date(nowMs).toISOString(),
  };
}

async function ackSentReminders({ db, sent }) {
  const uniqueSent = [];
  const seen = new Set();

  for (const item of Array.isArray(sent) ? sent : []) {
    const orderId = String(item.orderId || "").trim();
    const email = normalizeEmail(item.email);
    if (!orderId || !email || seen.has(orderId)) continue;
    uniqueSent.push({ orderId, email });
    seen.add(orderId);
  }

  if (uniqueSent.length === 0) {
    return { acknowledged: 0 };
  }

  // Per-order transactions (not a single batch): a batch.commit() throws
  // NOT_FOUND if ANY acked order was deleted between the due-run and this
  // callback, which would drop lastUnsecuredReminderAt for EVERY order and
  // re-send them all next run. Guarding each write with an existence check
  // (mirrors ackNewOrderNotifications in orderNotifications.cjs) means one
  // deleted order can no longer poison the rest.
  let acknowledged = 0;
  let skippedMissing = 0;

  for (const item of uniqueSent) {
    const ref = db.collection("orders").doc(item.orderId);
    const didAck = await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists) return false;

      transaction.update(ref, {
        lastUnsecuredReminderAt: admin.firestore.FieldValue.serverTimestamp(),
        unsecuredReminderCount: admin.firestore.FieldValue.increment(1),
        unsecuredReminderLastEmail: item.email,
      });
      return true;
    });
    if (didAck) acknowledged++;
    else skippedMissing++;
  }

  return { acknowledged, skippedMissing };
}

router.post("/", async (req, res) => {
  if (!isAuthorized(req)) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  const action = req.body?.action || "due";
  const db = getFirestore();

  try {
    if (action === "ack") {
      const result = await ackSentReminders({ db, sent: req.body?.sent });
      res.json({ success: true, action, ...result });
      return;
    }

    if (action !== "due") {
      res.status(400).json({ success: false, error: "Unknown action" });
      return;
    }

    const nowMs = Date.now();
    const everyDays = parsePositiveInt(
      req.body?.everyDays || process.env.UNSECURED_REMINDER_EVERY_DAYS,
      DEFAULT_EVERY_DAYS,
    );
    const maxPerRun = parsePositiveInt(
      req.body?.maxPerRun || process.env.UNSECURED_REMINDER_MAX_PER_RUN,
      DEFAULT_MAX_PER_RUN,
    );
    const appUrl =
      process.env.PUBLIC_APP_URL ||
      `${req.protocol}://${req.get("host")}` ||
      "https://pre-order-dealer-exchange-tracker-842946218691.us-west1.run.app";

    const result = await loadDueReminders({
      db,
      nowMs,
      everyDays,
      maxPerRun,
      appUrl,
    });

    res.json({ success: true, action, ...result });
  } catch (error) {
    console.error("[UnsecuredReminders] Job failed", error);
    res.status(500).json({ success: false, error: "Reminder job failed" });
  }
});

module.exports = router;
module.exports._testing = {
  ACTIVE_STATUSES,
  buildReminder,
  buildUserDirectory,
  compactOrderLine,
  getOrderAnchorMillis,
  isOrderDue,
  normalizeEmail,
  normalizeName,
  resolveRecipient,
};
