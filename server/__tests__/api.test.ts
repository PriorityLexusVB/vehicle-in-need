import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";

// Ensure vitest flag so server doesn't auto-listen
process.env.VITEST = "true";
process.env.DISABLE_VERTEX_AI = "true";

// Import after env flags
// eslint-disable-next-line @typescript-eslint/no-var-requires
const app = require("../index.cjs");

describe("API endpoints", () => {
  it("GET /health returns healthy", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.text.trim()).toBe("healthy");
  });

  it("GET /api/status returns expected shape", async () => {
    const res = await request(app).get("/api/status");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("healthy");
    expect(res.body).toHaveProperty("version");
    expect(res.body).toHaveProperty("buildTime");
    expect(res.body).toHaveProperty("nodeVersion");
  });

  it("POST /api/generate-email returns 503 when Vertex disabled", async () => {
    const res = await request(app)
      .post("/api/generate-email")
      .send({
        order: { id: "test", customerName: "Alice", status: "Factory Order" },
      });
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
  });
});
