/**
 * Manager order notifications.
 *
 * Cloud Run selects recipients and renders polished email bodies. Google Apps
 * Script sends the emails, then acks successful new-order sends back here.
 */

"use strict";

const express = require("express");
const crypto = require("crypto");
const { getFirestore, admin } = require("../lib/firebaseAdmin.cjs");

const router = express.Router();

const ACTIVE_STATUSES = new Set(["Factory Order", "Locate", "Dealer Exchange"]);
const SECURED_STATUSES = new Set(["Delivered", "Received", "Secured"]);
const PRIORITY_EMAIL_RE = /^[^\s@]+@priorityautomotive\.com$/i;
const DEFAULT_MAX_PER_RUN = 25;
const DEFAULT_START_AT = "2026-07-07T15:55:15Z";

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return PRIORITY_EMAIL_RE.test(email) ? email : "";
}

function timestampToMillis(value) {
  if (!value) return null;
  if (typeof value === "number") return value;
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

function parseStartAt(value) {
  const parsed = Date.parse(String(value || DEFAULT_START_AT));
  return Number.isNaN(parsed) ? Date.parse(DEFAULT_START_AT) : parsed;
}

function isAuthorized(req) {
  const expected = process.env.ORDER_NOTIFICATION_KEY;
  if (!expected) return false;

  const headerKey =
    req.get("x-notification-key") ||
    req.get("x-reminder-key") ||
    req.get("x-api-key") ||
    String(req.get("authorization") || "").replace(/^Bearer\s+/i, "");

  return Boolean(headerKey && headerKey === expected);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatMoney(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "N/A";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(numeric);
}

function formatDate(value) {
  const millis = timestampToMillis(value);
  if (!millis) return "N/A";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(millis));
}

function compactOrderLine(order) {
  return [order.year, order.model, order.modelNumber].filter(Boolean).join(" ");
}

function orderUrl(orderId, appUrl) {
  return `${appUrl.replace(/\/+$/, "")}/#/orders?scrollTo=${encodeURIComponent(orderId)}`;
}

function getManagerRecipients(users) {
  return users
    .filter((user) => user?.isManager === true && user?.isActive !== false)
    .map((user) => ({
      email: normalizeEmail(user.email),
      name: String(user.displayName || user.email || "").trim(),
    }))
    .filter((user) => user.email)
    .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
}

function getOrderCreatedMillis(order) {
  return timestampToMillis(order.createdAt);
}

function isNewOrderNotificationDue(order, startAtMs) {
  if (order.newOrderNotificationMuted === true) return false;
  if (order.newOrderNotificationSentAt) return false;
  if (order.newOrderNotificationQueuedAt) return false;
  if (!ACTIVE_STATUSES.has(order.status)) return false;

  const createdMs = getOrderCreatedMillis(order);
  if (!createdMs) return false;
  return createdMs >= startAtMs;
}

function detailRow(label, value) {
  return `
    <tr>
      <td style="padding:10px 12px;color:#78716c;font-size:12px;text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid #e7e5e4">${escapeHtml(label)}</td>
      <td style="padding:10px 12px;color:#1c1917;font-size:14px;font-weight:600;border-bottom:1px solid #e7e5e4">${escapeHtml(value || "N/A")}</td>
    </tr>
  `;
}

function luxuryEmailShell({ preheader, title, subtitle, bodyHtml, ctaUrl, ctaLabel }) {
  return `
    <div style="display:none;max-height:0;overflow:hidden">${escapeHtml(preheader)}</div>
    <div style="margin:0;background:#f7f3ed;padding:24px 8px;font-family:Arial,Helvetica,sans-serif;color:#1c1917;box-sizing:border-box">
      <div style="width:100%;max-width:720px;margin:0 auto;background:#fff;border:1px solid #e7e0d4;border-radius:14px;overflow:hidden;box-sizing:border-box">
        <div style="background:#111827;padding:24px;border-bottom:4px solid #c8a45d">
          <div style="color:#c8a45d;font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase">Priority Lexus Virginia Beach</div>
          <h1 style="margin:10px 0 4px;color:#fff;font-size:24px;line-height:1.25;font-weight:700">${escapeHtml(title)}</h1>
          <div style="color:#d6d3d1;font-size:14px;line-height:1.5">${escapeHtml(subtitle)}</div>
        </div>
        <div style="padding:24px">
          ${bodyHtml}
          ${
            ctaUrl
              ? `<p style="margin:28px 0 0"><a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">${escapeHtml(ctaLabel || "Open Tracker")}</a></p>`
              : ""
          }
        </div>
      </div>
      <div style="max-width:720px;margin:12px auto 0;color:#78716c;font-size:12px;text-align:center">
        Internal manager notification from Vehicle-in-Need.
      </div>
    </div>
  `;
}

function buildNewOrderNotification(order, recipients, appUrl) {
  const vehicle = compactOrderLine(order) || "Vehicle order";
  const customer = order.customerName || "Customer";
  const url = orderUrl(order.id, appUrl);
  const subject = `New vehicle order: ${customer} - ${vehicle}`;
  const preheader = `${customer} | ${vehicle} | ${order.salesperson || "Salesperson TBD"}`;

  const rows = [
    ["Customer", customer],
    ["Vehicle", vehicle],
    ["Status", order.status || "Active"],
    ["Salesperson", order.salesperson || "TBD"],
    ["Manager", order.manager || "TBD"],
    ["Deal #", order.dealNumber || "N/A"],
    ["Stock #", order.stockNumber || "N/A"],
    ["VIN", order.vin || "N/A"],
    ["Exterior", [order.exteriorColor1, order.exteriorColor2, order.exteriorColor3].filter(Boolean).join(" / ")],
    ["Interior", [order.interiorColor1, order.interiorColor2, order.interiorColor3].filter(Boolean).join(" / ")],
    ["MSRP", formatMoney(order.msrp)],
    ["Deposit", formatMoney(order.depositAmount)],
    ["Submitted", formatDate(order.createdAt || order.date)],
    ["Submitted by", order.createdByEmail || "N/A"],
  ];

  const bodyHtml = `
    <p style="margin:0 0 18px;color:#44403c;font-size:15px;line-height:1.6">
      A new vehicle order was submitted and is ready for manager review.
    </p>
    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e7e5e4;border-radius:10px;overflow:hidden">
      ${rows.map(([label, value]) => detailRow(label, value)).join("")}
    </table>
    ${
      order.options
        ? `<h2 style="margin:24px 0 8px;font-size:14px;color:#111827;text-transform:uppercase;letter-spacing:.08em">Options</h2><p style="margin:0;color:#44403c;font-size:14px;line-height:1.6">${escapeHtml(order.options)}</p>`
        : ""
    }
    ${
      order.notes
        ? `<h2 style="margin:24px 0 8px;font-size:14px;color:#111827;text-transform:uppercase;letter-spacing:.08em">Notes</h2><p style="margin:0;color:#44403c;font-size:14px;line-height:1.6">${escapeHtml(order.notes)}</p>`
        : ""
    }
  `;

  const textBody = [
    "New vehicle order submitted",
    "",
    `Customer: ${customer}`,
    `Vehicle: ${vehicle}`,
    `Status: ${order.status || "Active"}`,
    `Salesperson: ${order.salesperson || "TBD"}`,
    `Manager: ${order.manager || "TBD"}`,
    `Deal #: ${order.dealNumber || "N/A"}`,
    `MSRP: ${formatMoney(order.msrp)}`,
    `Deposit: ${formatMoney(order.depositAmount)}`,
    `Submitted by: ${order.createdByEmail || "N/A"}`,
    "",
    `Open tracker: ${url}`,
  ].join("\n");

  return {
    orderId: order.id,
    queueId: order.newOrderNotificationQueueId || "",
    recipients: recipients.map((recipient) => recipient.email),
    subject,
    textBody,
    htmlBody: luxuryEmailShell({
      preheader,
      title: "New Vehicle Order",
      subtitle: `${customer} - ${vehicle}`,
      bodyHtml,
      ctaUrl: url,
      ctaLabel: "Review Order",
    }),
    customerName: customer,
    vehicle,
    orderUrl: url,
  };
}

