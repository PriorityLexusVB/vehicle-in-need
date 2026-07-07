import { describe, it, expect } from "vitest";
import request from "supertest";

const reminders = require("../src/handlers/unsecuredOrderReminders.cjs")._testing;

describe("unsecuredOrderReminders", () => {
  it("normalizes names for salesperson matching", () => {
    expect(reminders.normalizeName("  Rob   Brasco, Jr. ")).toBe("rob brasco jr.");
    expect(reminders.normalizeName("")).toBe("");
  });

  it("only accepts Priority Automotive emails", () => {
    expect(reminders.normalizeEmail("Sales.Person@PriorityAutomotive.com")).toBe(
      "sales.person@priorityautomotive.com",
    );
    expect(reminders.normalizeEmail("sales@example.com")).toBe("");
  });

  it("marks active orders due every configured number of days", () => {
    const now = Date.parse("2026-07-07T14:00:00Z");
    const fourDaysAgo = { seconds: Math.floor((now - 4 * 24 * 60 * 60 * 1000) / 1000) };
    const yesterday = { seconds: Math.floor((now - 24 * 60 * 60 * 1000) / 1000) };

    expect(
      reminders.isOrderDue(
        { status: "Factory Order", lastUnsecuredReminderAt: fourDaysAgo },
        now,
        3,
      ),
    ).toBe(true);
    expect(
      reminders.isOrderDue(
        { status: "Factory Order", lastUnsecuredReminderAt: yesterday },
        now,
        3,
      ),
    ).toBe(false);
    expect(
      reminders.isOrderDue(
        { status: "Delivered", lastUnsecuredReminderAt: fourDaysAgo },
        now,
        3,
      ),
    ).toBe(false);
    expect(
      reminders.isOrderDue(
        { status: "Dealer Exchange", unsecuredReminderMuted: true },
        now,
        3,
      ),
    ).toBe(false);
  });

  it("resolves salesperson email from explicit field, user directory, then owner", () => {
    const directory = reminders.buildUserDirectory([
      {
        displayName: "Jane Sales",
        email: "jane.sales@priorityautomotive.com",
        isActive: true,
      },
      {
        displayName: "Disabled User",
        email: "disabled@priorityautomotive.com",
        isActive: false,
      },
    ]);

    expect(
      reminders.resolveRecipient(
        { salespersonEmail: "direct@priorityautomotive.com", salesperson: "Jane Sales" },
        directory,
      ),
    ).toEqual({ email: "direct@priorityautomotive.com", source: "salespersonEmail" });

    expect(
      reminders.resolveRecipient(
        { salesperson: "Jane Sales", createdByEmail: "owner@priorityautomotive.com" },
        directory,
      ),
    ).toEqual({ email: "jane.sales@priorityautomotive.com", source: "users.displayName" });

    expect(
      reminders.resolveRecipient(
        { salesperson: "Unknown", createdByEmail: "owner@priorityautomotive.com" },
        directory,
      ),
    ).toEqual({ email: "owner@priorityautomotive.com", source: "createdByEmail" });
  });

  it("falls back instead of guessing when display names are ambiguous", () => {
    const directory = reminders.buildUserDirectory([
      { displayName: "Sam Sales", email: "sam.one@priorityautomotive.com" },
      { displayName: "Sam Sales", email: "sam.two@priorityautomotive.com" },
    ]);

    expect(
      reminders.resolveRecipient(
        { salesperson: "Sam Sales", createdByEmail: "owner@priorityautomotive.com" },
        directory,
      ),
    ).toEqual({ email: "owner@priorityautomotive.com", source: "createdByEmail" });
  });

  it("builds reminder bodies with the order link and stop condition", () => {
    const reminder = reminders.buildReminder(
      {
        id: "order-123",
        customerName: "Alex Buyer",
        year: "2026",
        model: "RX 350",
        modelNumber: "9444",
        status: "Factory Order",
        dealNumber: "D123",
      },
      { email: "sales@priorityautomotive.com", source: "createdByEmail" },
      "https://tracker.example.com/",
    );

    expect(reminder.subject).toContain("Alex Buyer");
    expect(reminder.textBody).toContain("This reminder stops automatically");
    expect(reminder.orderUrl).toBe("https://tracker.example.com/#/orders?scrollTo=order-123");
  });
});

describe("unsecured reminder route flag", () => {
  it("returns 503 when reminders are disabled", async () => {
    delete process.env.UNSECURED_REMINDERS_ENABLED;
    delete process.env.UNSECURED_REMINDER_KEY;
    delete require.cache[require.resolve("../index.cjs")];
    const app = require("../index.cjs");

    const res = await request(app).post("/jobs/unsecured-order-reminders").send({});
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/not enabled/i);
  });

  it("rejects enabled reminder job calls without the secret key", async () => {
    process.env.UNSECURED_REMINDERS_ENABLED = "true";
    process.env.UNSECURED_REMINDER_KEY = "expected-key";
    delete require.cache[require.resolve("../index.cjs")];
    const app = require("../index.cjs");

    const res = await request(app).post("/jobs/unsecured-order-reminders").send({
      action: "due",
    });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/unauthorized/i);

    delete process.env.UNSECURED_REMINDERS_ENABLED;
    delete process.env.UNSECURED_REMINDER_KEY;
  });
});
