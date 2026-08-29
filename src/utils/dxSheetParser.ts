/**
 * Dealer Exchange Google Sheet parsing.
 *
 * The canonical workbooks do not share one schema: the 2024/2025 tabs put
 * the outgoing model in column O and may put an outgoing VIN in a notes
 * column, while the 2026 tab added an explicit outgoing-VIN column. Header-
 * aware parsing prevents that schema change from silently shifting values.
 */

export type DxDirection = "OURS" | "THEIRS" | "";

export type DxDirectionMeaning =
  | "HELPED_US"
  | "WE_HELPED_THEM"
  | "UNKNOWN";

export type DxSchemaVersion = "LEGACY_2024_2025" | "CURRENT_2026";

export type DxSourceDataKind = "FULL_ROW" | "SANITIZED_HISTORY";

export type DxRowIssue =
  | "MISSING_DATE"
  | "INVALID_DATE"
  | "INVALID_MODEL_YEAR"
  | "INVALID_DIRECTION"
  | "MISSING_STOCK_NUMBER"
  | "MISSING_INCOMING_VIN"
  | "INVALID_INCOMING_VIN"
  | "INVALID_OUTGOING_VIN";

export interface DxSourceContext {
  sourceYear: number;
  workbookId: string;
  workbookTitle: string;
  tabName: string;
  gid: string;
}

export const DX_WORKBOOK_SOURCES = {
  2024: {
    sourceYear: 2024,
    workbookId: "1L4Vz_NW2hLziTkDPhOhCnSpQo1dIw3nuYuOi9M_7yac",
    workbookTitle: "2024 Inventory and DX Manifesto",
    tabName: "2024 DX",
    gid: "0",
  },
  2025: {
    sourceYear: 2025,
    workbookId: "135G-M7-I1wq0o1dUi0pVC3lOIO4h0Lhxqy6l-4BSmGU",
    workbookTitle: "2025 Inventory and DX Manifesto",
    tabName: "2025 DX",
    gid: "0",
  },
  2026: {
    sourceYear: 2026,
    workbookId: "1OGBQ_4TRJB54ipPr5h-eAOjfLxLuY6EuchxSI3dWE7E",
    workbookTitle: "2026 Inventory and DX Manifesto",
    tabName: "2026 DX",
    gid: "0",
  },
} as const satisfies Record<number, DxSourceContext>;

export const CURRENT_DX_SOURCE: DxSourceContext = DX_WORKBOOK_SOURCES[2026];

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
  direction: DxDirection;
  /** Confirmed relationship meaning of the source direction token. */
  directionMeaning: DxDirectionMeaning;
  /** Every row in the canonical DX logs is a completed exchange. */
  completed: true;
  salesConsultant: string;
  outgoingStock: string;
  vinOutgoing: string;
  outgoingModelNumber: string;
  isSwap: boolean;
  sourceYear: number;
  sourceWorkbookId: string;
  sourceWorkbookTitle: string;
  sourceTabName: string;
  sourceGid: string;
  /** One-based spreadsheet row, including the header as row 1. */
  sourceRowNumber: number;
  sourceRowUrl: string;
  /** One-way, content-derived evidence fingerprint; never derived from row alone. */
  sourceFingerprint: string;
  sourceSchema: DxSchemaVersion;
  sourceDataKind: DxSourceDataKind;
  issues: DxRowIssue[];
}

export interface DxParseResult {
  trades: DxTrade[];
  rejectedRows: DxRejectedRowEvidence[];
  schema: DxSchemaVersion;
  headers: string[];
  source: DxSourceContext;
}

export type DxRejectedRowReason =
  | "SOURCE_ANNOTATION"
  | "MISSING_VEHICLE_EVIDENCE";

export interface DxRejectedRowEvidence {
  sourceYear: number;
  sourceRowNumber: number;
  sourceRowUrl: string;
  sourceFingerprint: string;
  reason: DxRejectedRowReason;
}