function orderAgeDays(order, nowMs) {
  const createdMs = getOrderCreatedMillis(order);
  if (!createdMs) return null;
  return Math.floor((nowMs - createdMs) / (24 * 60 * 60 * 1000));
}

function buildOrderRows(orders, appUrl, nowMs, includeAge = false) {
  if (orders.length === 0) {
    return `<p style="margin:0;color:#78716c;font-size:14px">None.</p>`;
  }

  return orders
    .map((order) => {
      const vehicle = compactOrderLine(order) || "Vehicle order";
      const age = orderAgeDays(order, nowMs);
      return `
        <div style="border:1px solid #e7e5e4;border-radius:10px;padding:14px;margin:0 0 10px;background:#fff">
          <a href="${escapeHtml(orderUrl(order.id, appUrl))}" style="color:#111827;font-size:16px;line-height:1.25;font-weight:800;text-decoration:none">${escapeHtml(order.customerName || "Customer")}</a>
          <div style="color:#78716c;font-size:12px;line-height:1.4;margin-top:2px">${escapeHtml(order.salesperson || "TBD")}</div>
          <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-top:10px;table-layout:fixed">
            <tr>
              <td style="width:82px;padding:5px 10px 5px 0;color:#78716c;font-size:11px;text-transform:uppercase;letter-spacing:.08em;vertical-align:top">Vehicle</td>
              <td style="padding:5px 0;color:#1c1917;font-size:14px;font-weight:600;line-height:1.35;word-break:break-word">${escapeHtml(vehicle)}</td>
            </tr>
            <tr>
              <td style="width:82px;padding:5px 10px 5px 0;color:#78716c;font-size:11px;text-transform:uppercase;letter-spacing:.08em;vertical-align:top">Status</td>
              <td style="padding:5px 0;color:#44403c;font-size:14px;line-height:1.35">${escapeHtml(order.status || "Active")}</td>
            </tr>
            ${
              includeAge
                ? `<tr>
                    <td style="width:82px;padding:5px 10px 5px 0;color:#78716c;font-size:11px;text-transform:uppercase;letter-spacing:.08em;vertical-align:top">Age</td>
                    <td style="padding:5px 0;color:#44403c;font-size:14px;line-height:1.35">${age == null ? "N/A" : `${age}d`}</td>
                  </tr>`
                : ""
            }
          </table>
        </div>
      `;
    })
    .join("");
}

