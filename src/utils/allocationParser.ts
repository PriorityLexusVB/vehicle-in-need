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
const ARRIVAL_PATTERN = /(eta|arrival)\s*[:-]?\s*([\w/-]+)/i;
const SHORT_DATE_PATTERN = /\b(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/;
const COLOR_PATTERN = /(black|white|silver|gray|grey|red|blue|green|caviar|atomic\s+silver|cloudburst|ematador|nori\s+green|ultrasonic\s+blue)/i;
const GRADE_PATTERN = /(f\s*sport\s*performance|f\s*sport|luxury|premium|base|overtrail|ultra\s*luxury|performance)/i;

function normalizeDate(rawDate: string): string | null {
  const cleaned = rawDate.trim().replace(/,$/, "");
  if (!cleaned) {
    return null;
  }

  const directDate = new Date(cleaned);
  if (!Number.isNaN(directDate.getTime())) {
    return directDate.toISOString().slice(0, 10);
  }

  const slashMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (!slashMatch) {
    return null;
  }

  const month = Number(slashMatch[1]);
  const day = Number(slashMatch[2]);
  let year = slashMatch[3] ? Number(slashMatch[3]) : new Date().getFullYear();

  if (year < 100) {
    year += 2000;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const safeDate = new Date(Date.UTC(year, month - 1, day));
  return safeDate.toISOString().slice(0, 10);
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

function detectArrival(line: string): string {
  const tagged = line.match(ARRIVAL_PATTERN);
  if (tagged?.[2]) {
    return normalizeDate(tagged[2]) || tagged[2].toUpperCase();
  }

  const shortDate = line.match(SHORT_DATE_PATTERN);
  if (shortDate?.[1]) {
    return normalizeDate(shortDate[1]) || shortDate[1];
  }

  return "TBD";
}

function detectColor(line: string): string {
  const colorMatch = line.match(COLOR_PATTERN);
  return colorMatch ? colorMatch[0].replace(/\s+/g, " ").toUpperCase() : "TBD";
}

function detectGrade(line: string, reference: LexusAllocationReference): string {
  const gradeMatch = line.match(GRADE_PATTERN);
  return gradeMatch
    ? gradeMatch[0].replace(/\s+/g, " ").toUpperCase()
    : reference.grade;
}

function detectQuantity(line: string, startIndex: number, codeLength: number): number {
  const before = line.slice(0, startIndex);
  const beforeMatch = before.match(/(?:^|\s)(\d{1,2})\s*[xX]\s*$/);
  if (beforeMatch?.[1]) {
    const numeric = Number(beforeMatch[1]);
    if (numeric > 0) {
      return numeric;
    }
  }

  const after = line.slice(startIndex + codeLength);
  const afterMatch = after.match(QUANTITY_AFTER_CODE_REGEX);
  if (afterMatch?.[1]) {
    const numeric = Number(afterMatch[1]);
    if (numeric > 0) {
      return numeric;
    }
  }

  const lineStartMatch = line.match(QUANTITY_BEFORE_CODE_REGEX);
  if (lineStartMatch?.[1]) {
    const numeric = Number(lineStartMatch[1]);
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
  const normalized = sourceText.replace(/\r\n/g, "\n").trim();
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

  const vehicles: AllocationVehicle[] = [];
  const warnings: string[] = [];
  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  lines.forEach((line, lineIndex) => {
    const uppercaseLine = line.toUpperCase();
    let matchedInLine = false;

    for (const code of LEXUS_REFERENCE_CODES) {
      const regex = new RegExp(`\\b${code}\\b`, "g");
      let regexMatch: RegExpExecArray | null = regex.exec(uppercaseLine);

      while (regexMatch) {
        matchedInLine = true;
        const reference = LEXUS_ALLOCATION_REFERENCE[code];
        const quantity = detectQuantity(uppercaseLine, regexMatch.index, code.length);
        const totalValue = reference.msrp * quantity;

        vehicles.push({
          id: `${code}-${lineIndex}-${regexMatch.index}-${vehicles.length}`,
          code,
          quantity,
          color: detectColor(uppercaseLine),
          arrival: detectArrival(uppercaseLine),
          grade: detectGrade(uppercaseLine, reference),
          engine: reference.engine,
          msrp: reference.msrp,
          category: reference.category,
          type: reference.type,
          rank: reference.rank,
          profit: reference.profit,
          totalValue,
        });

        regexMatch = regex.exec(uppercaseLine);
      }
    }

    if (!matchedInLine && /[A-Z0-9]{3,}/.test(uppercaseLine)) {
      warnings.push(`Line ${lineIndex + 1} skipped: no mapped Lexus model code found.`);
    }
  });

  if (vehicles.length === 0) {
    return {
      reportDate: detectReportDate(normalized),
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
    reportDate: detectReportDate(normalized),
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
