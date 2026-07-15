import { describe, expect, it } from "vitest";
import request from "supertest";

const notifications = require("../src/handlers/orderNotifications.cjs")._testing;

describe("orderNotifications", () => {
  it("uses active Priority manager users as recipients", () => {
    expect(
      notifications.getManagerRecipients([
        {
          displayName: "Jane Manager",
          email: "Jane.Manager@PriorityAutomotive.com",
          isManager: true,
          isActive: true,
        },
        {
          displayName: "Inactive Manager",
          email: "inactive@priorityautomotive.com",
          isManager: true,
          isActive: false,
        },
        {
          displayName: "Sales User",
          email: "sales@priorityautomotive.com",
          isManager: false,
        },
        {
          displayName: "External",
          email: "external@example.com",
          isManager: true,
        },
      ]),
    ).toEqual([
      {
        email: "jane.manager@priorityautomotive.com",
        name: "Jane Manager",
      },
    ]);
  });

  it("only selects new active orders after the go-live cutoff", () => {
    const startAtMs = Date.parse("2026-07-07T15:55:15Z");

    expect(
      notifications.isNewOrderNotificationDue(
        {
          status: "Factory Order",
          createdAt: { seconds: Math.floor(Date.parse("2026-07-07T16:00:00Z") / 1000) },
        },
        startAtMs,
      ),
    ).toBe(true);

    expect(
      notifications.isNewOrderNotificationDue(
        {
          status: "Factory Order",
          createdAt: { seconds: Math.floor(Date.parse("2026-07-07T15:50:00Z") / 1000) },
        },
        startAtMs,
      ),
    ).toBe(false);

    expect(
      notifications.isNewOrderNotificationDue(
        {
          status: "Factory Order",
          date: "2030-01-01",
        },
        startAtMs,
      ),
    ).toBe(false);

    expect(
      notifications.isNewOrderNotificationDue(
        {
          status: "Delivered",
          createdAt: { seconds: Math.floor(Date.parse("2026-07-07T16:00:00Z") / 1000) },
        },
        startAtMs,
      ),
    ).toBe(false);

    expect(
      notifications.isNewOrderNotificationDue(
        {
          status: "Dealer Exchange",
          createdAt: { seconds: Math.floor(Date.parse("2026-07-07T16:00:00Z") / 1000) },
          newOrderNotificationSentAt: { seconds: Math.floor(Date.parse("2026-07-07T16:01:00Z") / 1000) },
        },
        startAtMs,
      ),
    ).toBe(false);

    expect(
      notifications.isNewOrderNotificationDue(
        {
          status: "Locate",
          createdAt: { seconds: Math.floor(Date.parse("2026-07-07T16:00:00Z") / 1000) },
          newOrderNotificationMuted: true,
        },
        startAtMs,
      ),
    ).toBe(false);

    // A FRESH reservation (within the 15-min reclaim window) still blocks re-queue.
    const nowMs = Date.parse("2026-07-15T12:00:00Z");
    expect(
      notifications.isNewOrderNotificationDue(
        {
          status: "Dealer Exchange",
          createdAt: { seconds: Math.floor(Date.parse("2026-07-07T16:00:00Z") / 1000) },
          newOrderNotificationQueuedAt: { seconds: Math.floor((nowMs - 60_000) / 1000) },
        },
        startAtMs,
        nowMs,
      ),
    ).toBe(false);

    // A STALE reservation (older than the reclaim window) with no sentAt is
    // reclaimed → due again, so a failed Apps Script ack can't silently drop
    // the manager email forever.
    expect(
      notifications.isNewOrderNotificationDue(
        {
          status: "Dealer Exchange",
          createdAt: { seconds: Math.floor(Date.parse("2026-07-07T16:00:00Z") / 1000) },
          newOrderNotificationQueuedAt: { seconds: Math.floor((nowMs - 20 * 60_000) / 1000) },
        },
        startAtMs,
        nowMs,
      ),
    ).toBe(true);
  });

  it("renders a polished new-order email with the tracker link", () => {
    const email = notifications.buildNewOrderNotification(
      {
        id: "order-123",
        newOrderNotificationQueueId: "queue-123",
        customerName: "Alex Buyer",
        salesperson: "Jane Sales",
        manager: "Morgan Manager",
        year: "2026",
        model: "RX 350",
        modelNumber: "9444",
        status: "Factory Order",
        dealNumber: "D123",
        msrp: 62450,
        depositAmount: 1000,
        createdAt: { seconds: Math.floor(Date.parse("2026-07-07T16:00:00Z") / 1000) },
      },
      [{ email: "manager@priorityautomotive.com", name: "Manager" }],
      "https://tracker.example.com/",
    );

    expect(email.subject).toBe("New vehicle order: Alex Buyer - 2026 RX 350 9444");
    expect(email.queueId).toBe("queue-123");
    expect(email.recipients).toEqual(["manager@priorityautomotive.com"]);
    expect(email.orderUrl).toBe("https://tracker.example.com/#/orders?scrollTo=order-123");
    expect(email.htmlBody).toContain("Priority Lexus Virginia Beach");
    expect(email.htmlBody).toContain("Review Order");
    expect(email.textBody).toContain("Submitted by: N/A");
  });

  it("builds weekly digest counts for manager review", () => {
    const nowMs = Date.parse("2026-07-14T13:00:00Z");
    const digest = notifications.buildWeeklyDigest({
      recipients: [{ email: "manager@priorityautomotive.com", name: "Manager" }],
      appUrl: "https://tracker.example.com",
      nowMs,
      orders: [
        {
          id: "new-factory",
          customerName: "New Factory",
          status: "Factory Order",
          createdAt: { seconds: Math.floor(Date.parse("2026-07-12T13:00:00Z") / 1000) },
        },
        {
          id: "dealer-exchange",
          customerName: "Dealer Exchange",
          status: "Dealer Exchange",
          createdAt: { seconds: Math.floor(Date.parse("2026-07-01T13:00:00Z") / 1000) },
        },
        {
          id: "aged",
          customerName: "Aged Order",
          status: "Locate",
          createdAt: { seconds: Math.floor(Date.parse("2026-06-20T13:00:00Z") / 1000) },
        },
        {
          id: "secured",
          customerName: "Secured Order",
          status: "Delivered",
          createdAt: { seconds: Math.floor(Date.parse("2026-07-10T13:00:00Z") / 1000) },
        },
      ],
    });

    expect(digest.recipients).toEqual(["manager@priorityautomotive.com"]);
    expect(digest.subject).toBe("Vehicle Orders Weekly Digest: 3 active, 2 new");
    expect(digest.counts).toEqual({
      active: 3,
      newLast7Days: 2,
      factory: 2,
      dealerExchange: 1,
      agedActive: 1,
      securedTotal: 1,
    });
    expect(digest.htmlBody).toContain("Weekly Vehicle Order Digest");
    expect(digest.textBody).toContain("Aged active (14+ days): 1");
  });
});

describe("order notification route flag", () => {
  it("returns 503 when manager notifications are disabled", async () => {
    delete process.env.ORDER_NOTIFICATIONS_ENABLED;
    delete process.env.ORDER_NOTIFICATION_KEY;
    delete require.cache[require.resolve("../index.cjs")];
    const app = require("../index.cjs");

    const res = await request(app).post("/jobs/order-notifications").send({});
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/not enabled/i);
  });

  it("rejects enabled manager notification job calls without the secret key", async () => {
    process.env.ORDER_NOTIFICATIONS_ENABLED = "true";
    process.env.ORDER_NOTIFICATION_KEY = "expected-key";
    delete require.cache[require.resolve("../index.cjs")];
    const app = require("../index.cjs");

    const res = await request(app).post("/jobs/order-notifications").send({
      action: "new-orders",
    });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/unauthorized/i);

    delete process.env.ORDER_NOTIFICATIONS_ENABLED;
    delete process.env.ORDER_NOTIFICATION_KEY;
  });
});
