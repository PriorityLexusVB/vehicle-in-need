/**
 * CallDrip aggregator — pure-function + routing tests.
 *
 * Covers field extraction, aggregation, and the feature-flag toggle.
 * Does NOT exercise Firestore — that's covered by smoke tests against
 * the deployed Cloud Run instance.
 */

import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";

process.env.VITEST = "true";

const agg = require("../src/handlers/calldripAggregate.cjs")._testing;

describe("calldripAggregate — field extraction", () => {
  it("normName collapses whitespace and lowercases", () => {
    expect(agg.normName("  Jeff   Waugh  ")).toBe("jeff waugh");
    expect(agg.normName("")).toBe("");
    expect(agg.normName(null as any)).toBe("");
  });

  it("toETDateString renders stable ET date", () => {
    expect(agg.toETDateString("2026-04-22T04:30:00Z")).toBe("2026-04-22");
    // 2:30 AM UTC → 10:30 PM ET prior day
    expect(agg.toETDateString("2026-04-22T02:30:00Z")).toBe("2026-04-21");
  });

  it("extractAgentName walks multiple shapes", () => {
    expect(agg.extractAgentName({ agent: "Jeff Waugh" })).toBe("Jeff Waugh");
    expect(agg.extractAgentName({ agent: { name: "Jane Doe" } })).toBe("Jane Doe");
    expect(agg.extractAgentName({ scoredAgent: "John Roe" })).toBe("John Roe");
    expect(agg.extractAgentName({ call: { agent: "Kim Li" } })).toBe("Kim Li");
    expect(agg.extractAgentName({ call: { agent_name: "Al Green" } })).toBe("Al Green");
    expect(agg.extractAgentName({})).toBe("");
  });

  it("extractEventDate walks multiple shapes", () => {
    expect(agg.extractEventDate({ call: { date_received: "2026-04-22T15:00:00Z" } })).toBe("2026-04-22");
    expect(agg.extractEventDate({ occurred_at: "2026-04-22T15:00:00Z" })).toBe("2026-04-22");
    expect(agg.extractEventDate({ created_at: "2026-04-22T15:00:00Z" })).toBe("2026-04-22");
    expect(agg.extractEventDate({})).toBe(null);
  });

  it("isOutbound / isInbound classify leadtype", () => {
    expect(agg.isOutbound({ leadtype: "Outbound" })).toBe(true);
    expect(agg.isInbound({ leadtype: "Inbound" })).toBe(true);
    // Missing leadtype defaults to inbound
    expect(agg.isInbound({})).toBe(true);
    expect(agg.isOutbound({})).toBe(false);
  });

  it("hasAppointment + hasFollowup + getResponseTimeSec", () => {
    expect(agg.hasAppointment({ appointmentDate: "2026-04-23" })).toBe(true);
    expect(agg.hasAppointment({ appointment_date: "" })).toBe(false);
    expect(agg.hasFollowup({ coachNotes: "follow up next week" })).toBe(true);
    expect(agg.hasFollowup({ coach_notes: "   " })).toBe(false);
    expect(agg.getResponseTimeSec({ responseTime: 42 })).toBe(42);
    expect(agg.getResponseTimeSec({ response_time: 0 })).toBe(0);
  });
});

describe("calldripAggregate — grouping", () => {
  it("groups events by (agentLower, etDate)", () => {
    const docs = [
      {
        ref: { id: "a" },
        data: () => ({
          payload: {
            agent: "Jeff Waugh",
            leadtype: "Inbound",
            occurred_at: "2026-04-22T15:00:00Z",
            appointmentDate: "2026-04-23",
            responseTime: 10,
          },
        }),
      },
      {
        ref: { id: "b" },
        data: () => ({
          payload: {
            agent: "JEFF  WAUGH",
            leadtype: "Outbound",
            occurred_at: "2026-04-22T16:30:00Z",
            responseTime: 20,
          },
        }),
      },
      {
        ref: { id: "c" },
        data: () => ({
          payload: {
            agent: "Jane Doe",
            leadtype: "Inbound",
            occurred_at: "2026-04-22T17:00:00Z",
          },
        }),
      },
      {
        ref: { id: "d-noagent" },
        data: () => ({
          payload: { leadtype: "Inbound", occurred_at: "2026-04-22T18:00:00Z" },
        }),
      },
    ];

    const { groups, eventRefs, unmatchedNoAgent, unmatchedNoDate } = agg.aggregateEvents(docs);
    expect(groups.size).toBe(2);
    const jeff = groups.get("jeff waugh|2026-04-22");
    expect(jeff).toBeDefined();
    expect(jeff.agg.leads_worked).toBe(2);
    expect(jeff.agg.calls_made).toBe(1);
    expect(jeff.agg.calls_received).toBe(1);
    expect(jeff.agg.appts_set).toBe(1);
    expect(jeff.agg.response_count).toBe(2);
    expect(jeff.agg.response_sum_sec).toBe(30);
    expect(unmatchedNoAgent).toBe(1);
    expect(unmatchedNoDate).toBe(0);
    expect(eventRefs.length).toBe(4);
  });
});

describe("calldripAggregate — feature flag", () => {
  let app: any;
  beforeAll(() => {
    delete process.env.CALLDRIP_ENABLE_AGGREGATE;
    delete require.cache[require.resolve("../index.cjs")];
    app = require("../index.cjs");
  });

  it("POST /jobs/calldrip-aggregate returns 503 when disabled", async () => {
    const res = await request(app).post("/jobs/calldrip-aggregate").send({});
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/not enabled/i);
  });
});
