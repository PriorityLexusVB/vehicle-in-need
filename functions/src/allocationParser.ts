/**
 * allocationParser.ts — Cloud Functions copy of the robust frontend parser.
 *
 * Duplicated from src/utils/allocationParser.ts so Cloud Functions can use it
 * without importing from the React frontend tree.
 *
 * Do NOT import anything from ../src/ or any browser/DOM APIs here.
 * This module must run cleanly in Node.js 20.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LexusAllocationReference {
  code: string;
  category: string;
  type: string;
  grade: string;
  engine: string;
  msrp: number;
  rank: string;
  profit: number;
}

export interface AllocationVehicle {
  id: string;
  code: string;
  model?: string;
  sourceCode?: string;
  quantity: number;
  color: string;
  interiorColor: string;
  bos: string;
  arrival: string;
  grade: string;
  engine: string;
  msrp: number;
  category: string;
  type: string;
  rank: string;
  profit: number;
  totalValue: number;
  factoryAccessories?: string[];
  postProductionOptions?: string[];
}

export interface AllocationSummary {
  units: number;
  value: number;
  hybridMix: number;
}

export interface ParsedAllocationResult {
  reportDate: string | null;
  vehicles: AllocationVehicle[];
  summary: AllocationSummary;
  itemCount: number;
  warnings: string[];
  errors: string[];
}

// ─── Reference Data ───────────────────────────────────────────────────────────

export const LEXUS_ALLOCATION_REFERENCE: Record<string, LexusAllocationReference> = {
  RX350: { code: "RX350", category: "Core", type: "SUV", grade: "Premium", engine: "Gas", msrp: 50525, rank: "High", profit: 4200 },
  RX500H: { code: "RX500H", category: "Core", type: "SUV Hybrid", grade: "F SPORT Performance", engine: "Hybrid", msrp: 66200, rank: "Critical", profit: 5600 },
  RX350H: { code: "RX350H", category: "Core", type: "SUV Hybrid", grade: "Premium", engine: "Hybrid", msrp: 52825, rank: "High", profit: 0 },
  "RX450H+": { code: "RX450H+", category: "Electrified", type: "PHEV SUV", grade: "Luxury", engine: "Hybrid", msrp: 65230, rank: "Medium", profit: 0 },
  NX350: { code: "NX350", category: "Core", type: "Compact SUV", grade: "Premium", engine: "Gas", msrp: 45425, rank: "High", profit: 3600 },
  NX350H: { code: "NX350H", category: "Core", type: "Compact SUV Hybrid", grade: "Luxury", engine: "Hybrid", msrp: 44775, rank: "High", profit: 3900 },
  "NX450H+": { code: "NX450H+", category: "Electrified", type: "PHEV SUV", grade: "Luxury", engine: "Hybrid", msrp: 57810, rank: "Medium", profit: 0 },
  TX350: { code: "TX350", category: "Growth", type: "Three-Row SUV", grade: "Premium", engine: "Gas", msrp: 56440, rank: "Critical", profit: 5200 },
  TX500H: { code: "TX500H", category: "Growth", type: "Three-Row SUV Hybrid", grade: "F SPORT Performance", engine: "Hybrid", msrp: 69960, rank: "Critical", profit: 6400 },
  GX550: { code: "GX550", category: "Strategic", type: "Body-on-Frame SUV", grade: "Overtrail", engine: "Gas", msrp: 66285, rank: "Critical", profit: 5900 },
  IS350: { code: "IS350", category: "Core", type: "Sport Sedan", grade: "F SPORT", engine: "Gas", msrp: 45500, rank: "Medium", profit: 3200 },
  LS500: { code: "LS500", category: "Flagship", type: "Luxury Sedan", grade: "Heritage Edition", engine: "Gas", msrp: 97830, rank: "High", profit: 7100 },
  LX600: { code: "LX600", category: "Flagship", type: "Luxury SUV", grade: "Luxury", engine: "Gas", msrp: 107000, rank: "High", profit: 8400 },
  LX700H: { code: "LX700H", category: "Flagship", type: "Luxury SUV Hybrid", grade: "Luxury", engine: "Hybrid", msrp: 115735, rank: "High", profit: 0 },
  RZ350E: { code: "RZ350E", category: "Electrified", type: "EV SUV", grade: "Premium", engine: "EV", msrp: 46000, rank: "Medium", profit: 0 },
  RZ450E: { code: "RZ450E", category: "Electrified", type: "EV SUV", grade: "Premium", engine: "EV", msrp: 49500, rank: "Medium", profit: 3500 },
  RZ550E: { code: "RZ550E", category: "Electrified", type: "EV SUV", grade: "F SPORT", engine: "EV", msrp: 57000, rank: "Medium", profit: 0 },
  LC500: { code: "LC500", category: "Halo", type: "Grand Tourer", grade: "Performance", engine: "Gas", msrp: 101050, rank: "High", profit: 9200 },
  UX300H: { code: "UX300H", category: "Core", type: "Subcompact SUV Hybrid", grade: "Base", engine: "Hybrid", msrp: 36955, rank: "Low", profit: 0 },
  "TX550H+": { code: "TX550H+", category: "Electrified", type: "Three-Row PHEV SUV", grade: "Luxury", engine: "Hybrid", msrp: 80310, rank: "High", profit: 0 },
  ES350H: { code: "ES350H", category: "Core", type: "Sedan Hybrid", grade: "Premium", engine: "Hybrid", msrp: 49700, rank: "Medium", profit: 0 },
  ES350E: { code: "ES350E", category: "Electrified", type: "EV Sedan", grade: "Premium", engine: "EV", msrp: 47500, rank: "Medium", profit: 0 },
  ES500E: { code: "ES500E", category: "Electrified", type: "EV Sedan AWD", grade: "Premium", engine: "EV", msrp: 50500, rank: "Medium", profit: 0 },
};

export const LEXUS_REFERENCE_CODES = Object.keys(LEXUS_ALLOCATION_REFERENCE).sort(
  (a, b) => b.length - a.length,
);

// ─── Internal Types ───────────────────────────────────────────────────────────

interface ColumnRange {
  start: number;
  end: number;
}

interface ColumnLayout {
  headerLineIndex: number;
  qty?: ColumnRange;
  model?: ColumnRange;
  bos?: ColumnRange;
  arrival?: ColumnRange;
  extColor?: ColumnRange;
  intColor?: ColumnRange;
}

interface CodeMatch {
  code: string;
  start: number;
  end: number;
  raw: string;
}

interface AllocationBlock {
  startLineIndex: number;
  lines: string[];
  rowLine: string;
  rowLineUpper: string;
  blockTextUpper: string;
}

interface SourceCodeCandidate {
  value: string;
  index: number;
  hasSuffixLetter: boolean;
  isYearLike: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const QUANTITY_BEFORE_CODE_REGEX = /^\s*(\d{1,2})\s*[xX]\s*/;
