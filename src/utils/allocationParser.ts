import {
  LEXUS_ALLOCATION_REFERENCE,
  LEXUS_REFERENCE_CODES,
  LexusAllocationReference,
} from "./allocationReference";
import {
  AllocationSummary,
  AllocationVehicle,
  ParsedAllocationResult,
} from "./allocationTypes";

const QUANTITY_BEFORE_CODE_REGEX = /^\s*(\d{1,2})\s*[xX]\s*/;
const QUANTITY_AFTER_CODE_REGEX = /^\s*[xX]?\s*(\d{1,2})\b/;

const DATE_PATTERN = /(report\s*date|allocation\s*date|date)\s*[:-]\s*([^\n]+)/i;

// Label-based extraction only (avoid grabbing unrelated dates by default).
const ARRIVAL_TAG_PATTERN = /\b(eta|arrival)\b\s*[:-]?\s*([^\n\t|]+)/i;

const SHORT_DATE_PATTERN = /\b(\d{1,2}\s*\/\s*\d{1,2}(?:\s*\/\s*\d{2,4})?)\b/;
const ISO_DATE_PATTERN = /\b(20\d{2}[-/.]\d{1,2}[-/.]\d{1,2})\b/;
const DASH_DATE_PATTERN = /\b(\d{1,2}\s*-\s*\d{1,2}(?:\s*-\s*\d{2,4})?)\b/;

// Fallback color name matcher (kept permissive but only used when no paint code is detected).
const COLOR_PATTERN = /(atomic\s+silver|caviar|cloudburst(?:\s+gray)?|ematador|matador\s+red|nori\s+green|ultrasonic\s+blue|obsidian|iridium|incognito|nightfall\s+mica|ultra\s+white|eminent\s+white(?:\s+pearl)?|black|white|silver|gray|grey|red|blue|green)/i;
const GRADE_PATTERN = /(f\s*sport\s*performance|f\s*sport|luxury|premium|base|overtrail|ultra\s*luxury|performance)/i;

// Toyota District Manager Allocation Application format (PDF text extract)
// Example row start: "1 022 9353F TS12I666 8 Y 0223-01 01728 ..."
// Allow optional leading row number and serial variants that include hyphens.
const TOYOTA_DM_ROW_START_PATTERN =
  /^\s*(?:\d+\s+)?\d{2,4}\s+[0-9A-Z]{4,}\s+[A-Z0-9-]{6,}\s+\d+\b/;
// PDF extraction can drift separators and spacing in the color token.
const TOYOTA_DM_COLOR_TOKEN_PATTERN = /\b([0-9A-Z]{3,4})\s*[-/]\s*([0-9A-Z]{2,4})\b/;
const TOYOTA_DM_BOS_PATTERN =
  /^\s*(?:\d+\s+)?\d{2,4}\s+[0-9A-Z]{4,}\s+[A-Z0-9-]{6,}\s+\d+\s+(?:[YN]\s+)?[0-9A-Z]{3,4}\s*[-/]\s*[0-9A-Z]{2,4}\s+\d{4,5}\s+([YN])\b/;

const SOURCE_CODE_PATTERN = /\b(\d{4}[A-Z]?)\b/;
const SOURCE_CODE_SPLIT_PATTERN = /\b(\d{4})\s*[- ]\s*([A-Z])\b/;

interface ColumnRange {
  start: number;
  end: number; // end is exclusive
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
  code: string; // canonical mapping key e.g. RX350
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isAlphaNumeric(char: string | undefined): boolean {
  if (!char) {
    return false;
  }
  return /[A-Z0-9]/.test(char);
}

function splitCodeIntoSegments(code: string): string[] {
  return code.match(/[A-Z]+|\d+/g) ?? [code];
}

function buildFlexibleCodeRegex(code: string): RegExp {
  const segments = splitCodeIntoSegments(code).map(escapeRegExp);
  // Allow spaces and hyphens between segments (common in pasted/PDF text: "RX 350", "TX-500H").
  const pattern = segments.join("[\\s-]*");
  return new RegExp(pattern, "g");
}

function canonicalizeMatchedCode(matched: string): string {
  return matched.replace(/[\s-]+/g, "").toUpperCase();
}

const FLEXIBLE_CODE_REGEXES = LEXUS_REFERENCE_CODES.map((code) =>
  buildFlexibleCodeRegex(code),
);

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
        // Canonicalize (strip spaces/hyphens) before mapping.
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
            matches.push({
              code: canonicalPlus,
              start,
              end: baseEnd + plusMatch[0].length,
              raw: plusRaw,
            });
          }
        }
      }

      match = regex.exec(uppercaseLine);
    }
  }

  // Sort for stable output (left-to-right in the line).
  matches.sort((a, b) => a.start - b.start);

  // De-dupe overlaps (can happen when flexible regex matches the same region multiple ways).
  const deduped: CodeMatch[] = [];
  for (const match of matches) {
    const last = deduped[deduped.length - 1];
    if (!last) {
      deduped.push(match);
      continue;
    }

    const overlaps = match.start < last.end && match.end > last.start;
    if (!overlaps) {
      deduped.push(match);
      continue;
    }

    // Prefer the longer raw match, otherwise keep the first.
    if (match.raw.length > last.raw.length) {
      deduped[deduped.length - 1] = match;
    }
  }

  return deduped;
}

