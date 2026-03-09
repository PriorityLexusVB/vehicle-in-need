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
const HYPHEN_MONTH_DAY_PATTERN = /\b(\d{1,2})-(\d{1,2})\b/;
const COLOR_PATTERN = /(black|white|silver|gray|grey|red|blue|green|caviar|atomic\s+silver|cloudburst|ematador|nori\s+green|ultrasonic\s+blue)/i;
const GRADE_PATTERN = /(f\s*sport\s*performance|f\s*sport|luxury|premium|base|overtrail|ultra\s*luxury|performance)/i;
const INTERIOR_PATTERN = /\b(?:INT(?:ERIOR)?|INT\s*COLOR)\s*[:#-]?\s*([A-Z0-9]{2,4})\b/i;
const BOS_PATTERN = /\bBOS\s*[:#-]?\s*(Y|N|TBD)\b/i;
const FACTORY_ACCESSORIES_PATTERN = /\b(?:FACTORY\s*ACCY|FACTORY\s*ACCESSORIES?)\s*[:#-]?\s*([A-Z0-9\s-]+)/i;
const PPO_PATTERN = /\b(?:PPOS?|POST-?PRODUCTION\s*OPTIONS?)\s*[:#-]?\s*([A-Z0-9\s-]+)/i;
const SOURCE_CODE_PATTERN = /\b(\d{4}[A-Z]?)\b/;
const SOURCE_CODE_SPLIT_PATTERN = /\b(\d{4})\s*[- ]\s*([A-Z])\b/;

function cleanExtractedField(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned || /^(unknown|n\/a|na|tbd)$/i.test(cleaned)) {
    return undefined;
  }

  return cleaned;
}

function normalizeDate(rawDate: string): string | null {
  const cleaned = rawDate.trim().replace(/,$/, "");
  if (!cleaned) {
    return null;
  }

  const slashMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (slashMatch) {
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

  const directDate = new Date(cleaned);
  if (!Number.isNaN(directDate.getTime())) {
    return directDate.toISOString().slice(0, 10);
  }

  const hyphenMonthDayMatch = cleaned.match(/^(\d{1,2})-(\d{1,2})$/);
  if (hyphenMonthDayMatch) {
    const month = Number(hyphenMonthDayMatch[1]);
    const day = Number(hyphenMonthDayMatch[2]);
    const year = new Date().getFullYear();

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

function detectArrival(line: string): string {
  const tagged = line.match(ARRIVAL_PATTERN);
  if (tagged?.[2]) {
    return normalizeDate(tagged[2]) || tagged[2].toUpperCase();
  }

  const shortDate = line.match(SHORT_DATE_PATTERN);
  if (shortDate?.[1]) {
    return normalizeDate(shortDate[1]) || shortDate[1];
  }

  const hyphenMonthDay = line.match(HYPHEN_MONTH_DAY_PATTERN);
  if (hyphenMonthDay?.[0]) {
    return normalizeDate(hyphenMonthDay[0]) || hyphenMonthDay[0];
  }

  return "TBD";
}

function detectColor(line: string): string {
  const colorMatch = line.match(COLOR_PATTERN);
  return colorMatch ? colorMatch[0].replace(/\s+/g, " ").toUpperCase() : "TBD";
}

function detectInterior(line: string): string | undefined {
  const interiorMatch = line.match(INTERIOR_PATTERN);
  return cleanExtractedField(interiorMatch?.[1]?.toUpperCase());
}

function detectBos(line: string): string {
  const bosMatch = line.match(BOS_PATTERN);
  if (!bosMatch?.[1]) {
    return "TBD";
  }

  const bos = bosMatch[1].toUpperCase();
  return bos === "Y" || bos === "N" ? bos : "TBD";
}

function detectFactoryAccessories(line: string): string | undefined {
  const match = line.match(FACTORY_ACCESSORIES_PATTERN);
  if (!match?.[1]) {
    return undefined;
  }

  const value = match[1].split(/\b(?:PPOS?|POST-?PRODUCTION\s*OPTIONS?)\b/i)[0];
  return cleanExtractedField(value?.toUpperCase());
}

function detectPpos(line: string): string | undefined {
  const match = line.match(PPO_PATTERN);
  const raw = match?.[1]?.split(/\b(?:BOS|LOC)\b/i)[0];
  return cleanExtractedField(raw?.toUpperCase());
}

function detectSourceCode(line: string): string | undefined {
  const splitMatch = line.match(SOURCE_CODE_SPLIT_PATTERN);
  if (splitMatch?.[1] && splitMatch?.[2]) {
    return cleanExtractedField(`${splitMatch[1]}${splitMatch[2]}`.toUpperCase());
  }

  const match = line.match(SOURCE_CODE_PATTERN);
  return cleanExtractedField(match?.[1]?.toUpperCase());
}

function fallbackFromAdjacentLines<T>(
  currentValue: T | undefined,
  previousLine: string,
  nextLine: string,
  detector: (line: string) => T | undefined,
): T | undefined {
  if (currentValue !== undefined) {
    return currentValue;
  }

  return detector(previousLine) ?? detector(nextLine);
}

function detectArrivalWithAdjacentFallback(
  line: string,
  previousLine: string,
  nextLine: string,
): string {
  const current = detectArrival(line);
  if (current !== "TBD") {
    return current;
  }

  const fromPrevious = detectArrival(previousLine);
  if (fromPrevious !== "TBD") {
    return fromPrevious;
  }

  const fromNext = detectArrival(nextLine);
  if (fromNext !== "TBD") {
    return fromNext;
  }

  return "TBD";
}

function detectTimelineType(line: string): "build" | "port" {
  return /\b(port|vpc|at port|port date|to port|from port)\b/i.test(line)
    ? "port"
    : "build";
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

function buildFlexibleCodeRegex(code: string): RegExp {
  const pattern = code
    .split("")
    .map((char) => {
      if (/[A-Z0-9]/.test(char)) {
        return `${char}[\\s-]*`;
      }

      if (char === "+") {
        return "\\+\\s*";
      }

      return `${char.replace(/[.*?^${}()|[\]\\]/g, "\\$&")}[\\s-]*`;
    })
    .join("");

  return new RegExp(`\\b${pattern}\\b`, "g");
}

function containsExactModelToken(line: string): boolean {
  return LEXUS_REFERENCE_CODES.some((code) => new RegExp(`\\b${code}\\b`).test(line));
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
  const consumedLineIndexes = new Set<number>();
  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  lines.forEach((line, lineIndex) => {
    if (consumedLineIndexes.has(lineIndex)) {
      return;
    }

    const uppercaseLine = line.toUpperCase();
    const previousPreviousLine = lineIndex > 1 ? lines[lineIndex - 2].toUpperCase() : "";
    const previousLine = lineIndex > 0 ? lines[lineIndex - 1].toUpperCase() : "";
    const nextLine = lineIndex < lines.length - 1 ? lines[lineIndex + 1].toUpperCase() : "";
    const canUseMergedNextLine =
      Boolean(nextLine) &&
      !containsExactModelToken(uppercaseLine) &&
      !containsExactModelToken(nextLine);
    const mergedWithNextLine = canUseMergedNextLine
      ? `${uppercaseLine} ${nextLine}`
      : uppercaseLine;
    let matchedInLine = false;
    let matchedUsingMergedLine = false;

    for (const code of LEXUS_REFERENCE_CODES) {
      const regex = buildFlexibleCodeRegex(code);
      let extractionLine = uppercaseLine;
      let regexMatch: RegExpExecArray | null = regex.exec(extractionLine);

      if (!regexMatch && mergedWithNextLine !== uppercaseLine) {
        regex.lastIndex = 0;
        extractionLine = mergedWithNextLine;
        regexMatch = regex.exec(extractionLine);
      }

      while (regexMatch) {
        matchedInLine = true;
        if (extractionLine !== uppercaseLine) {
          matchedUsingMergedLine = true;
        }
        const reference = LEXUS_ALLOCATION_REFERENCE[code];
        const quantity = detectQuantity(extractionLine, regexMatch.index, code.length);
        const totalValue = reference.msrp * quantity;
        const sourceContext = [previousPreviousLine, previousLine, extractionLine]
          .filter(Boolean)
          .join(" ");
        const detailContext = [previousPreviousLine, previousLine, extractionLine, nextLine]
          .filter(Boolean)
          .join(" ");
        const sourceCode = fallbackFromAdjacentLines(
          detectSourceCode(sourceContext),
          previousLine,
          nextLine,
          detectSourceCode,
        );
        const interior = fallbackFromAdjacentLines(
          detectInterior(detailContext),
          previousLine,
          nextLine,
          detectInterior,
        );
        const factoryAccessories = fallbackFromAdjacentLines(
          detectFactoryAccessories(detailContext),
          previousLine,
          nextLine,
          detectFactoryAccessories,
        );
        const postProductionOptions = fallbackFromAdjacentLines(
          detectPpos(detailContext),
          previousLine,
          nextLine,
          detectPpos,
        );
        const bos = fallbackFromAdjacentLines(
          detectBos(detailContext) === "TBD" ? undefined : detectBos(detailContext),
          previousLine,
          nextLine,
          (text) => {
            const detected = detectBos(text);
            return detected === "TBD" ? undefined : detected;
          },
        ) ?? "TBD";
        const arrival = detectArrivalWithAdjacentFallback(
          detailContext,
          previousLine,
          nextLine,
        );
        const timelineType = detectTimelineType(
          `${previousPreviousLine} ${previousLine} ${extractionLine} ${nextLine}`,
        );

        vehicles.push({
          id: `${code}-${lineIndex}-${regexMatch.index}-${vehicles.length}`,
          code,
          model: reference.code,
          sourceCode,
          quantity,
          color: detectColor(extractionLine),
          interior,
          arrival,
          timelineType,
          bos,
          grade: detectGrade(extractionLine, reference),
          factoryAccessories,
          postProductionOptions,
          engine: reference.engine,
          msrp: reference.msrp,
          category: reference.category,
          type: reference.type,
          rank: reference.rank,
          profit: reference.profit,
          totalValue,
        });

        regexMatch = regex.exec(extractionLine);
      }
    }

    if (matchedUsingMergedLine && lineIndex < lines.length - 1) {
      consumedLineIndexes.add(lineIndex + 1);
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
