/**
 * DX Sheet Parser — fetches and parses the dealer exchange Google Sheet.
 *
 * Sheet: https://docs.google.com/spreadsheets/d/1OGBQ_4TRJB54ipPr5h-eAOjfLxLuY6EuchxSI3dWE7E
 * Must be shared as "Anyone with the link can view".
 */

const SHEET_ID = "1OGBQ_4TRJB54ipPr5h-eAOjfLxLuY6EuchxSI3dWE7E";
const GID = "0";
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${GID}`;

export interface DxTrade {
  id: string;
  date: string;
  year: string;
  modelNumber: string;
  description: string;
  colorCode: string;
  color: string;
  vinIncoming: string;
  tradingDealer: string;
  dealerCode: string;
  stockNumber: string;
  dxFee: string;
  direction: "OURS" | "THEIRS" | "";
  salesConsultant: string;
  outgoingStock: string;
  vinOutgoing: string;
  outgoingModelNumber: string;
  isSwap: boolean;
}

/**
 * Parse a single CSV line respecting quoted fields.
 * Handles commas inside quoted strings and escaped quotes.
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

/**
 * Normalize a 2-digit year like "26" to "2026", or pass through "2026".
 */
function normalizeYear(raw: string): string {
  const trimmed = raw.trim();
  if (/^\d{2}$/.test(trimmed)) {
    return `20${trimmed}`;
  }
  return trimmed;
}

/**
 * Normalize date like "1/2" to "2026-01-02".
 * Uses current calendar year, not the vehicle model year.
 */
function normalizeDate(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const parts = trimmed.split("/");
  if (parts.length === 2) {
    const month = parts[0].padStart(2, "0");
    const day = parts[1].padStart(2, "0");
    const calendarYear = new Date().getFullYear();
    return `${calendarYear}-${month}-${day}`;
  }
  return trimmed;
}

/**
 * Parse CSV text from the DX Google Sheet into structured DxTrade objects.
 */
export function parseDxCsv(csvText: string): DxTrade[] {
  const lines = csvText.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];

  // Skip header row
  const dataLines = lines.slice(1);
  const trades: DxTrade[] = [];

  for (let lineIndex = 0; lineIndex < dataLines.length; lineIndex++) {
    const fields = parseCsvLine(dataLines[lineIndex]);
    const date = fields[0] ?? "";
    const year = fields[1] ?? "";
    const modelNumber = fields[2] ?? "";
    const description = fields[3] ?? "";
    const vinIncoming = fields[6] ?? "";
    const stockNumber = fields[9] ?? "";

    // Skip rows with no meaningful data
    if (!date && !modelNumber && !description && !vinIncoming) continue;

    // Skip correction/error rows
    const tradingDealer = fields[7] ?? "";
    if (tradingDealer.toUpperCase().includes("CORRECTING ERROR")) continue;

    const direction = (fields[11] ?? "").toUpperCase().trim();

    trades.push({
      id: stockNumber || `dx-row-${lineIndex}`,
      date: normalizeDate(date),
      year: normalizeYear(year),
      modelNumber: modelNumber.trim(),
      description: description.trim(),
      colorCode: (fields[4] ?? "").trim(),
      color: (fields[5] ?? "").trim(),
      vinIncoming: vinIncoming.trim(),
      tradingDealer: tradingDealer.trim(),
      dealerCode: (fields[8] ?? "").trim(),
      stockNumber: stockNumber.trim(),
      dxFee: (fields[10] ?? "").replace(/[$,\s]/g, "").trim(),
      direction: direction === "OURS" ? "OURS" : direction === "THEIRS" ? "THEIRS" : "",
      salesConsultant: (fields[12] ?? "").trim(),
      outgoingStock: (fields[13] ?? "").trim(),
      vinOutgoing: (fields[14] ?? "").trim(),
      outgoingModelNumber: (fields[15] ?? "").trim(),
      isSwap: (fields[16] ?? "").trim().toUpperCase() === "Y",
    });
  }

  return trades;
}

/**
 * Fetch the DX sheet CSV from Google Sheets public endpoint.
 */
export async function fetchDxSheet(): Promise<DxTrade[]> {
  const response = await fetch(CSV_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch DX sheet: ${response.status} ${response.statusText}`);
  }
  const csvText = await response.text();
  return parseDxCsv(csvText);
}
