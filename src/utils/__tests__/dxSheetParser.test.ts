import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DX_WORKBOOK_SOURCES,
  DxSchemaError,
  fetchDxSheet,
  parseDxCsv,
  parseDxCsvWithMetadata,
} from "../dxSheetParser";

const CURRENT_HEADER = [
  "DATE", "YEAR", "MODEL #", "DESCRIPTION", "CC", "COLOR",
  "VIN (INCOMING)", "TRADING DEALER", "DEALER CODE", "STOCK #",
  "DX FEE", "OURS | THEIRS", "SALES CONSULTTANT", "OUTGOING STOCK#",
  "VIN (OUTGOING)", "MODEL #", "A SWAP?",
].join(",");

const LEGACY_HEADER = [
  "DATE", "YEAR", "MODEL #", "DESCRIPTION", "CC", "COLOR", "VIN",
  "TRADING DEALER", "DEALER CODE", "STOCK #", "DX FEE", "OURS | THEIRS",
  "SALES CONSULTTANT", "OUTGOING STOCK#", "MODEL #", "A SWAP?", "",
  "Notes: VIN OUT",
].join(",");

describe("DX schema-aware parsing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps the 2026 schema and records explicit source evidence", () => {
    const csv = `${CURRENT_HEADER}\n1/2,26,9353,TX350,89,WHITE,2T2ADCAZ0TC123456,RICHMOND,64507,A100,$500,OURS,Alex,B200,2T2ADCAZ1TC654321,9411,Y`;
    const result = parseDxCsvWithMetadata(csv, DX_WORKBOOK_SOURCES[2026]);
    const trade = result.trades[0];

    expect(result.schema).toBe("CURRENT_2026");
    expect(trade).toMatchObject({
      date: "2026-01-02",
      year: "2026",
      vinIncoming: "2T2ADCAZ0TC123456",
      vinOutgoing: "2T2ADCAZ1TC654321",
      outgoingModelNumber: "9411",
      direction: "OURS",
      directionMeaning: "REQUESTED_BY_US",
      completed: true,
      sourceYear: 2026,
      sourceWorkbookId: DX_WORKBOOK_SOURCES[2026].workbookId,
      sourceTabName: "2026 DX",
      sourceRowNumber: 2,
      sourceSchema: "CURRENT_2026",
      sourceDataKind: "FULL_ROW",
      isSwap: true,
    });
    expect(trade.id).toBe("dx-2026-stock-A100");
    expect(trade.sourceFingerprint).toMatch(/^[a-f0-9]{16}$/);
    expect(trade.sourceRowUrl).toContain("#gid=0&range=A2:R2");
  });

  it("maps legacy outgoing model and recovers a validated notes VIN", () => {
    const csv = `${LEGACY_HEADER}\n12/30,26,9835,NX350,223,CAVIAR,2T2ADCAZ0SC123456,CLASSIC LEXUS,63404,A200,,THEIRS,,B300,9836,YES,,2T2ADCAZ1SC654321`;
    const trade = parseDxCsv(csv, DX_WORKBOOK_SOURCES[2025])[0];

    expect(trade).toMatchObject({
      date: "2025-12-30",
      year: "2026",
      vinOutgoing: "2T2ADCAZ1SC654321",
      outgoingModelNumber: "9836",
      directionMeaning: "REQUESTED_BY_THEM",
      isSwap: true,
      sourceSchema: "LEGACY_2024_2025",
    });
  });

  it("uses sourceYear for M/D dates and reports malformed row values", () => {
    const csv = `${CURRENT_HEADER}\n4//28,2,9353,TX350,89,WHITE,SHORT,RICHMOND,64507,,0,MAYBE,,,,9411,`;
    const trade = parseDxCsv(csv, DX_WORKBOOK_SOURCES[2024])[0];

    expect(trade.date).toBe("4//28");
    expect(trade.year).toBe("2");
    expect(trade.direction).toBe("");
    expect(trade.directionMeaning).toBe("UNKNOWN");
    expect(trade.issues).toEqual(expect.arrayContaining([
      "INVALID_DATE",
      "INVALID_MODEL_YEAR",
      "INVALID_DIRECTION",
      "MISSING_STOCK_NUMBER",
      "INVALID_INCOMING_VIN",
    ]));
  });

  it("rejects annotation-only rows without silently counting a completed exchange", () => {
    const csv = [
      CURRENT_HEADER,
      ",,,,,,TIED TO 26LVX11260,TIED TO 26LVX11260,,,,THEIRS,,,,,",
    ].join("\n");

    const result = parseDxCsvWithMetadata(csv, DX_WORKBOOK_SOURCES[2026]);

    expect(result.trades).toEqual([]);
    expect(result.rejectedRows).toEqual([expect.objectContaining({
      sourceRowNumber: 2,
      reason: "MISSING_VEHICLE_EVIDENCE",
    })]);
    expect(result.rejectedRows[0].sourceRowUrl).toContain("range=A2:R2");
    expect(result.rejectedRows[0].sourceFingerprint).toMatch(/^[a-f0-9]{16}$/);
  });

  it("keeps a vehicle record with a missing date so source quality remains visible", () => {
    const csv = `${CURRENT_HEADER}\n,,9353,TX350,89,WHITE,,RICHMOND,64507,,,THEIRS,,,,9411,`;
    const result = parseDxCsvWithMetadata(csv, DX_WORKBOOK_SOURCES[2026]);

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]).toMatchObject({
      date: "",
      modelNumber: "9353",
      directionMeaning: "REQUESTED_BY_THEM",
    });
    expect(result.trades[0].issues).toContain("MISSING_DATE");
    expect(result.rejectedRows).toEqual([]);
  });

  it("keeps a content fallback id stable when its spreadsheet row moves", () => {
    const target = "1/2,26,9353,TX350,89,WHITE,2T2ADCAZ0TC123456,RICHMOND,64507,,0,OURS,,,,9411,";
    const inserted = "1/1,26,9411,RX350,1L1,GRAY,2T2ADCAZ0TC000001,OTHER,60000,Z1,0,THEIRS,,,,9000,";
    const before = parseDxCsv(`${CURRENT_HEADER}\n${target}`)[0];
    const after = parseDxCsv(`${CURRENT_HEADER}\n${inserted}\n${target}`)[1];

    expect(after.sourceRowNumber).toBe(before.sourceRowNumber + 1);
    expect(after.id).toBe(before.id);
    expect(after.id).toMatch(/^dx-2026-fingerprint-/);
  });

  it("parses quoted commas and newlines without shifting columns", () => {
    const csv = `${CURRENT_HEADER}\n1/2,26,9353,"TX350, AWD",89,"WHITE\nPEARL",2T2ADCAZ0TC123456,RICHMOND,64507,A100,0,OURS,,,,9411,`;
    const trade = parseDxCsv(csv)[0];
    expect(trade.description).toBe("TX350, AWD");
    expect(trade.color).toBe("WHITE\nPEARL");
    expect(trade.dealerCode).toBe("64507");
  });

  it("throws a specific schema error instead of treating HTML or bad headers as empty data", () => {
    expect(() => parseDxCsv("<html><body>Sign in</body></html>"))
      .toThrow(DxSchemaError);
    expect(() => parseDxCsv("DATE,YEAR,MODEL #\n1/2,26,9353"))
      .toThrow(/missing required headers/i);
    expect(() => parseDxCsv(`${CURRENT_HEADER}\n"unterminated`))
      .toThrow(/unterminated quoted field/i);
  });

  it("rejects an HTML fetch response before parsing it as DX data", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { get: () => "text/html; charset=utf-8" },
      text: async () => "<html><body>Sign in</body></html>",
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchDxSheet()).rejects.toThrow(/unexpected content type/i);
  });

  it("passes the abort signal through the current-source request", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { get: () => "text/csv" },
      text: async () => `${CURRENT_HEADER}\n1/2,26,9353,TX350,89,WHITE,2T2ADCAZ0TC123456,RICHMOND,64507,A100,0,OURS,,,,9411,`,
    });
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    const trades = await fetchDxSheet(DX_WORKBOOK_SOURCES[2026], { signal: controller.signal });

    expect(trades).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), { signal: controller.signal });
  });
});