function metricCard(label, value) {
  return `
    <td style="width:50%;padding:0 6px 12px 0;vertical-align:top">
      <div style="border:1px solid #e7e5e4;border-radius:10px;padding:14px;background:#fafaf9">
        <div style="color:#78716c;font-size:11px;text-transform:uppercase;letter-spacing:.08em">${escapeHtml(label)}</div>
        <div style="margin-top:6px;color:#111827;font-size:26px;font-weight:800">${escapeHtml(value)}</div>
      </div>
    </td>
  `;
}

function buildWeeklyDigest({ orders, recipients, appUrl, nowMs }) {
  const sevenDaysAgo = nowMs - 7 * 24 * 60 * 60 * 1000;
  const activeOrders = orders.filter((order) => ACTIVE_STATUSES.has(order.status));
  const dealerExchangeOrders = activeOrders.filter((order) => order.status === "Dealer Exchange");
  const factoryOrders = activeOrders.filter((order) => order.status === "Factory Order" || order.status === "Locate");
  const newOrders = orders.filter((order) => {
    const createdMs = getOrderCreatedMillis(order);
    return createdMs != null && createdMs >= sevenDaysAgo;
  });
  const agedOrders = activeOrders
    .filter((order) => {
      const age = orderAgeDays(order, nowMs);
      return age != null && age >= 14;
    })
    .sort((a, b) => (orderAgeDays(b, nowMs) || 0) - (orderAgeDays(a, nowMs) || 0))
    .slice(0, 12);
  const securedOrders = orders.filter((order) => SECURED_STATUSES.has(order.status));

  const recentNewOrders = newOrders
    .slice()
    .sort((a, b) => (getOrderCreatedMillis(b) || 0) - (getOrderCreatedMillis(a) || 0))
    .slice(0, 12);

  const bodyHtml = `
    <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:18px;table-layout:fixed">
      <tr>
        ${metricCard("Active", String(activeOrders.length))}
        ${metricCard("New 7d", String(newOrders.length))}
      </tr>
      <tr>
        ${metricCard("Factory", String(factoryOrders.length))}
        ${metricCard("DX", String(dealerExchangeOrders.length))}
      </tr>
    </table>

    <h2 style="margin:22px 0 10px;color:#111827;font-size:16px">New This Week</h2>
    ${buildOrderRows(recentNewOrders, appUrl, nowMs)}

    <h2 style="margin:24px 0 10px;color:#111827;font-size:16px">Aged Active Orders</h2>
    ${buildOrderRows(agedOrders, appUrl, nowMs, true)}

    <p style="margin:22px 0 0;color:#78716c;font-size:12px;line-height:1.6">
      Secured history currently has ${securedOrders.length} order(s). The digest focuses on active pipeline movement because older secured orders do not all have a reliable secured timestamp.
    </p>
  `;

  const subject = `Vehicle Orders Weekly Digest: ${activeOrders.length} active, ${newOrders.length} new`;
  const textBody = [
    "Vehicle Orders Weekly Digest",
    "",
    `Active: ${activeOrders.length}`,
    `New last 7 days: ${newOrders.length}`,
    `Factory/Locate: ${factoryOrders.length}`,
    `Dealer Exchange: ${dealerExchangeOrders.length}`,
    `Aged active (14+ days): ${agedOrders.length}`,
    "",
    `Open tracker: ${appUrl.replace(/\/+$/, "")}/#/orders`,
  ].join("\n");

  return {
    recipients: recipients.map((recipient) => recipient.email),
    subject,
    textBody,
    htmlBody: luxuryEmailShell({
      preheader: subject,
      title: "Weekly Vehicle Order Digest",
      subtitle: `${formatDate(nowMs)} pipeline snapshot`,
      bodyHtml,
      ctaUrl: `${appUrl.replace(/\/+$/, "")}/#/orders`,
      ctaLabel: "Open Order Tracker",
    }),
    counts: {
      active: activeOrders.length,
      newLast7Days: newOrders.length,
      factory: factoryOrders.length,
      dealerExchange: dealerExchangeOrders.length,
      agedActive: agedOrders.length,
      securedTotal: securedOrders.length,
    },
  };
}

