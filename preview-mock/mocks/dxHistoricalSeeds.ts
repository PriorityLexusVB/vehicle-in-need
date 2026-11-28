/**
 * Preview-only stand-in for src/data/dxHistoricalSeeds.ts.
 *
 * The real file carries Priority's actual 2024/2025 dealer-exchange history
 * (partner dealers, dates, models). That is confidential and must not ship in
 * a public preview, so the mock build aliases it to this file: same types and
 * export, fictional dealers and generated rows only.
 */

export type HistoricalDxDirection = "OURS" | "THEIRS" | "";

export type HistoricalDxSeed = readonly [
  sourceRow: number,
  sourceFingerprint: string,
  date: string,
  vehicleYear: string,
  modelNumber: string,
  description: string,
  colorCode: string,
  color: string,
  tradingDealer: string,
  dealerCode: string,
  direction: HistoricalDxDirection,
  outgoingModelNumber: string,
  isSwap: boolean,
];

export interface HistoricalDxSource {
  sourceYear: 2024 | 2025;
  workbookId: string;
  workbookTitle: string;
  sheetName: string;
  sheetId: "0";
  latestBusinessDate: string;
  records: readonly HistoricalDxSeed[];
}

const DEALERS: ReadonlyArray<readonly [string, string]> = [
  ["HARBORVIEW", "70101"],
  ["BAYSIDE", "70102"],
  ["RIVERBEND", "70103"],
  ["OAK HOLLOW", "70104"],
  ["SUMMIT RIDGE", "70105"],
  ["CEDAR POINT", "70106"],
  ["MAPLE GROVE", "70107"],
  ["LAKESHORE", "70108"],
  ["PINECREST", "70109"],
  ["WESTFIELD", "70110"],
  ["NORTHGATE", "70111"],
  ["STONEBRIDGE", "70112"],
];

const MODELS: ReadonlyArray<readonly [string, string, string, string]> = [
  ["9411", "RX350", "1L2", "IRIDIUM"],
  ["9453", "RX350H", "085", "WHITE"],
  ["9353", "TX350", "08X5", "BLUE"],
  ["9702", "GX550", "0223", "CAVIAR"],
  ["9857", "NX350H", "01L1", "GRAY"],
  ["9025", "ES350H", "01J7", "SILVER"],
];

function generate(year: 2024 | 2025): HistoricalDxSeed[] {
  const rows: HistoricalDxSeed[] = [];
  const yy = String(year).slice(-2);
  let row = 2;
  for (let month = 1; month <= 12; month++) {
    const perMonth = 2 + ((month + year) % 3);
    for (let i = 0; i < perMonth; i++) {
      const dealer = DEALERS[(month * 5 + i * 7 + year) % DEALERS.length];
      const model = MODELS[(month + i) % MODELS.length];
      const direction: HistoricalDxDirection = (month + i) % 3 === 0 ? "THEIRS" : "OURS";
      const day = 2 + ((i * 9 + month) % 26);
      rows.push([
        row,
        `preview${year}${String(row).padStart(8, "0")}`,
        `${month}/${day}`,
        yy,
        model[0],
        model[1],
        model[2],
        model[3],
        dealer[0],
        dealer[1],
        direction,
        direction === "OURS" ? MODELS[(month + i + 2) % MODELS.length][0] : "",
        false,
      ]);
      row += 1;
    }
  }
  return rows;
}

export const DX_HISTORICAL_SOURCES: readonly HistoricalDxSource[] = [
  {
    sourceYear: 2024,
    workbookId: "preview-2024-workbook",
    workbookTitle: "2024 DX (preview sample)",
    sheetName: "2024 DX",
    sheetId: "0",
    latestBusinessDate: "2024-12-30",
    records: generate(2024),
  },
  {
    sourceYear: 2025,
    workbookId: "preview-2025-workbook",
    workbookTitle: "2025 DX (preview sample)",
    sheetName: "2025 DX",
    sheetId: "0",
    latestBusinessDate: "2025-12-30",
    records: generate(2025),
  },
];