const QUANTITY_AFTER_CODE_REGEX = /^\s*[xX]?\s*(\d{1,2})\b/;
const DATE_PATTERN = /(report\s*date|allocation\s*date|date)\s*[:-]\s*([^\n]+)/i;
const ARRIVAL_TAG_PATTERN = /\b(eta|arrival)\b\s*[:-]?\s*([^\n\t|]+)/i;
const SHORT_DATE_PATTERN = /\b(\d{1,2}\s*\/\s*\d{1,2}(?:\s*\/\s*\d{2,4})?)\b/;
const ISO_DATE_PATTERN = /\b(20\d{2}[-/.]\d{1,2}[-/.]\d{1,2})\b/;
const DASH_DATE_PATTERN = /\b(\d{1,2}\s*-\s*\d{1,2}(?:\s*-\s*\d{2,4})?)\b/;
const COLOR_PATTERN = /(atomic\s+silver|caviar|cloudburst(?:\s+gray)?|ematador|matador\s+red|nori\s+green|ultrasonic\s+blue|obsidian|iridium|incognito|nightfall\s+mica|ultra\s+white|eminent\s+white(?:\s+pearl)?|black|white|silver|gray|grey|red|blue|green)/i;
const GRADE_PATTERN = /(f\s*sport\s*performance|f\s*sport|luxury|premium|base|overtrail|ultra\s*luxury|performance)/i;
const TOYOTA_DM_ROW_START_PATTERN = /^\s*(?:\d+\s+)?\d{2,4}\s+[0-9A-Z]{4,}\s+[A-Z0-9-]{6,}\s+\d+\b/;
const TOYOTA_DM_COLOR_TOKEN_PATTERN = /\b([0-9A-Z]{3,4})\s*[-/]\s*([0-9A-Z]{2,4})\b/;
const TOYOTA_DM_BOS_PATTERN = /^\s*(?:\d+\s+)?\d{2,4}\s+[0-9A-Z]{4,}\s+[A-Z0-9-]{6,}\s+\d+\s+(?:[YN]\s+)?[0-9A-Z]{3,4}\s*[-/]\s*[0-9A-Z]{2,4}\s+\d{4,5}\s+([YN])\b/;
const SOURCE_CODE_PATTERN = /\b(\d{4}[A-Z]?)\b/;
const SOURCE_CODE_SPLIT_PATTERN = /\b(\d{4})\s*[- ]\s*([A-Z])\b/;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isAlphaNumeric(char: string | undefined): boolean {
  if (!char) return false;
  return /[A-Z0-9]/.test(char);
}

function splitCodeIntoSegments(code: string): string[] {
  return code.match(/[A-Z]+|\d+/g) ?? [code];
}

function buildFlexibleCodeRegex(code: string): RegExp {
  const segments = splitCodeIntoSegments(code).map(escapeRegExp);
  const pattern = segments.join("[\\s-]*");
  return new RegExp(pattern, "g");
}

function canonicalizeMatchedCode(matched: string): string {
  return matched.replace(/[\s-]+/g, "").toUpperCase();
}

const FLEXIBLE_CODE_REGEXES = LEXUS_REFERENCE_CODES.map(buildFlexibleCodeRegex);

function findModelCodeMatchesInLine(uppercaseLine: string): CodeMatch[] {
  const matches: CodeMatch[] = [];

  for (const regex of FLEXIBLE_CODE_REGEXES) {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null = regex.exec(uppercaseLine);

    while (match) {
      const baseRaw = match[0] ?? "";
      const start = match.index;
      const baseEnd = start + baseRaw.length;
      const before = uppercaseLine[start - 1];
      const after = uppercaseLine[baseEnd];
      const boundaryOk = !isAlphaNumeric(before) && !isAlphaNumeric(after);

      if (boundaryOk) {
        const canonical = canonicalizeMatchedCode(baseRaw);
        if (LEXUS_ALLOCATION_REFERENCE[canonical]) {
          matches.push({ code: canonical, start, end: baseEnd, raw: baseRaw });
        } else {
          const plusMatch = uppercaseLine.slice(baseEnd).match(/^\s*\+/);
          if (!plusMatch) {
            match = regex.exec(uppercaseLine);
            continue;
          }
          const plusRaw = `${baseRaw}+`;
          const canonicalPlus = canonicalizeMatchedCode(plusRaw);
          if (LEXUS_ALLOCATION_REFERENCE[canonicalPlus]) {
            matches.push({ code: canonicalPlus, start, end: baseEnd + plusMatch[0].length, raw: plusRaw });
          }
        }
      }

      match = regex.exec(uppercaseLine);
    }
  }

  matches.sort((a, b) => a.start - b.start);

  const deduped: CodeMatch[] = [];
  for (const match of matches) {
    const last = deduped[deduped.length - 1];
    if (!last) { deduped.push(match); continue; }
    const overlaps = match.start < last.end && match.end > last.start;
    if (!overlaps) { deduped.push(match); continue; }
    if (match.raw.length > last.raw.length) {
      deduped[deduped.length - 1] = match;
    }
  }

  return deduped;
}