function isHeaderLikeLine(uppercaseLine: string): boolean {
  // Avoid treating common allocation headers/footers as rows.
  // Keep this conservative: a real row can include words like "COLOR" in notes, but headers
  // typically contain multiple header tokens.
  if (/\b(SUMMARY|TOTAL|PAGE)\b/.test(uppercaseLine)) {
    return true;
  }

  // Toyota DM Allocation header line.
  if (/\bALLOC\b/.test(uppercaseLine) && /\bMODEL\b/.test(uppercaseLine) && /\bSERIAL\b/.test(uppercaseLine)) {
    return true;
  }

  const headerTokenPatterns = [
    /\bQTY\b/,
    /\bQUANTITY\b/,
    /\bMODEL\b/,
    /\bETA\b/,
    /\bARRIVAL\b/,
    /\bSTATUS\b/,
    /\bEXT\b/,
    /\bEXTERIOR\b/,
    /\bINT\b/,
    /\bINTERIOR\b/,
    /\bCOLOR\b/,
    /\bCLR\b/,
  ];

  const tokenCount = headerTokenPatterns.reduce(
    (count, pattern) => (pattern.test(uppercaseLine) ? count + 1 : count),
    0,
  );

  return tokenCount >= 3;
}

function isIgnorableNoiseLine(uppercaseLine: string): boolean {
  if (/^\s*PAGE\s+\d+\s+OF\s+\d+\s*$/i.test(uppercaseLine)) {
    return true;
  }

  if (/^\s*\d{1,2}:\d{2}:\d{2}\s*(AM|PM)\s*$/i.test(uppercaseLine)) {
    return true;
  }

  if (/^\s*DISTRICT\s*:\s*\d+\s*$/i.test(uppercaseLine)) {
    return true;
  }

  if (/^\s*ALLOCATION\s*#?\s*:\s*\d+\s*$/i.test(uppercaseLine)) {
    return true;
  }

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
  if (fromRow?.[1]) {
    return normalizePaintCode(fromRow[1]);
  }

  const fromBlock = block.blockTextUpper.match(TOYOTA_DM_COLOR_TOKEN_PATTERN);
  if (fromBlock?.[1]) {
    return normalizePaintCode(fromBlock[1]);
  }

  return null;
}

function extractToyotaDMInteriorCode(block: AllocationBlock): string | null {
  const fromRow = block.rowLineUpper.match(TOYOTA_DM_COLOR_TOKEN_PATTERN);
  if (fromRow?.[2]) {
    return fromRow[2].trim().toUpperCase();
  }

  const fromBlock = block.blockTextUpper.match(TOYOTA_DM_COLOR_TOKEN_PATTERN);
  if (fromBlock?.[2]) {
    return fromBlock[2].trim().toUpperCase();
  }

  return null;
}

function normalizeBosValue(raw: string): "Y" | "N" | null {
  const normalized = raw.trim().toUpperCase();
  if (normalized === "Y" || normalized === "N") {
    return normalized;
  }
  return null;
}

