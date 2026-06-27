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
    // CallDrip webhook real shape — first_name + last_name
    expect(
      agg.extractAgentName({
        agent: { first_name: "Ashley", last_name: "Terminello", email: "a@b.com" },
      }),
    ).toBe("Ashley Terminello");
    // Fallback to call.answered_by
    expect(
      agg.extractAgentName({ call: { answered_by: "Jeff Waugh" } }),
    ).toBe("Jeff Waugh");
    expect(agg.extractAgentName({})).toBe("");
  });

  it("extractAgentEmail reads webhook shape", () => {
    expect(
      agg.extractAgentEmail({
        agent: { first_name: "A", last_name: "B", email: "A@B.COM" },
      }),
    ).toBe("a@b.com");
    expect(agg.extractAgentEmail({ agent: {} })).toBe("");
    expect(agg.extractAgentEmail({})).toBe("");
  });

  it("extractAgentEmail treats the PII-redaction sentinel as absent (2026-06-27 fix)", () => {
    // Since v1.5.0 (e54a416) redactPii scrubs agent.email to "[REDACTED:EMAIL]"
    // before the doc is stored. extractAgentEmail MUST return "" for the sentinel
    // so grouping/matching fall through to the intact agent NAME (per-rep) instead
    // of keying every rep on the same redacted string (store-wide collapse).
    expect(agg.extractAgentEmail({ agent: { name: "Jeff Waugh", email: "[REDACTED:EMAIL]" } })).toBe("");
    expect(agg.extractAgentEmail({ agent: { name: "Jeff Waugh", email: "[redacted:email]" } })).toBe("");
    // Real emails (clean / API path) still pass through unchanged.
    expect(agg.extractAgentEmail({ agent: { email: "jeff.waugh@priorityautomotive.com" } }))
      .toBe("jeff.waugh@priorityautomotive.com");
  });

  it("extractEventDate walks multiple shapes", () => {
    // CallDrip webhook real shape — plain YYYY-MM-DD string, passed through
    expect(agg.extractEventDate({ call: { date_received: "2026-04-22" } })).toBe("2026-04-22");
    expect(agg.extractEventDate({ call: { date_received: "2026-04-22T15:00:00Z" } })).toBe("2026-04-22");
    expect(agg.extractEventDate({ occurred_at: "2026-04-22T15:00:00Z" })).toBe("2026-04-22");
    expect(agg.extractEventDate({ created_at: "2026-04-22T15:00:00Z" })).toBe("2026-04-22");
    expect(
      agg.extractEventDate({ scored_call: { created_at: "2026-04-22T15:00:00.000000Z" } }),
    ).toBe("2026-04-22");
    expect(agg.extractEventDate({})).toBe(null);
  });

  it("isOutbound classifies CallDrip webhook flags", () => {
    // Webhook integer flags
    expect(agg.isOutbound({ call: { outbound: 1 } })).toBe(true);
    expect(agg.isOutbound({ call: { outbound: 0, inbound: 0 } })).toBe(false);
    // Click-to-call without inbound is treated as outbound
    expect(agg.isOutbound({ call: { click_to_call: 1, outbound: 0, inbound: 0 } })).toBe(true);
    // Legacy string leadtype
    expect(agg.isOutbound({ leadtype: "Outbound" })).toBe(true);
    expect(agg.isOutbound({})).toBe(false);
  });

  it("hmsToSec parses HH:MM:SS", () => {
    expect(agg.hmsToSec("00:00:03")).toBe(3);
    expect(agg.hmsToSec("13:10:07")).toBe(13 * 3600 + 10 * 60 + 7);
    expect(agg.hmsToSec("bad")).toBe(0);
  });

  it("hasAppointment requires result~='appointment' or an appointmentDate (Wave A f664f65 — is_goal alone is NOT counted)", () => {
    // Wave A (f664f65) replaced the is_goal proxy with a result-based filter:
    // is_goal fires on ANY scorecard goal (e.g. a service scorecard), so it
    // over-counted. Appointments now require scored_call.result to include
    // "appointment", or an explicit appointmentDate field.
    expect(agg.hasAppointment({ scored_call: { result: "Appointment Set" } })).toBe(true);
    expect(agg.hasAppointment({ scored_call: { is_goal: 1 } })).toBe(false);
    expect(agg.hasAppointment({ scored_call: { is_goal: 0 } })).toBe(false);
    expect(agg.hasAppointment({ appointmentDate: "2026-04-23" })).toBe(true);
    expect(agg.hasAppointment({})).toBe(false);
  });

  it("extractAppointmentDateTime returns ISO for YYYY-MM-DD + HH:MM", () => {
    const iso = agg.extractAppointmentDateTime({
      scored_call: { appointmentDate: "2026-04-25", appointmentTime: "14:30" },
    });
    expect(iso).toMatch(/^2026-04-25T/);
    // Default 9 AM ET when no time given
    const iso2 = agg.extractAppointmentDateTime({
      scored_call: { appointmentDate: "2026-04-25" },
    });
    expect(iso2).toMatch(/^2026-04-25T13:00:00.000Z$/); // 9 AM EDT = 13:00 UTC
    // Missing → null
    expect(agg.extractAppointmentDateTime({ scored_call: { is_goal: 1 } })).toBe(null);
    expect(agg.extractAppointmentDateTime({})).toBe(null);
  });

  it("extractLeadName reads payload.lead", () => {
    expect(agg.extractLeadName({ lead: { first_name: "Sam", last_name: "Jones" } })).toBe("Sam Jones");
    expect(agg.extractLeadName({ lead: { name: "Acme Buyer" } })).toBe("Acme Buyer");
    expect(agg.extractLeadName({})).toBe("");
  });

  it("extractLeadPhone reads payload.lead.phone", () => {
    expect(agg.extractLeadPhone({ lead: { phone: "7575550123" } })).toBe("7575550123");
    expect(agg.extractLeadPhone({ call: { caller_number: "+15555550123" } })).toBe("+15555550123");
    expect(agg.extractLeadPhone({})).toBe("");
  });

  it("getResponseTimeSec uses HH:MM:SS delta on webhook shape", () => {
    expect(
      agg.getResponseTimeSec({
        call: { response_time: "13:10:07", origination_time: "13:10:04" },
      }),
    ).toBe(3);
    expect(
      agg.getResponseTimeSec({
        call: { response_time: "13:10:04", origination_time: "13:10:04" },
      }),
    ).toBe(0);
    // Legacy numeric
    expect(agg.getResponseTimeSec({ responseTime: 42 })).toBe(42);
    expect(agg.getResponseTimeSec({})).toBe(0);
  });

  it("isCountableEvent only accepts call_scored", () => {
    expect(agg.isCountableEvent({ type: "call_scored" })).toBe(true);
    expect(agg.isCountableEvent({ type: "scored_call" })).toBe(true);
    expect(agg.isCountableEvent({ type: "agent_presses_one" })).toBe(false);
    expect(agg.isCountableEvent({ type: "transcription_ready" })).toBe(false);
    // Unknown legacy shape: still countable
    expect(agg.isCountableEvent({})).toBe(true);
  });
});

