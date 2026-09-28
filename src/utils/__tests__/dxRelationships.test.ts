import { describe, expect, it } from "vitest";
import {
  aggregateDxRelationships,
  buildHistoricalDxTrades,
  filterDxNeedCandidates,
  getEligibleDxNeedCandidatesByModel,
} from "../dxRelationships";
import { getDxDirectionMeaning, type DxDirection, type DxTrade } from "../dxSheetParser";

function trade(overrides: Partial<DxTrade> & Pick<DxTrade, "id" | "date">): DxTrade {
  const direction: DxDirection = overrides.direction ?? "OURS";
  return {
    id: overrides.id,
    date: overrides.date,
    year: "2026",
    modelNumber: "9353",
    description: "TX350",
    colorCode: "89",
    color: "WHITE",
    vinIncoming: "2T2ADCAZ0TC123456",
    tradingDealer: "RICHMOND",
    dealerCode: "64507",
    stockNumber: overrides.id,
    dxFee: "",
    salesConsultant: "",
    outgoingStock: "",
    vinOutgoing: "",
    outgoingModelNumber: "",
    isSwap: false,
    sourceYear: 2026,
    sourceWorkbookId: "workbook",
    sourceWorkbookTitle: "Workbook",
    sourceTabName: "2026 DX",
    sourceGid: "0",
    sourceRowNumber: 2,
    sourceRowUrl: "https://example.test/row",
    sourceFingerprint: overrides.id.padEnd(16, "0").slice(0, 16),
    sourceSchema: "CURRENT_2026",
    sourceDataKind: "FULL_ROW",
    issues: [],
    ...overrides,
    direction,
    directionMeaning: getDxDirectionMeaning(direction),
    completed: true,
  };
}

describe("dealer relationship aggregation", () => {
  it("merges the Richmond code typo, aliases, and unique no-code name", () => {
    const relationships = aggregateDxRelationships([
      trade({ id: "a", date: "2026-01-01", tradingDealer: "RICHMOND", dealerCode: "64507", direction: "OURS" }),
      trade({ id: "b", date: "2026-02-01", tradingDealer: "RICHMOND", dealerCode: "65407", direction: "THEIRS" }),
      trade({ id: "c", date: "2026-03-01", tradingDealer: "Richmond", dealerCode: "", direction: "" }),
    ], { asOf: "2026-03-01" });

    expect(relationships).toHaveLength(1);
    expect(relationships[0]).toMatchObject({
      id: "code:64507",
      dealerCode: "64507",
      allTime: {
        totalCompleted: 3,
        vehiclesReceived: 3,
        vehiclesSent: 0,
        vehicleBalance: 3,
        oursRequested: 1,
        theirsRequested: 1,
        unknownInitiator: 1,
        lastActivity: "2026-03-01",
      },
    });
  });

  it("selects a deterministic descriptive display name for code aliases", () => {
    const relationship = aggregateDxRelationships([
      trade({ id: "a", date: "2026-01-01", tradingDealer: "LEXUS NN", dealerCode: "64531" }),
      trade({ id: "b", date: "2026-01-02", tradingDealer: "NEWPORT NEWS", dealerCode: "64531" }),
    ])[0];

    expect(relationship.displayName).toBe("NEWPORT NEWS");
    expect(relationship.aliases).toEqual(["LEXUS NN", "NEWPORT NEWS"]);
  });

  it("uses an inclusive injected 12-month boundary and excludes future rows", () => {
    const relationship = aggregateDxRelationships([
      trade({ id: "old", date: "2025-08-28", direction: "OURS" }),
      trade({ id: "start", date: "2025-08-29", direction: "OURS" }),
      trade({ id: "end", date: "2026-08-29", direction: "THEIRS" }),
      trade({ id: "future", date: "2026-08-30", direction: "OURS" }),
    ], { asOf: "2026-08-29" })[0];

    expect(relationship.recent12Months).toMatchObject({
      startDate: "2025-08-29",
      endDate: "2026-08-29",
      totalCompleted: 2,
      vehiclesReceived: 2,
      vehiclesSent: 0,
      vehicleBalance: 2,
      oursRequested: 1,
      theirsRequested: 1,
      lastActivity: "2026-08-29",
    });
    expect(relationship.history.map((item) => item.id)).toEqual([
      "future", "end", "start", "old",
    ]);
  });

  it("keeps distinct explicit dealer codes separate even when names match", () => {
    const relationships = aggregateDxRelationships([
      trade({ id: "a", date: "2026-01-01", tradingDealer: "SAME NAME", dealerCode: "60001" }),
      trade({ id: "b", date: "2026-01-02", tradingDealer: "SAME NAME", dealerCode: "60002" }),
    ]);
    expect(relationships.map((item) => item.id).sort()).toEqual(["code:60001", "code:60002"]);
  });

  it("merges the confirmed Rockville transposition into 61906", () => {
    const history = buildHistoricalDxTrades();
    const relationships = aggregateDxRelationships(history, { asOf: "2026-12-30" });
    const rockvilleRelationships = relationships.filter((relationship) => relationship.dealerCode === "61906");

    expect(rockvilleRelationships).toHaveLength(1);
    expect(relationships.find((relationship) => relationship.dealerCode === "51906")).toBeUndefined();
    expect(rockvilleRelationships[0]).toMatchObject({
      id: "code:61906",
      allTime: {
        totalCompleted: 13,
        oursRequested: 9,
        theirsRequested: 4,
      },
    });
  });

  it("counts vehicle movement independently from who requested the exchange", () => {
    const relationship = aggregateDxRelationships([
      trade({ id: "swap", date: "2026-01-01", direction: "OURS", outgoingModelNumber: "9840", isSwap: true }),
      trade({ id: "received-only", date: "2026-01-02", direction: "THEIRS" }),
      trade({
        id: "sent-only",
        date: "2026-01-03",
        direction: "OURS",
        modelNumber: "",
        description: "",
        vinIncoming: "",
        stockNumber: "",
        outgoingModelNumber: "9353",
      }),
    ])[0];

    expect(relationship.allTime).toMatchObject({
      totalCompleted: 3,
      vehiclesReceived: 2,
      vehiclesSent: 2,
      vehicleBalance: 0,
      oursRequested: 2,
      theirsRequested: 1,
    });
  });
});