function isHeaderLikeLine(uppercaseLine: string): boolean {
  if (/\b(SUMMARY|TOTAL|PAGE)\b/.test(uppercaseLine)) return true;
  if (/\bALLOC\b/.test(uppercaseLine) && /\bMODEL\b/.test(uppercaseLine) && /\bSERIAL\b/.test(uppercaseLine)) return true;

  const headerTokenPatterns = [
    /\bQTY\b/, /\bQUANTITY\b/, /\bMODEL\b/, /\bETA\b/, /\bARRIVAL\b/,
    /\bSTATUS\b/, /\bEXT\b/, /\bEXTERIOR\b/, /\bINT\b/, /\bINTERIOR\b/,
    /\bCOLOR\b/, /\bCLR\b/,
  ];
  const tokenCount = headerTokenPatterns.reduce(
    (count, pattern) => (pattern.test(uppercaseLine) ? count + 1 : count),
    0,
  );
  return tokenCount >= 3;
}

function isIgnorableNoiseLine(uppercaseLine: string): boolean {
  if (/^\s*PAGE\s+\d+\s+OF\s+\d+\s*$/i.test(uppercaseLine)) return true;
  if (/^\s*\d{1,2}:\d{2}:\d{2}\s*(AM|PM)\s*$/i.test(uppercaseLine)) return true;
  if (/^\s*DISTRICT\s*:\s*\d+\s*$/i.test(uppercaseLine)) return true;
  if (/^\s*ALLOCATION\s*#?\s*:\s*\d+\s*$/i.test(uppercaseLine)) return true;

  return (
    /\bTOYOTA\b.*\bALLOCATION\b.*\bAPPLICATION\b/.test(uppercaseLine) ||
    /\bALLOCATION\s+STATUS\s+BY\s+DEALER\b/.test(uppercaseLine) ||
    /\bALLOCATION#\b/.test(uppercaseLine) ||
    /^\s*DEALER:\s*/.test(uppercaseLine) ||
    /\bDEALER\/SEQUENCE\s+NUMBER\b/.test(uppercaseLine) ||
    (/\bALLOC\b/.test(uppercaseLine) && /\bMODEL\b/.test(uppercaseLine) && /\bSERIAL\b/.test(uppercaseLine))
  );
}

function isToyotaDMAllocationRowLine(uppercaseLine: string): boolean {
  return TOYOTA_DM_ROW_START_PATTERN.test(uppercaseLine);
}

function normalizePaintCode(raw: string): string {
  let code = raw.trim().toUpperCase();
  while (code.length > 3 && code.startsWith("0")) {
    code = code.slice(1);
  }
  return code;
}

function extractToyotaDMPaintCode(block: AllocationBlock): string | null {
  const fromRow = block.rowLineUpper.match(TOYOTA_DM_COLOR_TOKEN_PATTERN);
  if (fromRow?.[1]) return normalizePaintCode(fromRow[1]);
  const fromBlock = block.blockTextUpper.match(TOYOTA_DM_COLOR_TOKEN_PATTERN);
  if (fromBlock?.[1]) return normalizePaintCode(fromBlock[1]);
  return null;
}

function extractToyotaDMInteriorCode(block: AllocationBlock): string | null {
  const fromRow = block.rowLineUpper.match(TOYOTA_DM_COLOR_TOKEN_PATTERN);
  if (fromRow?.[2]) return fromRow[2].trim().toUpperCase();
  const fromBlock = block.blockTextUpper.match(TOYOTA_DM_COLOR_TOKEN_PATTERN);
  if (fromBlock?.[2]) return fromBlock[2].trim().toUpperCase();
  return null;
}

function normalizeBosValue(raw: string): "Y" | "N" | null {
  const normalized = raw.trim().toUpperCase();
  if (normalized === "Y" || normalized === "N") return normalized;
  return null;
}

function extractToyotaDMBosValue(block: AllocationBlock): "Y" | "N" | null {
  const match = block.rowLineUpper.match(TOYOTA_DM_BOS_PATTERN);
  if (!match?.[1]) return null;
  return normalizeBosValue(match[1]);
}

function normalizeToyotaDMColorName(rawUpper: string): string {
  let cleaned = rawUpper
    .replace(/^\s*\(+\s*/, "")
    .replace(/\s*\)+\s*$/, "")
    .replace(/[|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

  const tokens = cleaned.split(" ").filter(Boolean);
  if (tokens.length === 2 && tokens[0].length <= 2 && /^[A-Z]+$/.test(tokens[0]) && /^[A-Z]+$/.test(tokens[1])) {
    cleaned = `${tokens[0]}${tokens[1]}`;
  }
  return cleaned;
}

function extractToyotaDMExteriorColorName(block: AllocationBlock): string | null {
  const parentheticalValues: string[] = [];

  for (const line of block.lines) {
    const upper = line.toUpperCase();
    const matches = upper.matchAll(/\(\s*([A-Z0-9][A-Z0-9 /+.-]{2,}?)\s*\)/g);
    for (const match of matches) {
      if (match[1]) parentheticalValues.push(match[1].trim());
    }
  }

  const looksLikeColor = (value: string): boolean => {
    if (!value) return false;
    if (/[0-9]{2,}/.test(value)) return false;
    if (/\b(AWD|4WD|SUV|SEDAN|DOOR|PHEV|PREM|PREMIUM\+|LUX|LUXURY|OVERTRAIL|PLUS)\b/.test(value)) return false;
    return true;
  };

  const candidates = parentheticalValues.filter(looksLikeColor);
  if (candidates.length === 0) return null;
  return normalizeToyotaDMColorName(candidates[candidates.length - 1]);
}

function detectColumnLayout(lines: string[]): ColumnLayout | null {
  for (let index = 0; index < Math.min(lines.length, 60); index += 1) {
    const line = lines[index];
    const upper = line.toUpperCase();
    const hasArrivalLabel = /\b(ETA|ARRIVAL)\b/.test(upper);
    const hasExtLabel = /\b(EXT|EXTERIOR)\b/.test(upper) && /\b(COLOR|CLR)\b/.test(upper);
    const hasIntLabel = /\b(INT|INTERIOR)\b/.test(upper) && /\b(COLOR|CLR)\b/.test(upper);

    if (!hasArrivalLabel || !hasExtLabel) continue;

    const qtyIndex = upper.search(/\b(QTY|QUANTITY)\b/);
    const modelIndex = upper.search(/\bMODEL\b/);
    const bosIndex = upper.search(/\bBOS\b/);
    const arrivalIndex = upper.search(/\b(ETA|ARRIVAL)\b/);
    const extIndex = upper.search(/\b(EXT|EXTERIOR)\b/);
    const intIndex = hasIntLabel ? upper.search(/\b(INT|INTERIOR)\b/) : -1;

    const starts = [
      { key: "qty", start: qtyIndex },
      { key: "model", start: modelIndex },
      { key: "bos", start: bosIndex },
      { key: "arrival", start: arrivalIndex },
      { key: "extColor", start: extIndex },
      { key: "intColor", start: intIndex },
    ].filter((entry) => entry.start >= 0);

    if (starts.length < 2) continue;

    starts.sort((a, b) => a.start - b.start);
    const ranges: Record<string, ColumnRange> = {};
    for (let i = 0; i < starts.length; i += 1) {
      const current = starts[i];
      const next = starts[i + 1];
      ranges[current.key] = {
        start: current.start,
        end: next ? next.start : Number.MAX_SAFE_INTEGER,
      };
    }

    return {
      headerLineIndex: index,
      qty: ranges["qty"],
      model: ranges["model"],
      bos: ranges["bos"],
      arrival: ranges["arrival"],
      extColor: ranges["extColor"],
      intColor: ranges["intColor"],
    };
  }
  return null;
}

function sliceColumn(line: string, range: ColumnRange | undefined): string {
  if (!range) return "";
  if (range.start >= line.length) return "";
  const end = Math.min(range.end, line.length);
  return line.slice(range.start, end).trim();
}

function extractDateTokens(text: string): string[] {
  const tokens: string[] = [];
  const patterns = [ISO_DATE_PATTERN, SHORT_DATE_PATTERN, DASH_DATE_PATTERN];

  for (const pattern of patterns) {
    const regex = new RegExp(pattern.source, "g");
    let match: RegExpExecArray | null = regex.exec(text);
    while (match) {
      if (match[1]) tokens.push(match[1]);
      match = regex.exec(text);
    }
  }

  return Array.from(new Set(tokens));
}

function extractFirstDateToken(text: string): string | null {
  const tokens = extractDateTokens(text);
  return tokens.length > 0 ? tokens[0] : null;
}

function normalizeDate(rawDate: string, fallbackYear?: number): string | null {
  const cleaned = rawDate
    .trim()
    .replace(/[\s,;]+$/g, "")
    .replace(/\s*([/.-])\s*/g, "$1");
  if (!cleaned) return null;

  const isoLike = cleaned.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (isoLike) {
    const year = Number(isoLike[1]);
    const month = Number(isoLike[2]);
    const day = Number(isoLike[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const safeDate = new Date(Date.UTC(year, month - 1, day));
    return safeDate.toISOString().slice(0, 10);
  }

  const slashMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (slashMatch) {
    const month = Number(slashMatch[1]);
    const day = Number(slashMatch[2]);
    let year = slashMatch[3] ? Number(slashMatch[3]) : fallbackYear ?? new Date().getFullYear();
    if (year < 100) year += 2000;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const safeDate = new Date(Date.UTC(year, month - 1, day));
    return safeDate.toISOString().slice(0, 10);
  }

  const dashMatch = cleaned.match(/^(\d{1,2})-(\d{1,2})(?:-(\d{2,4}))?$/);
  if (dashMatch) {
    const month = Number(dashMatch[1]);
    const day = Number(dashMatch[2]);
    let year = dashMatch[3] ? Number(dashMatch[3]) : fallbackYear ?? new Date().getFullYear();
    if (year < 100) year += 2000;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const safeDate = new Date(Date.UTC(year, month - 1, day));
    return safeDate.toISOString().slice(0, 10);
  }

  return null;
}

function detectReportDate(source: string): string | null {
  const taggedMatch = source.match(DATE_PATTERN);
  if (taggedMatch?.[2]) return normalizeDate(taggedMatch[2]);
  const firstDateMatch = source.match(SHORT_DATE_PATTERN);
  if (firstDateMatch?.[1]) return normalizeDate(firstDateMatch[1]);
  return null;
}

function detectArrivalFromBlock(block: AllocationBlock, layout: ColumnLayout | null, fallbackYear?: number): string {
  if (layout?.arrival) {
    const fromRow = sliceColumn(block.rowLine, layout.arrival);
    const token = extractFirstDateToken(fromRow.toUpperCase());
    if (token) return normalizeDate(token, fallbackYear) ?? token.toUpperCase();
    const blockTokens = extractDateTokens(block.blockTextUpper);
    if (blockTokens.length === 1) {
      const only = blockTokens[0];
      return normalizeDate(only, fallbackYear) ?? only.toUpperCase();
    }
  }

  const tagMatch = block.blockTextUpper.match(ARRIVAL_TAG_PATTERN);
  if (tagMatch?.[2]) {
    const token = extractFirstDateToken(tagMatch[2]);
    if (token) return normalizeDate(token, fallbackYear) ?? token.toUpperCase();
  }

  const rowTokens = extractDateTokens(block.rowLineUpper);
  if (rowTokens.length === 1) {
    const only = rowTokens[0];
    return normalizeDate(only, fallbackYear) ?? only.toUpperCase();
  }

  const blockTokens = extractDateTokens(block.blockTextUpper);
  if (blockTokens.length === 1) {
    const only = blockTokens[0];
    return normalizeDate(only, fallbackYear) ?? only.toUpperCase();
  }

  return "TBD";
}

function normalizeExteriorColor(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let cleaned = trimmed.replace(/[|]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;

  cleaned = cleaned.toUpperCase();
  cleaned = cleaned.replace(/^\s*(EXTERIOR|EXT\.?)(?:\s+(COLOR|CLR))?\s*[:-]?\s*/, "");
  cleaned = cleaned.split(/\b(?:INT|INTERIOR)\b/)[0].trim();
  cleaned = cleaned.replace(/\s+/g, " ");
  cleaned = cleaned.replace(/\bCA\s+VIAR\b/g, "CAVIAR");
  cleaned = cleaned.replace(/\bCAV\s+IAR\b/g, "CAVIAR");

  const compact = cleaned.match(/^([0-9A-Z]{3})([A-Z][A-Z ]{2,})\b/);
  if (compact?.[1] && compact[2] && /\d/.test(compact[1])) {
    return `${compact[1]} ${compact[2].trim()}`.replace(/\s+/g, " ");
  }

  const spaced = cleaned.match(/^([0-9A-Z]{3})\b\s+([A-Z][A-Z ]{2,})\b/);
  if (spaced?.[1] && spaced[2] && /\d/.test(spaced[1])) {
    return `${spaced[1]} ${spaced[2].trim()}`.replace(/\s+/g, " ");
  }

  const nameMatch = cleaned.match(COLOR_PATTERN);
  if (nameMatch?.[0]) return nameMatch[0].replace(/\s+/g, " ").toUpperCase();

  return null;
}

function detectExteriorColorFromBlock(block: AllocationBlock, layout: ColumnLayout | null): string {
  const isToyotaDM = isToyotaDMAllocationRowLine(block.rowLineUpper);
  if (isToyotaDM) {
    const paintCode = extractToyotaDMPaintCode(block);
    const colorName = extractToyotaDMExteriorColorName(block);
    if (paintCode && colorName) return `${paintCode} ${colorName}`.replace(/\s+/g, " ");
    if (paintCode) return paintCode;
    if (colorName) return colorName;
  }

  if (layout?.extColor) {
    const slice = sliceColumn(block.rowLine, layout.extColor);
    const normalized = normalizeExteriorColor(slice);
    if (normalized) return normalized;
  }

  const paintCodeCandidate = block.blockTextUpper.match(/\b([0-9A-Z]{3})\s+([A-Z][A-Z ]{2,})\b/);
  if (paintCodeCandidate?.[0]) {
    const normalized = normalizeExteriorColor(paintCodeCandidate[0]);
    if (normalized) return normalized;
  }

  const fallback = normalizeExteriorColor(block.blockTextUpper);
  return fallback ?? "TBD";
}

function normalizeInteriorColor(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let cleaned = trimmed.replace(/[|]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;

  cleaned = cleaned.toUpperCase();
  cleaned = cleaned.replace(/^\s*(INTERIOR|INT\.?)(?:\s+(COLOR|CLR))?\s*[:-]?\s*/, "");
  cleaned = cleaned.split(/\b(?:EXT|EXTERIOR)\b/)[0].trim();
  cleaned = cleaned.replace(/\s+/g, " ");

  const coded = cleaned.match(/^([0-9A-Z]{2,5})\s+([A-Z][A-Z ]{2,})\b/);
  if (coded?.[1] && coded[2] && /\d/.test(coded[1])) {
    return `${coded[1]} ${coded[2].trim()}`.replace(/\s+/g, " ");
  }

  const codeOnly = cleaned.match(/^([0-9A-Z]{2,5})$/);
  if (codeOnly?.[1] && /\d/.test(codeOnly[1])) return codeOnly[1];

  if (/^[A-Z][A-Z ]{2,}$/.test(cleaned)) return cleaned;

  return null;
}

function detectInteriorColorFromBlock(block: AllocationBlock, layout: ColumnLayout | null): string {
  const isToyotaDM = isToyotaDMAllocationRowLine(block.rowLineUpper);
  if (isToyotaDM) {
    const interiorCode = extractToyotaDMInteriorCode(block);
    if (interiorCode) return interiorCode;
  }

  if (layout?.intColor) {
    for (const line of block.lines) {
      const slice = sliceColumn(line, layout.intColor);
      const normalized = normalizeInteriorColor(slice);
      if (normalized) return normalized;
    }
  }

  const tagged = block.blockTextUpper.match(/\b(?:INT|INTERIOR)(?:\s+(?:COLOR|CLR))?\s*[:-]?\s*([^\n|]+)/);
  if (tagged?.[1]) {
    const normalized = normalizeInteriorColor(tagged[1]);
    if (normalized) return normalized;
  }

  const codedPairs = Array.from(
    block.blockTextUpper.matchAll(/\b([0-9A-Z]{2,5})\s+([A-Z]{2,}(?:\s+[A-Z]{2,}){0,3})\b/g),
  )
    .map((match) => {
      const code = match[1] ?? "";
      const name = match[2] ?? "";
      return { code, normalized: normalizeInteriorColor(`${code} ${name}`) };
    })
    .filter((entry): entry is { code: string; normalized: string } => {
      if (!entry.normalized) return false;
      if (!/\d/.test(entry.code)) return false;
      const canonicalCode = canonicalizeMatchedCode(entry.code);
      if (LEXUS_ALLOCATION_REFERENCE[canonicalCode]) return false;
      if (/^\d{3}$/.test(entry.code)) return false;
      return true;
    });

  if (codedPairs.length > 0) return codedPairs[codedPairs.length - 1].normalized;
  return "TBD";
}

function detectBosFromBlock(block: AllocationBlock, layout: ColumnLayout | null): "Y" | "N" {
  const isToyotaDM = isToyotaDMAllocationRowLine(block.rowLineUpper);
  if (isToyotaDM) {
    const dmBos = extractToyotaDMBosValue(block);
    if (dmBos) return dmBos;
  }

  if (layout?.bos) {
    for (const line of block.lines) {
      const slice = sliceColumn(line, layout.bos);
      const normalized = normalizeBosValue(slice);
      if (normalized) return normalized;
    }
  }

  const taggedMatch = block.blockTextUpper.match(/\bBOS\b\s*[:-]?\s*([YN])\b/);
  if (taggedMatch?.[1]) {
    const normalized = normalizeBosValue(taggedMatch[1]);
    if (normalized) return normalized;
  }

  if (isToyotaDM) return "N";

  const rowFlags = block.rowLineUpper.match(/\b([YN])\b/g) ?? [];
  if (rowFlags.length === 1) {
    const normalized = normalizeBosValue(rowFlags[0]);
    if (normalized) return normalized;
  }

  return "N";
}

function collectLookbackContext(lines: string[], startLineIndex: number, maxLookback = 8): string {
  const lookbackLines: string[] = [];

  for (let index = startLineIndex - 1; index >= 0; index -= 1) {
    const distance = startLineIndex - index;
    if (distance > maxLookback) break;
    const upper = lines[index].toUpperCase();
    if (isToyotaDMAllocationRowLine(upper) || findModelCodeMatchesInLine(upper).length > 0) break;
    if (isHeaderLikeLine(upper) || isIgnorableNoiseLine(upper)) continue;
    lookbackLines.unshift(upper);
  }

  if (lookbackLines.length === 0) return "";
  return lookbackLines.join(" ");
}

function normalizeOptionCodes(raw: string): string[] {
  const normalized = raw.replace(/[()]+/g, " ").replace(/\s+/g, " ").trim().toUpperCase();
  if (!normalized) return [];

  return normalized
    .split(" ")
    .map((token) => token.trim())
    .filter(
      (token) =>
        /^[A-Z0-9]{2,4}$/.test(token) &&
        !/^(FACTORY|ACCY|ACCESSORY|ACCESSORIES|PPO|PPOS|BOS|LOC)$/.test(token),
    );
}

function detectFactoryAccessoriesFromText(textUpper: string): string[] {
  const factoryMatch = textUpper.match(
    /\bFACTORY\s*ACC(?:Y|ESSOR(?:Y|IES))\b\s*[:-]?\s*([A-Z0-9\s]+?)(?=\bPPOS?\b|\bBOS\b|\bLOC\b|$)/,
  );
  if (!factoryMatch?.[1]) return [];
  return normalizeOptionCodes(factoryMatch[1]);
}

function detectPostProductionOptionsFromText(textUpper: string): string[] {
  const ppoMatch = textUpper.match(
    /\bPPOS?\b\s*[:-]?\s*([A-Z0-9\s]+?)(?=\bBOS\b|\bLOC\b|$)/,
  );
  if (!ppoMatch?.[1]) return [];
  return normalizeOptionCodes(ppoMatch[1]);
}

function detectFactoryAccessoriesFromLookback(lines: string[], startLineIndex: number): string[] {
  const context = collectLookbackContext(lines, startLineIndex);
  if (!context) return [];
  return detectFactoryAccessoriesFromText(context);
}

function detectPostProductionOptionsFromLookback(lines: string[], startLineIndex: number): string[] {
  const context = collectLookbackContext(lines, startLineIndex);
  if (!context) return [];
  return detectPostProductionOptionsFromText(context);
}

function detectToyotaDMOptionsFromRow(block: AllocationBlock): {
  factoryAccessories: string[];
  postProductionOptions: string[];
} {
  if (!isToyotaDMAllocationRowLine(block.rowLineUpper)) {
    return { factoryAccessories: [], postProductionOptions: [] };
  }

  const optionsMatch = block.rowLineUpper.match(
    /^\s*(?:\d+\s+)?\d{2,4}\s+[0-9A-Z]{4,}\s+[A-Z0-9-]{6,}\s+\d+\s+(?:[YN]\s+)?[0-9A-Z]{3,4}\s*[-/]\s*[0-9A-Z]{2,4}\s+\d{4,5}\s+[YN]\s+(.+)$/,
  );
  if (!optionsMatch?.[1]) return { factoryAccessories: [], postProductionOptions: [] };

  const withoutArrival = optionsMatch[1]
    .replace(/\b\d{1,2}\s*[-/]\s*\d{1,2}(?:\s*[-/]\s*\d{2,4})?\b\s*$/, "")
    .replace(/\b\d\b\s*$/, "")
    .trim();
  if (!withoutArrival) return { factoryAccessories: [], postProductionOptions: [] };

  const tokens = withoutArrival
    .split(/\s+/)
    .map((token) => token.trim().toUpperCase())
    .filter((token) => /^[A-Z0-9]{2,4}$/.test(token));
  if (tokens.length === 0) return { factoryAccessories: [], postProductionOptions: [] };

  const firstDigitIndex = tokens.findIndex((token) => /\d/.test(token));
  if (firstDigitIndex < 0) {
    return {
      factoryAccessories: Array.from(new Set(tokens.filter((token) => /^[A-Z]{2,4}$/.test(token)))),
      postProductionOptions: [],
    };
  }

  const factoryAccessories = Array.from(
    new Set(tokens.slice(0, firstDigitIndex).filter((token) => /^[A-Z]{2,4}$/.test(token))),
  );
  const postProductionOptions = Array.from(
    new Set(tokens.slice(firstDigitIndex).filter((token) => /^[A-Z0-9]{2,4}$/.test(token))),
  );

  return { factoryAccessories, postProductionOptions };
}

function detectSourceCode(text: string): string | undefined {
  const candidates: SourceCodeCandidate[] = [];

  const splitRegex = new RegExp(SOURCE_CODE_SPLIT_PATTERN.source, "g");
  for (const match of text.matchAll(splitRegex)) {
    const digits = match[1];
    const suffix = match[2];
    if (!digits || !suffix) continue;
    const value = `${digits}${suffix}`.toUpperCase();
    candidates.push({ value, index: match.index ?? -1, hasSuffixLetter: true, isYearLike: false });
  }

  const codeRegex = new RegExp(SOURCE_CODE_PATTERN.source, "g");
  for (const match of text.matchAll(codeRegex)) {
    const raw = match[1]?.toUpperCase();
    if (!raw) continue;
    candidates.push({
      value: raw,
      index: match.index ?? -1,
      hasSuffixLetter: /[A-Z]$/.test(raw),
      isYearLike: /^20\d{2}$/.test(raw),
    });
  }

  if (candidates.length === 0) return undefined;

  const deduped = new Map<string, SourceCodeCandidate>();
  candidates.forEach((candidate) => {
    const key = `${candidate.value}@${candidate.index}`;
    if (!deduped.has(key)) deduped.set(key, candidate);
  });

  const scored = Array.from(deduped.values()).sort((first, second) => {
    const firstScore = first.hasSuffixLetter ? 3 : first.isYearLike ? 1 : 2;
    const secondScore = second.hasSuffixLetter ? 3 : second.isYearLike ? 1 : 2;
    if (firstScore !== secondScore) return secondScore - firstScore;
    return second.index - first.index;
  });

  const best = scored[0];
  if (!best || (best.isYearLike && !best.hasSuffixLetter)) return undefined;
  return best.value;
}

function detectSourceCodeFromBlock(block: AllocationBlock): string | undefined {
  return detectSourceCode(block.blockTextUpper);
}

function detectSourceCodeFromLookback(lines: string[], startLineIndex: number, maxLookback = 8): string | undefined {
  const context = collectLookbackContext(lines, startLineIndex, maxLookback);
  if (!context) return undefined;
  return detectSourceCode(context);
}

function detectGrade(line: string, reference: LexusAllocationReference): string {
  const gradeMatch = line.match(GRADE_PATTERN);
  return gradeMatch ? gradeMatch[0].replace(/\s+/g, " ").toUpperCase() : reference.grade;
}

function detectQuantity(
  uppercaseLine: string,
  startIndex: number,
  endIndex: number,
  layout: ColumnLayout | null,
): number {
  if (layout?.qty) {
    const slice = sliceColumn(uppercaseLine, layout.qty);
    const parsed = Number.parseInt(slice, 10);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }

  const explicit = uppercaseLine.match(/\bQTY\s*[:-]?\s*(\d{1,2})\b/);
  if (explicit?.[1]) {
    const numeric = Number(explicit[1]);
    if (numeric > 0) return numeric;
  }

  const before = uppercaseLine.slice(Math.max(0, startIndex - 14), startIndex);
  const beforeMatch = before.match(/(?:^|\s)(\d{1,2})\s*[xX]\s*$/);
  if (beforeMatch?.[1]) {
    const numeric = Number(beforeMatch[1]);
    if (numeric > 0) return numeric;
  }

  const plainBefore = before.match(/(?:^|\s)(\d{1,2})\s*$/);
  if (plainBefore?.[1]) {
    const numeric = Number(plainBefore[1]);
    if (numeric > 0) return numeric;
  }

  const after = uppercaseLine.slice(endIndex, Math.min(uppercaseLine.length, endIndex + 14));
  const afterMatch = after.match(QUANTITY_AFTER_CODE_REGEX);
  if (afterMatch?.[1]) {
    const numeric = Number(afterMatch[1]);
    if (numeric > 0) return numeric;
  }

  const lineStartMatch = uppercaseLine.match(QUANTITY_BEFORE_CODE_REGEX);
  if (lineStartMatch?.[1]) {
    const numeric = Number(lineStartMatch[1]);
    if (numeric > 0) return numeric;
  }

  const parenMatch = uppercaseLine.match(/\((\d{1,2})\)/);
  if (parenMatch?.[1]) {
    const numeric = Number(parenMatch[1]);
    if (numeric > 0) return numeric;
  }

  return 1;
}

function summarizeVehicles(vehicles: AllocationVehicle[]): AllocationSummary {
  const units = vehicles.reduce((total, vehicle) => total + vehicle.quantity, 0);
  const value = vehicles.reduce((total, vehicle) => total + vehicle.totalValue, 0);
  const hybridUnits = vehicles
    .filter((vehicle) =>
      vehicle.engine.toLowerCase().includes("hybrid") ||
      vehicle.type.toLowerCase().includes("hybrid"),
    )
    .reduce((total, vehicle) => total + vehicle.quantity, 0);

  return {
    units,
    value,
    hybridMix: units === 0 ? 0 : Number(((hybridUnits / units) * 100).toFixed(1)),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function parseAllocationSource(sourceText: string): ParsedAllocationResult {
  const normalized = sourceText
    .replace(/\r\n/g, "\n")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .trim();

  if (!normalized) {
    return {
      reportDate: null,
      vehicles: [],
      summary: { units: 0, value: 0, hybridMix: 0 },
      itemCount: 0,
      warnings: [],
      errors: ["Paste allocation source text before parsing."],
    };
  }

  const reportDate = detectReportDate(normalized);
  const reportYear = reportDate ? Number(reportDate.slice(0, 4)) : undefined;

  const vehicles: AllocationVehicle[] = [];
  const warnings: string[] = [];

  const lines = normalized
    .split("\n")
    .map((line) => line.replace(/\s+$/g, ""))
    .filter((line) => line.trim().length > 0);

  // Log: lines attempted
  console.log(`[allocationParser] Input lines: ${lines.length}`);

  const layout = detectColumnLayout(lines);
  if (layout) {
    console.log(`[allocationParser] Column layout detected at header line ${layout.headerLineIndex + 1}`);
  } else {
    console.log(`[allocationParser] No fixed column layout detected — using pattern-based extraction`);
  }

  const blocks: AllocationBlock[] = [];
  const inBlock = new Array(lines.length).fill(false) as boolean[];
  type CurrentBlock = { start: number; lines: string[]; kind: "dm" | "code" };
  let current: CurrentBlock | null = null;

  function flushCurrent(c: CurrentBlock): void {
    blocks.push({
      startLineIndex: c.start,
      lines: c.lines,
      rowLine: c.lines[0],
      rowLineUpper: c.lines[0].toUpperCase(),
      blockTextUpper: c.lines.join(" ").toUpperCase(),
    });
  }

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const upper = line.toUpperCase();
    const isDmRowStart = isToyotaDMAllocationRowLine(upper);
    const codeMatches = findModelCodeMatchesInLine(upper);
    const isCodeRowStart = codeMatches.length > 0 && !isHeaderLikeLine(upper);
    const shouldStartNewBlock = isDmRowStart || (isCodeRowStart && (!current || current.kind === "code"));

    if (shouldStartNewBlock) {
      if (current !== null) flushCurrent(current);
      current = { start: index, lines: [line], kind: isDmRowStart ? "dm" : "code" };
      inBlock[index] = true;
      continue;
    }

    if (current !== null) {
      if (current.kind === "dm" && (isIgnorableNoiseLine(upper) || isHeaderLikeLine(upper))) continue;
      current.lines.push(line);
      inBlock[index] = true;
    }
  }

  if (current !== null) flushCurrent(current);

  console.log(`[allocationParser] Detected ${blocks.length} candidate blocks`);

  blocks.forEach((block, blockIndex) => {
    const matches = findModelCodeMatchesInLine(block.blockTextUpper);
    if (matches.length === 0) {
      console.log(`[allocationParser] Block ${blockIndex + 1} (line ${block.startLineIndex + 1}) skipped: no model code match`);
      return;
    }

    const isToyotaDM = isToyotaDMAllocationRowLine(block.rowLineUpper);
    const uniqueMatches: CodeMatch[] = [];
    const seenCodes = new Set<string>();
    for (const match of matches) {
      if (seenCodes.has(match.code)) continue;
      seenCodes.add(match.code);
      uniqueMatches.push(match);
    }

    const matchesToEmit = isToyotaDM ? uniqueMatches.slice(0, 1) : uniqueMatches;
    if (matchesToEmit.length === 0) return;

    const vehiclesBefore = vehicles.length;

    const arrival = detectArrivalFromBlock(block, layout, reportYear);
    const exteriorColor = detectExteriorColorFromBlock(block, layout);
    const interiorColor = detectInteriorColorFromBlock(block, layout);
    const bos = detectBosFromBlock(block, layout);
    const dmOptions = detectToyotaDMOptionsFromRow(block);
    const factoryAccessories = Array.from(new Set([
      ...detectFactoryAccessoriesFromLookback(lines, block.startLineIndex),
      ...detectFactoryAccessoriesFromText(block.blockTextUpper),
      ...dmOptions.factoryAccessories,
    ]));
    const postProductionOptions = Array.from(new Set([
      ...detectPostProductionOptionsFromLookback(lines, block.startLineIndex),
      ...detectPostProductionOptionsFromText(block.blockTextUpper),
      ...dmOptions.postProductionOptions,
    ]));
    const lookbackSourceCode = detectSourceCodeFromLookback(lines, block.startLineIndex);
    const blockSourceCode = detectSourceCodeFromBlock(block);

    matchesToEmit.forEach((match) => {
      const reference = LEXUS_ALLOCATION_REFERENCE[match.code];
      if (!reference) return;

      const sourceCode =
        detectSourceCode(block.blockTextUpper.slice(0, Math.max(0, match.start))) ??
        lookbackSourceCode ??
        blockSourceCode;

      const quantity = isToyotaDM
        ? 1
        : detectQuantity(block.blockTextUpper, match.start, match.end, layout);

      const vehicle: AllocationVehicle = {
        id: `${match.code}-${block.startLineIndex}-${match.start}-${vehicles.length}`,
        code: match.code,
        model: reference.code,
        sourceCode,
        quantity,
        color: exteriorColor,
        interiorColor,
        bos,
        arrival,
        grade: detectGrade(block.blockTextUpper, reference),
        engine: reference.engine,
        msrp: 0,
        category: reference.category,
        type: reference.type,
        rank: reference.rank,
        profit: 0,
        totalValue: 0,
      };

      if (factoryAccessories.length > 0) vehicle.factoryAccessories = factoryAccessories;
      if (postProductionOptions.length > 0) vehicle.postProductionOptions = postProductionOptions;

      vehicles.push(vehicle);
      console.log(`[allocationParser] Matched: ${match.code} | color=${exteriorColor} | arrival=${arrival} | bos=${bos}`);
    });

    if (matchesToEmit.length > 0 && vehicles.length === vehiclesBefore) {
      const msg = `Block starting at line ${block.startLineIndex + 1} skipped: no mapped Lexus model code found.`;
      warnings.push(msg);
      console.warn(`[allocationParser] ${msg}`);
    }
  });

  // Warn on non-block lines that have content but no match
  lines.forEach((line, index) => {
    if (inBlock[index]) return;
    const upper = line.toUpperCase();
    if (layout && index === layout.headerLineIndex) return;
    if (!/[A-Z0-9]{3,}/.test(upper)) return;
    if (!/\d/.test(upper)) return;
    if (isHeaderLikeLine(upper)) return;
    if (isIgnorableNoiseLine(upper)) return;
    const msg = `Line ${index + 1} skipped: no mapped Lexus model code found.`;
    warnings.push(msg);
    console.warn(`[allocationParser] ${msg}`);
  });

  console.log(`[allocationParser] Result: ${vehicles.length} vehicles parsed, ${warnings.length} warning(s)`);

  if (vehicles.length === 0) {
    return {
      reportDate,
      vehicles: [],
      summary: { units: 0, value: 0, hybridMix: 0 },
      itemCount: 0,
      warnings,
      errors: ["No supported Lexus model codes were found. Verify source text and mapping table."],
    };
  }

  const summary = summarizeVehicles(vehicles);
  return { reportDate, vehicles, summary, itemCount: vehicles.length, warnings, errors: [] };
}