function extractToyotaDMBosValue(block: AllocationBlock): "Y" | "N" | null {
  const match = block.rowLineUpper.match(TOYOTA_DM_BOS_PATTERN);
  if (!match?.[1]) {
    return null;
  }

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

  // Fix kerning artifacts like "CA VIAR" -> "CAVIAR" (only when the first token is very short).
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
      if (match[1]) {
        parentheticalValues.push(match[1].trim());
      }
    }
  }

  const looksLikeColor = (value: string): boolean => {
    if (!value) {
      return false;
    }
    if (/[0-9]{2,}/.test(value)) {
      return false;
    }
    if (/\b(AWD|4WD|SUV|SEDAN|DOOR|PHEV|PREM|PREMIUM\+|LUX|LUXURY|OVERTRAIL|PLUS)\b/.test(value)) {
      return false;
    }
    return true;
  };

  const candidates = parentheticalValues.filter(looksLikeColor);
  if (candidates.length === 0) {
    return null;
  }

  // Color is typically the last parenthetical value in the block.
  return normalizeToyotaDMColorName(candidates[candidates.length - 1]);
}

function detectColumnLayout(lines: string[]): ColumnLayout | null {
  for (let index = 0; index < Math.min(lines.length, 60); index += 1) {
    const line = lines[index];
    const upper = line.toUpperCase();

    const hasArrivalLabel = /\b(ETA|ARRIVAL)\b/.test(upper);
    const hasExtLabel = /\b(EXT|EXTERIOR)\b/.test(upper) && /\b(COLOR|CLR)\b/.test(upper);
    const hasIntLabel = /\b(INT|INTERIOR)\b/.test(upper) && /\b(COLOR|CLR)\b/.test(upper);

    if (!hasArrivalLabel || !hasExtLabel) {
      continue;
    }

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

    if (starts.length < 2) {
      continue;
    }

    starts.sort((a, b) => a.start - b.start);
    const ranges: Record<string, ColumnRange> = {};
    for (let i = 0; i < starts.length; i += 1) {
      const current = starts[i];
      const next = starts[i + 1];
      ranges[current.key] = {
        start: current.start,
        // For the last detected column, allow slicing to extend to the full row length.
        end: next ? next.start : Number.MAX_SAFE_INTEGER,
      };
    }

    return {
      headerLineIndex: index,
      qty: ranges.qty,
      model: ranges.model,
      bos: ranges.bos,
      arrival: ranges.arrival,
      extColor: ranges.extColor,
      intColor: ranges.intColor,
    };
  }

  return null;
}

function sliceColumn(line: string, range: ColumnRange | undefined): string {
  if (!range) {
    return "";
  }

  if (range.start >= line.length) {
    return "";
  }

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
      if (match[1]) {
        tokens.push(match[1]);
      }
      match = regex.exec(text);
    }
  }

  // De-dupe while preserving order.
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
    // Normalize separator spacing from pasted/OCR dates (e.g., "03 - 16").
    .replace(/\s*([/.-])\s*/g, "$1");
  if (!cleaned) {
    return null;
  }

  // ISO-ish formats: YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD
  const isoLike = cleaned.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (isoLike) {
    const year = Number(isoLike[1]);
    const month = Number(isoLike[2]);
    const day = Number(isoLike[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return null;
    }
    const safeDate = new Date(Date.UTC(year, month - 1, day));
    return safeDate.toISOString().slice(0, 10);
  }

  // Slash formats: M/D[/YY]
  const slashMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (slashMatch) {
    const month = Number(slashMatch[1]);
    const day = Number(slashMatch[2]);
    let year = slashMatch[3] ? Number(slashMatch[3]) : fallbackYear ?? new Date().getFullYear();

    if (year < 100) {
      year += 2000;
    }

    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return null;
    }

    const safeDate = new Date(Date.UTC(year, month - 1, day));
    return safeDate.toISOString().slice(0, 10);
  }

  // Dash formats: M-D[-YY]
  const dashMatch = cleaned.match(/^(\d{1,2})-(\d{1,2})(?:-(\d{2,4}))?$/);
  if (dashMatch) {
    const month = Number(dashMatch[1]);
    const day = Number(dashMatch[2]);
    let year = dashMatch[3] ? Number(dashMatch[3]) : fallbackYear ?? new Date().getFullYear();

    if (year < 100) {
      year += 2000;
    }

    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return null;
    }

    const safeDate = new Date(Date.UTC(year, month - 1, day));
    return safeDate.toISOString().slice(0, 10);
  }

  return null;
}

function detectReportDate(source: string): string | null {
  const taggedMatch = source.match(DATE_PATTERN);
  if (taggedMatch?.[2]) {
    return normalizeDate(taggedMatch[2]);
  }

  const firstDateMatch = source.match(SHORT_DATE_PATTERN);
  if (firstDateMatch?.[1]) {
    return normalizeDate(firstDateMatch[1]);
  }

  return null;
}

