import { describe, expect, it } from "vitest";
import type { DxRejectedRowEvidence, DxTrade } from "../dxSheetParser";
import {
  beginDxRefresh,
  completeDxRefresh,
  createDxFeedState,
  failDxRefresh,
  latestDxBusinessDate,
} from "../dxFeedState";

function trade(id: string, date: string): DxTrade {
  return {
    id,
    date,
    direction: "OURS",
  } as DxTrade;
}

describe("DX feed state", () => {
  it("separates fetch time from the latest business-record date", () => {
    const historical = [trade("2024-a", "2024-12-30")];
    const completedAt = new Date("2026-08-29T16:00:00Z");
    const state = completeDxRefresh(
      createDxFeedState(historical),
      [trade("2026-a", "2026-08-26"), trade("2026-b", "")],
      completedAt,
    );

    expect(state.status).toBe("current");
    expect(state.lastSuccessAt).toEqual(completedAt);
    expect(state.latestBusinessDate).toBe("2026-08-26");
    expect(state.trades.map((row) => row.id)).toEqual(["2026-a", "2024-a", "2026-b"]);
  });

  it("retains transparent rejected-row evidence across syncing and stale states", () => {
    const rejected: DxRejectedRowEvidence = {
      sourceYear: 2026,
      sourceRowNumber: 67,
      sourceRowUrl: "https://example.test/row-67",
      sourceFingerprint: "1234567890abcdef",
      reason: "MISSING_VEHICLE_EVIDENCE",
    };
    const current = completeDxRefresh(
      createDxFeedState(),
      [trade("live", "2026-08-26")],
      new Date("2026-08-29T16:00:00Z"),
      [rejected],
    );

    expect(current.rejectedRows).toEqual([rejected]);
    expect(beginDxRefresh(current, new Date()).rejectedRows).toEqual([rejected]);
    expect(failDxRefresh(current, "Timed out", new Date()).rejectedRows).toEqual([rejected]);
  });

  it("shows syncing without discarding the last successful rows", () => {
    const current = completeDxRefresh(
      createDxFeedState(),
      [trade("live", "2026-08-26")],
      new Date("2026-08-29T16:00:00Z"),
    );
    const syncing = beginDxRefresh(current, new Date("2026-08-29T16:05:00Z"));

    expect(syncing.status).toBe("syncing");
    expect(syncing.trades).toHaveLength(1);
    expect(syncing.error).toBeNull();
  });

  it("marks a failed warm refresh stale and retains the prior live rows", () => {
    const current = completeDxRefresh(
      createDxFeedState([trade("history", "2025-12-30")]),
      [trade("live", "2026-08-26")],
      new Date("2026-08-29T16:00:00Z"),
    );
    const stale = failDxRefresh(current, "Timed out", new Date("2026-08-29T16:05:00Z"));

    expect(stale.status).toBe("stale");
    expect(stale.trades.map((row) => row.id)).toEqual(["live", "history"]);
    expect(stale.error).toBe("Timed out");
  });

  it("marks a failed cold refresh as source error while keeping history visible", () => {
    const failed = failDxRefresh(
      createDxFeedState([trade("history", "2025-12-30")]),
      "Malformed source",
      new Date("2026-08-29T16:05:00Z"),
    );

    expect(failed.status).toBe("source-error");
    expect(failed.trades.map((row) => row.id)).toEqual(["history"]);
  });

  it("uses NO DATA only for a valid empty current feed", () => {
    const state = completeDxRefresh(
      createDxFeedState([trade("history", "2025-12-30")]),
      [],
      new Date("2026-08-29T16:00:00Z"),
    );

    expect(state.status).toBe("no-data");
    expect(state.lastSuccessAt).not.toBeNull();
    expect(state.trades).toHaveLength(1);
  });

  it("ignores malformed dates when determining the latest business date", () => {
    expect(latestDxBusinessDate([
      trade("bad", "4//28"),
      trade("good", "2025-01-02"),
      trade("latest", "2026-08-26"),
    ])).toBe("2026-08-26");
  });
});