async function loadManagersAndOrders(db) {
  const [usersSnap, ordersSnap] = await Promise.all([
    db.collection("users").get(),
    db.collection("orders").get(),
  ]);

  return {
    recipients: getManagerRecipients(usersSnap.docs.map((doc) => doc.data())),
    orders: ordersSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    orderDocs: ordersSnap.docs,
  };
}

function makeQueueId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

async function reserveNewOrderNotification({ db, orderId, recipients, startAtMs }) {
  const queueId = makeQueueId();
  const ref = db.collection("orders").doc(orderId);

  return db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) return null;

    const order = { id: snap.id, ...snap.data() };
    if (!isNewOrderNotificationDue(order, startAtMs)) return null;

    transaction.update(ref, {
      newOrderNotificationQueuedAt: admin.firestore.FieldValue.serverTimestamp(),
      newOrderNotificationQueueId: queueId,
      newOrderNotificationQueuedRecipientEmails: recipients.map((recipient) => recipient.email),
    });

    return { ...order, newOrderNotificationQueueId: queueId };
  });
}

async function loadNewOrderNotifications({ db, appUrl, maxPerRun, startAtMs, dryRun }) {
  const { recipients, orderDocs } = await loadManagersAndOrders(db);
  const skipped = { noManagers: 0, notDue: 0, alreadyReserved: 0 };

  if (recipients.length === 0) {
    return {
      notifications: [],
      recipients: [],
      skipped: { noManagers: 1, notDue: 0 },
    };
  }

  const dueOrderDocs = orderDocs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((order) => {
      const due = isNewOrderNotificationDue(order, startAtMs);
      if (!due) skipped.notDue++;
      return due;
    })
    .sort((a, b) => (getOrderCreatedMillis(a) || 0) - (getOrderCreatedMillis(b) || 0))
    .slice(0, maxPerRun);

  if (dryRun) {
    return {
      notifications: dueOrderDocs.map((order) => buildNewOrderNotification(order, recipients, appUrl)),
      recipients: recipients.map((recipient) => recipient.email),
      skipped,
    };
  }

  const reservedOrders = [];
  for (const order of dueOrderDocs) {
    const reservedOrder = await reserveNewOrderNotification({
      db,
      orderId: order.id,
      recipients,
      startAtMs,
    });
    if (reservedOrder) {
      reservedOrders.push(reservedOrder);
    } else {
      skipped.alreadyReserved++;
    }
  }

  return {
    notifications: reservedOrders.map((order) => buildNewOrderNotification(order, recipients, appUrl)),
    recipients: recipients.map((recipient) => recipient.email),
    skipped,
  };
}

async function ackNewOrderNotifications({ db, sent }) {
  const uniqueSent = [];
  const seen = new Set();

  for (const item of Array.isArray(sent) ? sent : []) {
    const orderId = String(item.orderId || "").trim();
    const queueId = String(item.queueId || "").trim();
    const recipients = Array.isArray(item.recipients)
      ? item.recipients.map(normalizeEmail).filter(Boolean)
      : [];
    if (!orderId || !queueId || seen.has(orderId)) continue;
    uniqueSent.push({ orderId, queueId, recipients });
    seen.add(orderId);
  }

  if (uniqueSent.length === 0) {
    return { acknowledged: 0 };
  }

  let acknowledged = 0;
  let skippedQueueMismatch = 0;

  for (const item of uniqueSent) {
    const ref = db.collection("orders").doc(item.orderId);
    const didAck = await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists) return false;

      const order = snap.data();
      if (order.newOrderNotificationQueueId !== item.queueId) return false;

      transaction.update(ref, {
        newOrderNotificationSentAt: admin.firestore.FieldValue.serverTimestamp(),
        newOrderNotificationRecipientEmails: item.recipients,
        newOrderNotificationQueueId: admin.firestore.FieldValue.delete(),
        newOrderNotificationQueuedAt: admin.firestore.FieldValue.delete(),
        newOrderNotificationQueuedRecipientEmails: admin.firestore.FieldValue.delete(),
      });
      return true;
    });
    if (didAck) acknowledged++;
    else skippedQueueMismatch++;
  }

  return { acknowledged, skippedQueueMismatch };
}