describe("calldripAggregate — grouping", () => {
  it("groups CallDrip webhook events by (email, etDate)", () => {
    const docs = [
      {
        ref: { id: "a" },
        data: () => ({
          payload: {
            type: "call_scored",
            agent: { first_name: "Jeff", last_name: "Waugh", email: "jeff.waugh@priorityautomotive.com" },
            call: {
              inbound: 1,
              outbound: 0,
              date_received: "2026-04-22",
              response_time: "13:10:10",
              origination_time: "13:10:00",
            },
            scored_call: { is_goal: 1, note: "" },
          },
        }),
      },
      {
        ref: { id: "b" },
        data: () => ({
          payload: {
            type: "call_scored",
            agent: { first_name: "JEFF", last_name: "WAUGH", email: "JEFF.WAUGH@PRIORITYAUTOMOTIVE.COM" },
            call: {
              inbound: 0,
              outbound: 1,
              date_received: "2026-04-22",
              response_time: "14:00:20",
              origination_time: "14:00:00",
            },
          },
        }),
      },
      {
        ref: { id: "c" },
        data: () => ({
          payload: {
            type: "call_scored",
            agent: { first_name: "Jane", last_name: "Doe", email: "jane@x.com" },
            call: { inbound: 1, outbound: 0, date_received: "2026-04-22" },
          },
        }),
      },
      {
        ref: { id: "d-pressone" },
        data: () => ({
          payload: {
            type: "agent_presses_one",
            agent: {},
            call: { inbound: 1, date_received: "2026-04-22" },
          },
        }),
      },
      {
        ref: { id: "e-noagent" },
        data: () => ({
          payload: {
            type: "call_scored",
            agent: {},
            call: { inbound: 1, date_received: "2026-04-22" },
          },
        }),
      },
    ];

    const { groups, eventRefs, unmatchedNoAgent, skippedNotCountable } =
      agg.aggregateEvents(docs);
    expect(groups.size).toBe(2);
    const jeff = groups.get("jeff.waugh@priorityautomotive.com|2026-04-22");
    expect(jeff).toBeDefined();
    // leads_worked / calls_received removed from aggregate.
    // Wave A (f664f65, Fix #2): calls_made = UNION of outbound + inbound.
    // Jeff's fixtures: event "a" inbound + event "b" outbound = 2.
    expect(jeff.agg.calls_made).toBe(2);
    // Wave A: appts_set requires result~='appointment' or appointmentDate.
    // Event "a" has scored_call.is_goal:1 but no result/appointmentDate → 0.
    expect(jeff.agg.appts_set).toBe(0);
    expect(jeff.agg.response_count).toBe(2);
    expect(jeff.agg.response_sum_sec).toBe(30);
    expect(jeff.agg.appointments).toEqual([]); // no appointmentDate in fixtures
    expect(skippedNotCountable).toBe(1);
    expect(unmatchedNoAgent).toBe(1);
    expect(eventRefs.length).toBe(5);
  });

  it("groups by intact NAME (per-rep) when agent emails are PII-redacted (2026-06-27 fix)", () => {
    // Real production shape since v1.5.0: agent.email is redacted to the sentinel
    // on EVERY doc. Before the fix, repKey = (agentEmail || nameNorm) keyed every
    // rep on "[redacted:email]" -> ONE collapsed group -> store-wide
    // avg_response_sec. After the fix, extractAgentEmail returns "" for the
    // sentinel -> grouping falls back to the intact agent NAME -> correct per-rep.
    const docs = [
      {
        ref: { id: "r1" },
        data: () => ({
          payload: {
            type: "call_scored",
            agent: { first_name: "Jeff", last_name: "Waugh", email: "[REDACTED:EMAIL]" },
            call: { inbound: 1, outbound: 0, date_received: "2026-06-20", response_time: "13:10:10", origination_time: "13:10:00" },
          },
        }),
      },
      {
        ref: { id: "r2" },
        data: () => ({
          payload: {
            type: "call_scored",
            agent: { first_name: "Jane", last_name: "Doe", email: "[REDACTED:EMAIL]" },
            call: { inbound: 0, outbound: 1, date_received: "2026-06-20", response_time: "14:00:30", origination_time: "14:00:00" },
          },
        }),
      },
    ];
    const { groups } = agg.aggregateEvents(docs);
    // Two distinct reps -> two groups (NOT collapsed into one redacted-email group).
    expect(groups.size).toBe(2);
    const jeff = groups.get("jeff waugh|2026-06-20");
    const jane = groups.get("jane doe|2026-06-20");
    expect(jeff).toBeDefined();
    expect(jane).toBeDefined();
    // Per-rep response times stay SEPARATE (Jeff 10s, Jane 30s) — not averaged together.
    expect(jeff.agg.response_sum_sec).toBe(10);
    expect(jeff.agg.response_count).toBe(1);
    expect(jane.agg.response_sum_sec).toBe(30);
    expect(jane.agg.response_count).toBe(1);
    // Group's agentEmail is empty (sentinel treated as absent); name carries identity.
    expect(jeff.agentEmail).toBe("");
    expect(jeff.agentNameNorm).toBe("jeff waugh");
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