function detectArrivalFromBlock(
  block: AllocationBlock,
  layout: ColumnLayout | null,
  fallbackYear?: number,
): string {
  // 1) Prefer column-based extraction when header layout is available.
  if (layout?.arrival) {
    const fromRow = sliceColumn(block.rowLine, layout.arrival);
    const token = extractFirstDateToken(fromRow.toUpperCase());
    if (token) {
      return normalizeDate(token, fallbackYear) ?? token.toUpperCase();
    }

    // Sometimes the ETA wraps to the next line; search the block for a single date token.
    const blockTokens = extractDateTokens(block.blockTextUpper);
    if (blockTokens.length === 1) {
      const only = blockTokens[0];
      return normalizeDate(only, fallbackYear) ?? only.toUpperCase();
    }
  }

  // 2) Label-based: "ETA: 3/12/2026" / "Arrival 3/12".
  const tagMatch = block.blockTextUpper.match(ARRIVAL_TAG_PATTERN);
  if (tagMatch?.[2]) {
    const token = extractFirstDateToken(tagMatch[2]);
    if (token) {
      return normalizeDate(token, fallbackYear) ?? token.toUpperCase();
    }
  }

  // 3) Heuristic: if the row line contains exactly one date token, treat it as arrival.
  const rowTokens = extractDateTokens(block.rowLineUpper);
  if (rowTokens.length === 1) {
    const only = rowTokens[0];
    return normalizeDate(only, fallbackYear) ?? only.toUpperCase();
  }

  // 4) If the entire block contains exactly one date token (common in Toyota DM PDF extracts
  // where the date is wrapped onto its own line), treat it as arrival.
  const blockTokens = extractDateTokens(block.blockTextUpper);
  if (blockTokens.length === 1) {
    const only = blockTokens[0];
    return normalizeDate(only, fallbackYear) ?? only.toUpperCase();
  }

  return "TBD";
}

