import { afterEach, describe, expect, it } from "vitest";

const notifications = require("../src/handlers/orderNotifications.cjs")._testing;
const reminders = require("../src/handlers/unsecuredOrderReminders.cjs")._testing;

function reqWith(headers: Record<string, string>) {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  return { get: (name: string) => lower[name.toLowerCase()] };
}

const cases = [
  {
    name: "orderNotifications",
    isAuthorized: notifications.isAuthorized,
    envName: "ORDER_NOTIFICATION_KEY",
    headerName: "x-notification-key",
  },
  {
    name: "unsecuredOrderReminders",
    isAuthorized: reminders.isAuthorized,
    envName: "UNSECURED_REMINDER_KEY",
    headerName: "x-reminder-key",
  },
];

for (const c of cases) {
  describe(`${c.name} isAuthorized (shared job key)`, () => {
    afterEach(() => {
      delete process.env[c.envName];
    });

    it("accepts the correct key in its dedicated header, x-api-key, and Bearer", () => {
      process.env[c.envName] = "expected-key-123";
      expect(c.isAuthorized(reqWith({ [c.headerName]: "expected-key-123" }))).toBe(true);
      expect(c.isAuthorized(reqWith({ "x-api-key": "expected-key-123" }))).toBe(true);
      expect(c.isAuthorized(reqWith({ authorization: "Bearer expected-key-123" }))).toBe(true);
      expect(c.isAuthorized(reqWith({ authorization: "bearer expected-key-123" }))).toBe(true);
    });

    it("rejects a wrong key of the same length and of a different length", () => {
      process.env[c.envName] = "expected-key-123";
      expect(c.isAuthorized(reqWith({ [c.headerName]: "expected-key-124" }))).toBe(false);
      expect(c.isAuthorized(reqWith({ [c.headerName]: "nope" }))).toBe(false);
      expect(c.isAuthorized(reqWith({ authorization: "Bearer expected-key-1234" }))).toBe(false);
    });

    it("rejects when no key is sent or no key is configured", () => {
      process.env[c.envName] = "expected-key-123";
      expect(c.isAuthorized(reqWith({}))).toBe(false);
      delete process.env[c.envName];
      expect(c.isAuthorized(reqWith({ [c.headerName]: "anything" }))).toBe(false);
      expect(c.isAuthorized(reqWith({ [c.headerName]: "" }))).toBe(false);
    });
  });
}
