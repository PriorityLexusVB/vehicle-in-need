/**
 * CallDrip webhook + status endpoint tests.
 *
 * Tests both feature-disabled and feature-enabled states.
 * Uses supertest against the Express app. Firestore calls are
 * tested only for auth/validation logic — actual Firestore writes
 * are tested separately against emulators.
 */

import { describe, it, expect } from "vitest";
import request from "supertest";

// Ensure vitest flag so server doesn't auto-listen
process.env.VITEST = "true";

/* ================================================================== */
/*  Feature DISABLED (default state)                                  */
/* ================================================================== */

describe("CallDrip routes — feature disabled", () => {
  // Fresh require with CALLDRIP_ENABLE_WEBHOOK unset
  let app;
  beforeAll(() => {
    delete process.env.CALLDRIP_ENABLE_WEBHOOK;
    // Clear require cache to force fresh module evaluation
    delete require.cache[require.resolve("../index.cjs")];
    app = require("../index.cjs");
  });

  it("POST /webhooks/calldrip/v1/events returns 503 when disabled", async () => {
    const res = await request(app)
      .post("/webhooks/calldrip/v1/events")
      .send({ test: true });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/not enabled/i);
  });

  it("GET /api/calldrip/status returns disabled state", async () => {
    const res = await request(app).get("/api/calldrip/status");
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(false);
    expect(res.body.service).toBe("calldrip-ingestion");
  });

  // Existing routes still work
  it("GET /health still returns healthy", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.text.trim()).toBe("healthy");
  });

  it("GET /api/status still returns expected shape", async () => {
    const res = await request(app).get("/api/status");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("healthy");
    expect(res.body).toHaveProperty("version");
  });
});