function normalizeExteriorColor(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  let cleaned = trimmed
    .replace(/[|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) {
    return null;
  }

  cleaned = cleaned.toUpperCase();
  cleaned = cleaned.replace(
    /^\s*(EXTERIOR|EXT\.?)(?:\s+(COLOR|CLR))?\s*[:-]?\s*/,
    "",
  );
  cleaned = cleaned.split(/\b(?:INT|INTERIOR)\b/)[0].trim();
  cleaned = cleaned.replace(/\s+/g, " ");

  // Fix common kerning artifacts from PDF copy/paste.
  cleaned = cleaned.replace(/\bCA\s+VIAR\b/g, "CAVIAR");
  cleaned = cleaned.replace(/\bCAV\s+IAR\b/g, "CAVIAR");

  // Prefer paint code + name.
  const compact = cleaned.match(/^([0-9A-Z]{3})([A-Z][A-Z ]{2,})\b/);
  if (compact?.[1] && compact[2] && /\d/.test(compact[1])) {
    return `${compact[1]} ${compact[2].trim()}`.replace(/\s+/g, " ");
  }

  const spaced = cleaned.match(/^([0-9A-Z]{3})\b\s+([A-Z][A-Z ]{2,})\b/);
  if (spaced?.[1] && spaced[2] && /\d/.test(spaced[1])) {
    return `${spaced[1]} ${spaced[2].trim()}`.replace(/\s+/g, " ");
  }

  // Fallback to known-ish Lexus color names (if no paint code present).
  const nameMatch = cleaned.match(COLOR_PATTERN);
  if (nameMatch?.[0]) {
    return nameMatch[0].replace(/\s+/g, " ").toUpperCase();
  }

  return null;
}

function detectExteriorColorFromBlock(block: AllocationBlock, layout: ColumnLayout | null): string {
  const isToyotaDM = isToyotaDMAllocationRowLine(block.rowLineUpper);
  if (isToyotaDM) {
    const paintCode = extractToyotaDMPaintCode(block);
    const colorName = extractToyotaDMExteriorColorName(block);

    if (paintCode && colorName) {
      return `${paintCode} ${colorName}`.replace(/\s+/g, " ");
    }
    if (paintCode) {
      return paintCode;
    }
    if (colorName) {
      return colorName;
    }
  }

  // 1) Prefer column-based extraction.
  if (layout?.extColor) {
    const slice = sliceColumn(block.rowLine, layout.extColor);
    const normalized = normalizeExteriorColor(slice);
    if (normalized) {
      return normalized;
    }
  }

  // 2) Search the block for a paint-code style pattern.
  const paintCodeCandidate = block.blockTextUpper.match(/\b([0-9A-Z]{3})\s+([A-Z][A-Z ]{2,})\b/);
  if (paintCodeCandidate?.[0]) {
    const normalized = normalizeExteriorColor(paintCodeCandidate[0]);
    if (normalized) {
      return normalized;
    }
  }

  // 3) Last resort: match a known color word.
  const fallback = normalizeExteriorColor(block.blockTextUpper);
  return fallback ?? "TBD";
}

function normalizeInteriorColor(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  let cleaned = trimmed
    .replace(/[|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) {
    return null;
  }

  cleaned = cleaned.toUpperCase();
  cleaned = cleaned.replace(
    /^\s*(INTERIOR|INT\.?)(?:\s+(COLOR|CLR))?\s*[:-]?\s*/,
    "",
  );
  cleaned = cleaned.split(/\b(?:EXT|EXTERIOR)\b/)[0].trim();
  cleaned = cleaned.replace(/\s+/g, " ");

  // Prefer interior code + name where available.
  const coded = cleaned.match(/^([0-9A-Z]{2,5})\s+([A-Z][A-Z ]{2,})\b/);
  if (coded?.[1] && coded[2] && /\d/.test(coded[1])) {
    return `${coded[1]} ${coded[2].trim()}`.replace(/\s+/g, " ");
  }

  // Interior code only (Toyota DM token suffix fallback).
  const codeOnly = cleaned.match(/^([0-9A-Z]{2,5})$/);
  if (codeOnly?.[1] && /\d/.test(codeOnly[1])) {
    return codeOnly[1];
  }

  // Keep plain names if they're all we have.
  if (/^[A-Z][A-Z ]{2,}$/.test(cleaned)) {
    return cleaned;
  }

  return null;
}

function detectInteriorColorFromBlock(block: AllocationBlock, layout: ColumnLayout | null): string {
  const isToyotaDM = isToyotaDMAllocationRowLine(block.rowLineUpper);
  if (isToyotaDM) {
    const interiorCode = extractToyotaDMInteriorCode(block);
    if (interiorCode) {
      return interiorCode;
    }
  }

  // 1) Prefer column-based extraction from any line in the block (handles wrapped rows).
  if (layout?.intColor) {
    for (const line of block.lines) {
      const slice = sliceColumn(line, layout.intColor);
      const normalized = normalizeInteriorColor(slice);
      if (normalized) {
        return normalized;
      }
    }
  }

  // 2) Label-based extraction if text explicitly includes interior label.
  const tagged = block.blockTextUpper.match(/\b(?:INT|INTERIOR)(?:\s+(?:COLOR|CLR))?\s*[:-]?\s*([^\n|]+)/);
  if (tagged?.[1]) {
    const normalized = normalizeInteriorColor(tagged[1]);
    if (normalized) {
      return normalized;
    }
  }

  // 3) Fallback for wrapped table rows where int color shifts left of the detected column.
  // Example continuation: "223 CAVIAR             EA20 BLACK".
  const codedPairs = Array.from(
    block.blockTextUpper.matchAll(/\b([0-9A-Z]{2,5})\s+([A-Z]{2,}(?:\s+[A-Z]{2,}){0,3})\b/g),
  )
    .map((match) => {
      const code = match[1] ?? "";
      const name = match[2] ?? "";
      return {
        code,
        normalized: normalizeInteriorColor(`${code} ${name}`),
      };
    })
    .filter(
      (
        entry,
      ): entry is {
        code: string;
        normalized: string;
      } => {
        if (!entry.normalized) {
          return false;
        }
        if (!/\d/.test(entry.code)) {
          return false;
        }
        const canonicalCode = canonicalizeMatchedCode(entry.code);
        if (LEXUS_ALLOCATION_REFERENCE[canonicalCode]) {
          return false;
        }
        // 3-digit numeric tokens are usually exterior paint codes (e.g., 223 CAVIAR).
        if (/^\d{3}$/.test(entry.code)) {
          return false;
        }
        return true;
      },
    );

  if (codedPairs.length > 0) {
    return codedPairs[codedPairs.length - 1].normalized;
  }

  return "TBD";
}

function detectBosFromBlock(block: AllocationBlock, layout: ColumnLayout | null): string {
  const isToyotaDM = isToyotaDMAllocationRowLine(block.rowLineUpper);
  if (isToyotaDM) {
    const dmBos = extractToyotaDMBosValue(block);
    if (dmBos) {
      return dmBos;
    }
  }

  // Prefer fixed-column extraction when a BOS column is present in the header.
  if (layout?.bos) {
    for (const line of block.lines) {
      const slice = sliceColumn(line, layout.bos);
      const normalized = normalizeBosValue(slice);
      if (normalized) {
        return normalized;
      }
    }
  }

  const taggedMatch = block.blockTextUpper.match(/\bBOS\b\s*[:-]?\s*([YN])\b/);
  if (taggedMatch?.[1]) {
    const normalized = normalizeBosValue(taggedMatch[1]);
    if (normalized) {
      return normalized;
    }
  }

  if (isToyotaDM) {
    // Toyota DM rows include both PI and BOS indicators; if BOS cannot be found
    // at its expected position, do not fall back to lone Y/N tokens.
    return "TBD";
  }

  // Conservative fallback for plain rows without a detected header.
  const rowFlags = block.rowLineUpper.match(/\b([YN])\b/g) ?? [];
  if (rowFlags.length === 1) {
    const normalized = normalizeBosValue(rowFlags[0]);
    if (normalized) {
      return normalized;
    }
  }

  return "TBD";
}

function detectSourceCode(text: string): string | undefined {
  const candidates: SourceCodeCandidate[] = [];

  const splitRegex = new RegExp(SOURCE_CODE_SPLIT_PATTERN.source, "g");
  for (const match of text.matchAll(splitRegex)) {
    const digits = match[1];
    const suffix = match[2];
    if (!digits || !suffix) {
      continue;
    }

    const value = `${digits}${suffix}`.toUpperCase();
    candidates.push({
      value,
      index: match.index ?? -1,
      hasSuffixLetter: true,
      isYearLike: false,
    });
  }

  const codeRegex = new RegExp(SOURCE_CODE_PATTERN.source, "g");
  for (const match of text.matchAll(codeRegex)) {
    const raw = match[1]?.toUpperCase();
    if (!raw) {
      continue;
    }

    candidates.push({
      value: raw,
      index: match.index ?? -1,
      hasSuffixLetter: /[A-Z]$/.test(raw),
      isYearLike: /^20\d{2}$/.test(raw),
    });
  }

  if (candidates.length === 0) {
    return undefined;
  }

  const deduped = new Map<string, SourceCodeCandidate>();
  candidates.forEach((candidate) => {
    const key = `${candidate.value}@${candidate.index}`;
    if (!deduped.has(key)) {
      deduped.set(key, candidate);
    }
  });

  const scored = Array.from(deduped.values()).sort((first, second) => {
    const firstScore = first.hasSuffixLetter ? 3 : first.isYearLike ? 1 : 2;
    const secondScore = second.hasSuffixLetter ? 3 : second.isYearLike ? 1 : 2;

    if (firstScore !== secondScore) {
      return secondScore - firstScore;
    }

    return second.index - first.index;
  });

  const best = scored[0];
  if (!best || (best.isYearLike && !best.hasSuffixLetter)) {
    return undefined;
  }

  return best.value;
}

function detectSourceCodeFromBlock(block: AllocationBlock): string | undefined {
  return detectSourceCode(block.blockTextUpper);
}

function detectSourceCodeFromLookback(
  lines: string[],
  startLineIndex: number,
  maxLookback = 8,
): string | undefined {
  const lookbackLines: string[] = [];

  for (let index = startLineIndex - 1; index >= 0; index -= 1) {
    const distance = startLineIndex - index;
    if (distance > maxLookback) {
      break;
    }

    const upper = lines[index].toUpperCase();

    // Stop once we hit what looks like the previous row boundary.
    if (isToyotaDMAllocationRowLine(upper) || findModelCodeMatchesInLine(upper).length > 0) {
      break;
    }

    if (isHeaderLikeLine(upper) || isIgnorableNoiseLine(upper)) {
      continue;
    }

    lookbackLines.unshift(upper);
  }

  if (lookbackLines.length === 0) {
    return undefined;
  }

  return detectSourceCode(lookbackLines.join(" "));
}

function detectGrade(line: string, reference: LexusAllocationReference): string {
  const gradeMatch = line.match(GRADE_PATTERN);
  return gradeMatch
    ? gradeMatch[0].replace(/\s+/g, " ").toUpperCase()
    : reference.grade;
}

function detectQuantity(
  uppercaseLine: string,
  startIndex: number,
  endIndex: number,
  layout: ColumnLayout | null,
): number {
  // Column-based quantity is the most reliable when present.
  if (layout?.qty) {
    const slice = sliceColumn(uppercaseLine, layout.qty);
    const parsed = Number.parseInt(slice, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }

  const explicit = uppercaseLine.match(/\bQTY\s*[:-]?\s*(\d{1,2})\b/);
  if (explicit?.[1]) {
    const numeric = Number(explicit[1]);
    if (numeric > 0) {
      return numeric;
    }
  }

  const before = uppercaseLine.slice(Math.max(0, startIndex - 14), startIndex);
  const beforeMatch = before.match(/(?:^|\s)(\d{1,2})\s*[xX]\s*$/);
  if (beforeMatch?.[1]) {
    const numeric = Number(beforeMatch[1]);
    if (numeric > 0) {
      return numeric;
    }
  }

  // Also handle plain " 2 RX350" style quantities immediately before the code.
  const plainBefore = before.match(/(?:^|\s)(\d{1,2})\s*$/);
  if (plainBefore?.[1]) {
    const numeric = Number(plainBefore[1]);
    if (numeric > 0) {
      return numeric;
    }
  }

  const after = uppercaseLine.slice(endIndex, Math.min(uppercaseLine.length, endIndex + 14));
  const afterMatch = after.match(QUANTITY_AFTER_CODE_REGEX);
  if (afterMatch?.[1]) {
    const numeric = Number(afterMatch[1]);
    if (numeric > 0) {
      return numeric;
    }
  }

  const lineStartMatch = uppercaseLine.match(QUANTITY_BEFORE_CODE_REGEX);
  if (lineStartMatch?.[1]) {
    const numeric = Number(lineStartMatch[1]);
    if (numeric > 0) {
      return numeric;
    }
  }

  const parenMatch = uppercaseLine.match(/\((\d{1,2})\)/);
  if (parenMatch?.[1]) {
    const numeric = Number(parenMatch[1]);
    if (numeric > 0) {
      return numeric;
    }
  }

  return 1;
}

function summarizeVehicles(vehicles: AllocationVehicle[]): AllocationSummary {
  const units = vehicles.reduce((total, vehicle) => total + vehicle.quantity, 0);
  const value = vehicles.reduce((total, vehicle) => total + vehicle.totalValue, 0);
  const hybridUnits = vehicles
    .filter(
      (vehicle) =>
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

export function parseAllocationSource(sourceText: string): ParsedAllocationResult {
  const normalized = sourceText
    .replace(/\r\n/g, "\n")
    // Normalize PDF dash variants so color token/date regexes stay reliable.
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

  // Keep whitespace for fixed-column slicing (PDF-style paste), but ignore empty lines.
  const lines = normalized
    .split("\n")
    .map((line) => line.replace(/\s+$/g, ""))
    .filter((line) => line.trim().length > 0);

  const layout = detectColumnLayout(lines);

  const blocks: AllocationBlock[] = [];
  const inBlock = new Array(lines.length).fill(false) as boolean[];
  let current: { start: number; lines: string[]; kind: "dm" | "code" } | null = null;

  lines.forEach((line, index) => {
    const upper = line.toUpperCase();
    const isDmRowStart = isToyotaDMAllocationRowLine(upper);
    const codeMatches = findModelCodeMatchesInLine(upper);
    const isCodeRowStart = codeMatches.length > 0 && !isHeaderLikeLine(upper);

    const shouldStartNewBlock =
      isDmRowStart ||
      (isCodeRowStart && (!current || current.kind === "code"));

    if (shouldStartNewBlock) {
      if (current) {
        blocks.push({
          startLineIndex: current.start,
          lines: current.lines,
          rowLine: current.lines[0],
          rowLineUpper: current.lines[0].toUpperCase(),
          blockTextUpper: current.lines.join(" ").toUpperCase(),
        });
      }

      current = { start: index, lines: [line], kind: isDmRowStart ? "dm" : "code" };
      inBlock[index] = true;
      return;
    }

    if (current) {
      // Continuation of the previous row block.
      if (current.kind === "dm" && (isIgnorableNoiseLine(upper) || isHeaderLikeLine(upper))) {
        return;
      }
      current.lines.push(line);
      inBlock[index] = true;
    }
  });

  if (current) {
    blocks.push({
      startLineIndex: current.start,
      lines: current.lines,
      rowLine: current.lines[0],
      rowLineUpper: current.lines[0].toUpperCase(),
      blockTextUpper: current.lines.join(" ").toUpperCase(),
    });
  }

  blocks.forEach((block, blockIndex) => {
    const matches = findModelCodeMatchesInLine(block.blockTextUpper);
    if (matches.length === 0) {
      return;
    }

    const isToyotaDM = isToyotaDMAllocationRowLine(block.rowLineUpper);
    const uniqueMatches: CodeMatch[] = [];
    const seenCodes = new Set<string>();
    for (const match of matches) {
      if (seenCodes.has(match.code)) {
        continue;
      }
      seenCodes.add(match.code);
      uniqueMatches.push(match);
    }

    const matchesToEmit = isToyotaDM ? uniqueMatches.slice(0, 1) : uniqueMatches;
    if (matchesToEmit.length === 0) {
      return;
    }

    const vehiclesBefore = vehicles.length;

    const arrival = detectArrivalFromBlock(block, layout, reportYear);
    const exteriorColor = detectExteriorColorFromBlock(block, layout);
    const interiorColor = detectInteriorColorFromBlock(block, layout);
    const bos = detectBosFromBlock(block, layout);
    const lookbackSourceCode = detectSourceCodeFromLookback(lines, block.startLineIndex);
    const blockSourceCode = detectSourceCodeFromBlock(block);

    matchesToEmit.forEach((match) => {
      const reference = LEXUS_ALLOCATION_REFERENCE[match.code];
      if (!reference) {
        return;
      }

      // Resolve source code per match so multi-model wrapped blocks do not share one code.
      const sourceCode =
        detectSourceCode(block.blockTextUpper.slice(0, Math.max(0, match.start))) ??
        lookbackSourceCode ??
        blockSourceCode;

      const quantity = isToyotaDM
        ? 1
        : detectQuantity(block.blockTextUpper, match.start, match.end, layout);
      // MSRP/profit can change frequently and may not be present in the source.
      // Keep allocation snapshots MSRP-free by not computing value from reference tables.
      const msrp = 0;
      const profit = 0;
      const totalValue = 0;

      vehicles.push({
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
        msrp,
        category: reference.category,
        type: reference.type,
        rank: reference.rank,
        profit,
        totalValue,
      });
    });

    // If we detected a block but still produced nothing, warn.
    if (blockIndex >= 0 && matchesToEmit.length > 0 && vehicles.length === vehiclesBefore) {
      warnings.push(
        `Block starting at line ${block.startLineIndex + 1} skipped: no mapped Lexus model code found.`,
      );
    }
  });

  // Add warnings for noisy lines that were not part of any detected row block.
  lines.forEach((line, index) => {
    if (inBlock[index]) {
      return;
    }
    const upper = line.toUpperCase();
    if (layout && index === layout.headerLineIndex) {
      return;
    }
    if (!/[A-Z0-9]{3,}/.test(upper)) {
      return;
    }
    if (!/\d/.test(upper)) {
      return;
    }
    if (isHeaderLikeLine(upper)) {
      return;
    }
    if (isIgnorableNoiseLine(upper)) {
      return;
    }
    warnings.push(`Line ${index + 1} skipped: no mapped Lexus model code found.`);
  });

  if (vehicles.length === 0) {
    return {
      reportDate,
      vehicles: [],
      summary: { units: 0, value: 0, hybridMix: 0 },
      itemCount: 0,
      warnings,
      errors: [
        "No supported Lexus model codes were found. Verify source text and mapping table.",
      ],
    };
  }

  const summary = summarizeVehicles(vehicles);

  return {
    reportDate,
    vehicles,
    summary,
    itemCount: vehicles.length,
    warnings,
    errors: [],
  };
}

export function groupArrivalBucket(arrival: string): string {
  const normalizedArrival = arrival?.trim().toUpperCase();
  if (!normalizedArrival || normalizedArrival === "TBD") {
    return "UNSCHEDULED";
  }

  const parsed = new Date(normalizedArrival);
  if (Number.isNaN(parsed.getTime())) {
    return normalizedArrival;
  }

  const today = new Date();
  const diff = parsed.getTime() - today.getTime();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

  if (days <= 7) {
    return "ARRIVING ≤ 7 DAYS";
  }
  if (days <= 30) {
    return "ARRIVING 8-30 DAYS";
  }
  return "ARRIVING 30+ DAYS";
}