async function releaseNewOrderNotifications({ db, failed }) {
  const uniqueFailed = [];
  const seen = new Set();

  for (const item of Array.isArray(failed) ? failed : []) {
    const orderId = String(item.orderId || "").trim();
    const queueId = String(item.queueId || "").trim();
    const recipients = Array.isArray(item.recipients)
      ? item.recipients.map(normalizeEmail).filter(Boolean)
      : [];
    const error = String(item.error || "Unknown send failure").slice(0, 500);
    if (!orderId || !queueId || seen.has(orderId)) continue;
    uniqueFailed.push({ orderId, queueId, recipients, error });
    seen.add(orderId);
  }

  if (uniqueFailed.length === 0) {
    return { released: 0 };
  }

  let released = 0;
  let skippedQueueMismatch = 0;

  for (const item of uniqueFailed) {
    const ref = db.collection("orders").doc(item.orderId);
    const didRelease = await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists) return false;

      const order = snap.data();
      if (order.newOrderNotificationQueueId !== item.queueId) return false;

      transaction.update(ref, {
        newOrderNotificationQueueId: admin.firestore.FieldValue.delete(),
        newOrderNotificationQueuedAt: admin.firestore.FieldValue.delete(),
        newOrderNotificationQueuedRecipientEmails: admin.firestore.FieldValue.delete(),
        newOrderNotificationLastFailureAt: admin.firestore.FieldValue.serverTimestamp(),
        newOrderNotificationLastFailure: item.error,
        newOrderNotificationLastFailureRecipients: item.recipients,
      });
      return true;
    });
    if (didRelease) released++;
    else skippedQueueMismatch++;
  }

  return { released, skippedQueueMismatch };
}

router.post("/", async (req, res) => {
  if (!isAuthorized(req)) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  const action = req.body?.action || "new-orders";
  const db = getFirestore();
  const appUrl =
    process.env.PUBLIC_APP_URL ||
    `${req.protocol}://${req.get("host")}` ||
    "https://pre-order-dealer-exchange-tracker-842946218691.us-west1.run.app";

  try {
    if (action === "ack-new-orders") {
      const result = await ackNewOrderNotifications({ db, sent: req.body?.sent });
      res.json({ success: true, action, ...result });
      return;
    }

    if (action === "release-new-orders") {
      const result = await releaseNewOrderNotifications({ db, failed: req.body?.failed });
      res.json({ success: true, action, ...result });
      return;
    }

    if (action === "new-orders") {
      const maxPerRun = parsePositiveInt(
        req.body?.maxPerRun || process.env.ORDER_NOTIFICATION_MAX_PER_RUN,
        DEFAULT_MAX_PER_RUN,
      );
      const startAtMs = parseStartAt(
        req.body?.startAt || process.env.ORDER_NOTIFICATION_START_AT || DEFAULT_START_AT,
      );
      const result = await loadNewOrderNotifications({
        db,
        appUrl,
        maxPerRun,
        startAtMs,
        dryRun: req.body?.dryRun === true,
      });
      res.json({
        success: true,
        action,
        dryRun: req.body?.dryRun === true,
        maxPerRun,
        startAt: new Date(startAtMs).toISOString(),
        ...result,
      });
      return;
    }

    if (action === "weekly-digest") {
      const nowMs = Date.now();
      const { recipients, orders } = await loadManagersAndOrders(db);
      const digest = buildWeeklyDigest({ orders, recipients, appUrl, nowMs });
      res.json({ success: true, action, generatedAt: new Date(nowMs).toISOString(), ...digest });
      return;
    }

    res.status(400).json({ success: false, error: "Unknown action" });
  } catch (error) {
    console.error("[OrderNotifications] Job failed", error);
    res.status(500).json({ success: false, error: "Order notification job failed" });
  }
});

module.exports = router;
module.exports._testing = {
  ACTIVE_STATUSES,
  buildNewOrderNotification,
  buildWeeklyDigest,
  compactOrderLine,
  getManagerRecipients,
  isNewOrderNotificationDue,
  normalizeEmail,
  parseStartAt,
};