export class DxSchemaError extends Error {
  readonly missingHeaders: string[];
  readonly observedHeaders: string[];

  constructor(
    message: string,
    missingHeaders: string[] = [],
    observedHeaders: string[] = [],
  ) {
    super(message);
    this.name = "DxSchemaError";
    this.missingHeaders = missingHeaders;
    this.observedHeaders = observedHeaders;
  }
}

interface DxColumnMap {
  date: number;
  year: number;
  incomingModel: number;
  description: number;
  colorCode: number;
  color: number;
  incomingVin: number;
  dealer: number;
  dealerCode: number;
  stock: number;
  fee: number;
  direction: number;
  consultant: number;
  outgoingStock: number;
  outgoingVin: number | null;
  outgoingModel: number;
  swap: number;
  notes: number | null;
}

interface DetectedSchema {
  version: DxSchemaVersion;
  columns: DxColumnMap;
}

function parseCsvRows(csvText: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index++) {
    const char = csvText[index];
    if (inQuotes) {
      if (char === '"') {
        if (csvText[index + 1] === '"') {
          field += '"';
          index++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field.trim());
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && csvText[index + 1] === "\n") index++;
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (inQuotes) {
    throw new DxSchemaError("DX CSV is malformed: unterminated quoted field.");
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    rows.push(row);
  }
  return rows;
}

function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function headerIndices(headers: string[], accepted: readonly string[]): number[] {
  const wanted = new Set(accepted);
  const matches: number[] = [];
  headers.forEach((header, index) => {
    if (wanted.has(normalizeHeader(header))) matches.push(index);
  });
  return matches;
}

function uniqueHeaderIndex(
  headers: string[],
  accepted: readonly string[],
  displayName: string,
  missing: string[],
): number {
  const matches = headerIndices(headers, accepted);
  if (matches.length === 0) {
    missing.push(displayName);
    return -1;
  }
  if (matches.length > 1) {
    throw new DxSchemaError(
      `DX CSV has an ambiguous ${displayName} header (${matches.length} matches).`,
      [],
      headers,
    );
  }
  return matches[0];
}

function detectSchema(headers: string[]): DetectedSchema {
  const missing: string[] = [];
  const modelIndices = headerIndices(headers, ["MODEL", "MODEL NUMBER"]);
  if (modelIndices.length < 2) missing.push("two MODEL # columns");

  const explicitOutgoingVin = headerIndices(headers, ["VIN OUTGOING"]);
  if (explicitOutgoingVin.length > 1) {
    throw new DxSchemaError(
      "DX CSV has more than one VIN (OUTGOING) header.",
      [],
      headers,
    );
  }

  const columns: DxColumnMap = {
    date: uniqueHeaderIndex(headers, ["DATE"], "DATE", missing),
    year: uniqueHeaderIndex(headers, ["YEAR"], "YEAR", missing),
    incomingModel: modelIndices[0] ?? -1,
    description: uniqueHeaderIndex(headers, ["DESCRIPTION"], "DESCRIPTION", missing),
    colorCode: uniqueHeaderIndex(headers, ["CC"], "CC", missing),
    color: uniqueHeaderIndex(headers, ["COLOR"], "COLOR", missing),
    incomingVin: uniqueHeaderIndex(
      headers,
      ["VIN", "VIN INCOMING"],
      "VIN / VIN (INCOMING)",
      missing,
    ),
    dealer: uniqueHeaderIndex(headers, ["TRADING DEALER"], "TRADING DEALER", missing),
    dealerCode: uniqueHeaderIndex(headers, ["DEALER CODE"], "DEALER CODE", missing),
    stock: uniqueHeaderIndex(headers, ["STOCK"], "STOCK #", missing),
    fee: uniqueHeaderIndex(headers, ["DX FEE"], "DX FEE", missing),
    direction: uniqueHeaderIndex(headers, ["OURS THEIRS"], "OURS | THEIRS", missing),
    consultant: uniqueHeaderIndex(
      headers,
      ["SALES CONSULTTANT", "SALES CONSULTANT"],
      "SALES CONSULTANT",
      missing,
    ),
    outgoingStock: uniqueHeaderIndex(
      headers,
      ["OUTGOING STOCK"],
      "OUTGOING STOCK#",
      missing,
    ),
    outgoingVin: explicitOutgoingVin[0] ?? null,
    outgoingModel: modelIndices[1] ?? -1,
    swap: uniqueHeaderIndex(headers, ["A SWAP", "SWAP"], "A SWAP?", missing),
    notes: headerIndices(headers, ["NOTES", "NOTES VIN OUT"])[0] ?? null,
  };

  if (missing.length > 0) {
    throw new DxSchemaError(
      `DX CSV is missing required header${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`,
      missing,
      headers,
    );
  }

  return {
    version: columns.outgoingVin === null ? "LEGACY_2024_2025" : "CURRENT_2026",
    columns,
  };
}

function validateSource(source: DxSourceContext): void {
  if (!Number.isInteger(source.sourceYear) || source.sourceYear < 1900 || source.sourceYear > 2200) {
    throw new DxSchemaError(`Invalid DX source year: ${source.sourceYear}.`);
  }
  if (!source.workbookId.trim() || !source.workbookTitle.trim() || !source.tabName.trim()) {
    throw new DxSchemaError("DX source workbook id, title, and tab name are required.");
  }
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year
    && candidate.getUTCMonth() === month - 1
    && candidate.getUTCDate() === day;
}

function formatIsoDate(year: number, month: number, day: number): string {
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

export function normalizeDxDate(raw: string, sourceYear: number): {
  value: string;
  issue: DxRowIssue | null;
} {
  const trimmed = raw.trim();
  if (!trimmed) return { value: "", issue: "MISSING_DATE" };

  const shortMatch = /^(\d{1,2})\/(\d{1,2})$/.exec(trimmed);
  if (shortMatch) {
    const month = Number(shortMatch[1]);
    const day = Number(shortMatch[2]);
    if (isValidCalendarDate(sourceYear, month, day)) {
      return { value: formatIsoDate(sourceYear, month, day), issue: null };
    }
  }

  const fullMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(trimmed);
  if (fullMatch) {
    const month = Number(fullMatch[1]);
    const day = Number(fullMatch[2]);
    const rawYear = Number(fullMatch[3]);
    const year = fullMatch[3].length === 2 ? 2000 + rawYear : rawYear;
    if (isValidCalendarDate(year, month, day)) {
      return { value: formatIsoDate(year, month, day), issue: null };
    }
  }

  return { value: trimmed, issue: "INVALID_DATE" };
}

function normalizeModelYear(raw: string): { value: string; invalid: boolean } {
  const trimmed = raw.trim();
  if (/^\d{2}$/.test(trimmed)) return { value: `20${trimmed}`, invalid: false };
  if (/^\d{4}$/.test(trimmed)) return { value: trimmed, invalid: false };
  return { value: trimmed, invalid: trimmed.length > 0 };
}

export function getDxDirectionMeaning(direction: DxDirection): DxDirectionMeaning {
  if (direction === "OURS") return "HELPED_US";
  if (direction === "THEIRS") return "WE_HELPED_THEM";
  return "UNKNOWN";
}

function normalizeDirection(raw: string): {
  direction: DxDirection;
  meaning: DxDirectionMeaning;
  invalid: boolean;
} {
  const normalized = raw.trim().toUpperCase();
  if (normalized === "OURS" || normalized === "THEIRS") {
    return {
      direction: normalized,
      meaning: getDxDirectionMeaning(normalized),
      invalid: false,
    };
  }
  return { direction: "", meaning: "UNKNOWN", invalid: normalized.length > 0 };
}

const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/i;

function extractVin(value: string): string {
  const exact = value.trim().toUpperCase();
  if (VIN_PATTERN.test(exact)) return exact;
  const match = exact.match(/(?:^|[^A-Z0-9])([A-HJ-NPR-Z0-9]{17})(?=$|[^A-Z0-9])/i);
  return match?.[1]?.toUpperCase() ?? "";
}

function normalizeIdentityPart(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function fnv1a(value: string, seed: number): string {
  let hash = seed;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function buildDxFingerprint(source: DxSourceContext, values: readonly string[]): string {
  const payload = [
    source.sourceYear.toString(),
    source.workbookId,
    source.tabName,
    ...values.map((value) => value.trim().toUpperCase()),
  ].join("\u001f");
  return `${fnv1a(payload, 0x811c9dc5)}${fnv1a(payload, 0x9e3779b9)}`;
}

function buildStableId(
  source: DxSourceContext,
  sourceFingerprint: string,
  stockNumber: string,
): string {
  const normalizedStock = normalizeIdentityPart(stockNumber);
  if (normalizedStock) return `dx-${source.sourceYear}-stock-${normalizedStock}`;
  return `dx-${source.sourceYear}-fingerprint-${sourceFingerprint}`;
}

export function buildDxSourceRowUrl(source: DxSourceContext, sourceRowNumber: number): string {
  return `https://docs.google.com/spreadsheets/d/${source.workbookId}/edit#gid=${source.gid}&range=A${sourceRowNumber}:R${sourceRowNumber}`;
}

function valueAt(row: string[], index: number | null): string {
  return index === null || index < 0 ? "" : (row[index] ?? "").trim();
}

/** Parse a DX CSV and return schema/provenance metadata with its trades. */
export function parseDxCsvWithMetadata(
  csvText: string,
  source: DxSourceContext = CURRENT_DX_SOURCE,
): DxParseResult {
  validateSource(source);
  const rows = parseCsvRows(csvText);
  if (rows.length === 0 || rows[0].every((value) => !value.trim())) {
    throw new DxSchemaError("DX CSV is empty or missing its header row.");
  }

  const headers = rows[0];
  const schema = detectSchema(headers);
  const { columns } = schema;
  const trades: DxTrade[] = [];
  const rejectedRows: DxRejectedRowEvidence[] = [];

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    if (row.every((value) => !value.trim())) continue;

    const rawDate = valueAt(row, columns.date);
    const rawModelYear = valueAt(row, columns.year);
    const modelNumber = valueAt(row, columns.incomingModel);
    const description = valueAt(row, columns.description);
    const vinIncoming = valueAt(row, columns.incomingVin).toUpperCase();
    const tradingDealer = valueAt(row, columns.dealer);
    const stockNumber = valueAt(row, columns.stock);
    const outgoingStock = valueAt(row, columns.outgoingStock);
    const outgoingModelNumber = valueAt(row, columns.outgoingModel);
    const rawOutgoingVin = columns.outgoingVin === null
      ? valueAt(row, columns.notes)
      : valueAt(row, columns.outgoingVin);
    const vinOutgoing = extractVin(rawOutgoingVin);
    const sourceFingerprint = buildDxFingerprint(source, row);
    const sourceRowNumber = rowIndex + 1;
    const sourceRowUrl = buildDxSourceRowUrl(source, sourceRowNumber);
    const rejectionReason: DxRejectedRowReason | null = tradingDealer
      .toUpperCase()
      .includes("CORRECTING ERROR")
      ? "SOURCE_ANNOTATION"
      : [
          modelNumber,
          description,
          VIN_PATTERN.test(vinIncoming) ? vinIncoming : "",
          stockNumber,
          outgoingStock,
          outgoingModelNumber,
          vinOutgoing,
        ].some(Boolean)
        ? null
        : "MISSING_VEHICLE_EVIDENCE";

    if (rejectionReason) {
      rejectedRows.push({
        sourceYear: source.sourceYear,
        sourceRowNumber,
        sourceRowUrl,
        sourceFingerprint,
        reason: rejectionReason,
      });
      continue;
    }

    const date = normalizeDxDate(rawDate, source.sourceYear);
    const modelYear = normalizeModelYear(rawModelYear);
    const direction = normalizeDirection(valueAt(row, columns.direction));
    const issues: DxRowIssue[] = [];

    if (date.issue) issues.push(date.issue);
    if (modelYear.invalid) issues.push("INVALID_MODEL_YEAR");
    if (direction.invalid) issues.push("INVALID_DIRECTION");
    if (!stockNumber) issues.push("MISSING_STOCK_NUMBER");
    if (!vinIncoming) issues.push("MISSING_INCOMING_VIN");
    else if (!VIN_PATTERN.test(vinIncoming)) issues.push("INVALID_INCOMING_VIN");
    if (rawOutgoingVin && !vinOutgoing) issues.push("INVALID_OUTGOING_VIN");

    trades.push({
      id: buildStableId(source, sourceFingerprint, stockNumber),
      date: date.value,
      year: modelYear.value,
      modelNumber,
      description,
      colorCode: valueAt(row, columns.colorCode),
      color: valueAt(row, columns.color),
      vinIncoming,
      tradingDealer,
      dealerCode: valueAt(row, columns.dealerCode),
      stockNumber,
      dxFee: valueAt(row, columns.fee).replace(/[$,\s]/g, ""),
      direction: direction.direction,
      directionMeaning: direction.meaning,
      completed: true,
      salesConsultant: valueAt(row, columns.consultant),
      outgoingStock,
      vinOutgoing,
      outgoingModelNumber,
      isSwap: /^(Y|YES|TRUE)$/i.test(valueAt(row, columns.swap)),
      sourceYear: source.sourceYear,
      sourceWorkbookId: source.workbookId,
      sourceWorkbookTitle: source.workbookTitle,
      sourceTabName: source.tabName,
      sourceGid: source.gid,
      sourceRowNumber,
      sourceRowUrl,
      sourceFingerprint,
      sourceSchema: schema.version,
      sourceDataKind: "FULL_ROW",
      issues,
    });
  }

  return {
    trades,
    rejectedRows,
    schema: schema.version,
    headers: [...headers],
    source: { ...source },
  };
}

/** Backwards-compatible trades-only parser used by existing app consumers. */
export function parseDxCsv(
  csvText: string,
  source: DxSourceContext = CURRENT_DX_SOURCE,
): DxTrade[] {
  return parseDxCsvWithMetadata(csvText, source).trades;
}

export function buildDxCsvUrl(source: DxSourceContext = CURRENT_DX_SOURCE): string {
  return `https://docs.google.com/spreadsheets/d/${source.workbookId}/gviz/tq?tqx=out:csv&gid=${source.gid}`;
}

export interface FetchDxSheetOptions {
  signal?: AbortSignal;
}

/** Fetch and validate the current public DX sheet with row-level evidence. */
export async function fetchDxSheetWithMetadata(
  source: DxSourceContext = CURRENT_DX_SOURCE,
  options: FetchDxSheetOptions = {},
): Promise<DxParseResult> {
  const response = await fetch(buildDxCsvUrl(source), { signal: options.signal });
  if (!response.ok) {
    throw new Error(`Failed to fetch DX sheet: ${response.status} ${response.statusText}`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (/text\/html|application\/xhtml\+xml/i.test(contentType)) {
    throw new DxSchemaError(`DX source returned unexpected content type: ${contentType}`);
  }
  const csvText = await response.text();
  if (/^\s*</.test(csvText)) {
    throw new DxSchemaError("DX source returned markup instead of CSV data");
  }
  return parseDxCsvWithMetadata(csvText, source);
}

/** Backwards-compatible trades-only fetch for existing utility consumers. */
export async function fetchDxSheet(
  source: DxSourceContext = CURRENT_DX_SOURCE,
  options: FetchDxSheetOptions = {},
): Promise<DxTrade[]> {
  return (await fetchDxSheetWithMetadata(source, options)).trades;
}