describe("historical conversion and matching eligibility", () => {
  it("builds all sanitized records with fingerprint ids and source-year dates", () => {
    const history = buildHistoricalDxTrades();
    expect(history).toHaveLength(306);
    expect(history[0]).toMatchObject({
      id: "dx-2024-fingerprint-bafceaaf82518b64",
      date: "2024-09-02",
      sourceYear: 2024,
      sourceRowNumber: 2,
      sourceDataKind: "SANITIZED_HISTORY",
      sourceSchema: "LEGACY_2024_2025",
    });
    expect(history[0].sourceRowUrl).toContain("#gid=0&range=A2:R2");
    expect(new Set(history.map((item) => item.id)).size).toBe(306);
  });

  it("sanitizes the Germain Dublin dealer field without changing its source evidence", () => {
    const trade152 = buildHistoricalDxTrades().find((item) => (
      item.sourceYear === 2025 && item.sourceRowNumber === 152
    ));

    expect(trade152).toMatchObject({
      tradingDealer: "GERMAIN DUBLIN",
      dealerCode: "63401",
      sourceFingerprint: "e3d310358ac8145b",
    });
    const germainDublin = aggregateDxRelationships(buildHistoricalDxTrades(), { asOf: "2026-12-30" })
      .find((relationship) => relationship.dealerCode === "63401");
    expect(germainDublin?.displayName).not.toMatch(/^.{17}$/);
    expect(germainDublin?.aliases).not.toContain("2T2BBMCA5TC105539");
  });

  it("allows only OURS rows to match a vehicle we need", () => {
    const ours = trade({ id: "ours", date: "2026-01-01", direction: "OURS", description: "TX350" });
    const theirs = trade({ id: "theirs", date: "2026-01-02", direction: "THEIRS", description: "TX350" });
    const unknown = trade({ id: "unknown", date: "2026-01-03", direction: "", description: "TX350" });

    expect(filterDxNeedCandidates([ours, theirs, unknown])).toEqual([ours]);
    expect(getEligibleDxNeedCandidatesByModel([ours, theirs, unknown], "TX 350"))
      .toEqual([ours]);
  });
});
