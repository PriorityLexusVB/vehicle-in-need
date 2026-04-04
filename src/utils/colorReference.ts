/**
 * 2025–2026 Lexus Paint & Interior Color Reference.
 * Maps OEM codes to color names and vice versa, enabling fuzzy matching
 * between order color preferences and allocation paint codes.
 */

export interface ExteriorColorEntry {
  code: string;
  name: string;
  /** Lowercase search aliases (common abbreviations, informal names) */
  aliases: string[];
}

export interface InteriorColorEntry {
  codes: string[];
  name: string;
  aliases: string[];
}

/**
 * Exterior paint colors. Code is the 3-character Lexus OEM code.
 */
export const EXTERIOR_COLORS: ExteriorColorEntry[] = [
  // Whites
  { code: "083", name: "Ultra White", aliases: ["white", "ultra white"] },
  { code: "085", name: "Eminent White Pearl", aliases: ["white", "eminent white", "sonic quartz", "pearl white", "white pearl"] },
  { code: "089", name: "Wind Chill Pearl", aliases: ["wind chill", "white", "pearl"] },
  { code: "090", name: "Oxygen White", aliases: ["white", "oxygen white"] },
  // Silvers / Grays
  { code: "1J7", name: "Atomic Silver", aliases: ["silver", "atomic silver", "sonic titanium"] },
  { code: "1L2", name: "Iridium", aliases: ["iridium", "gray", "grey", "sonic iridium"] },
  { code: "1L1", name: "Cloudburst Gray", aliases: ["cloudburst", "gray", "grey", "sonic chrome"] },
  { code: "1L8", name: "Incognito", aliases: ["incognito", "gray", "grey"] },
  { code: "1K2", name: "Manganese Luster", aliases: ["manganese", "gray", "grey", "luster"] },
  { code: "1M1", name: "Smoke Matte Gray", aliases: ["smoke", "matte gray", "matte grey", "gray", "grey"] },
  { code: "1N0", name: "Wind", aliases: ["wind", "gray", "grey", "neutrino gray"] },
  // Blacks
  { code: "223", name: "Caviar", aliases: ["black", "caviar"] },
  { code: "212", name: "Obsidian", aliases: ["black", "obsidian"] },
  { code: "232", name: "Ninety Noir", aliases: ["black", "noir", "ninety noir"] },
  // Reds
  { code: "3R1", name: "Matador Red Mica", aliases: ["red", "matador", "matador red"] },
  { code: "3T5", name: "Infrared", aliases: ["red", "infrared"] },
  { code: "3T2", name: "Redline", aliases: ["red", "redline", "racing red"] },
  // Browns / Coppers
  { code: "4Y5", name: "Copper Crest", aliases: ["copper", "copper crest", "brown"] },
  { code: "4Z1", name: "Earth", aliases: ["earth", "brown", "green"] },
  // Greens
  { code: "6X4", name: "Nori Green Pearl", aliases: ["green", "nori green", "nori"] },
  { code: "6X0", name: "Sunlit Green", aliases: ["green", "sunlit green"] },
  // Yellows
  { code: "5C1", name: "Flare Yellow", aliases: ["yellow", "flare yellow"] },
  // Blues / Purples
  { code: "8X5", name: "Nightfall Mica", aliases: ["navy", "blue", "nightfall", "nightfall mica"] },
  { code: "8X1", name: "Ultrasonic Blue 2.0", aliases: ["blue", "ultrasonic blue", "ultrasonic"] },
  { code: "8Y6", name: "Grecian Water", aliases: ["blue", "grecian water", "teal"] },
  { code: "8Z2", name: "Ether", aliases: ["blue", "ether", "light blue"] },
  // Special / New 2026
  { code: "1M5", name: "Wavelength", aliases: ["wavelength"] },
];

/**
 * Interior colors. Codes include both NuLuxe (EA) and Leather (LA) variants.
 */
export const INTERIOR_COLORS: InteriorColorEntry[] = [
  { codes: ["EA20", "LA20"], name: "Black", aliases: ["black"] },
  { codes: ["EA10", "LA10"], name: "Birch", aliases: ["birch", "light gray", "grey", "gray"] },
  { codes: ["EA40", "LA40"], name: "Palomino", aliases: ["palomino", "tan", "camel"] },
  { codes: ["EA01", "LA01"], name: "Macadamia", aliases: ["macadamia", "cream", "ivory", "white"] },
  { codes: ["EA41", "LA41"], name: "Acorn", aliases: ["acorn", "brown"] },
  { codes: ["EA30", "LA30"], name: "Rioja Red", aliases: ["rioja", "red", "burgundy"] },
  { codes: ["EA31", "LA31"], name: "Circuit Red", aliases: ["circuit red", "red"] },
  { codes: ["EA80", "LA80"], name: "Peppercorn", aliases: ["peppercorn", "gray", "grey"] },
  { codes: ["LB81"], name: "White/Peppercorn", aliases: ["white peppercorn", "bi-tone"] },
  { codes: ["LA44"], name: "Sunflare", aliases: ["sunflare", "gold", "yellow"] },
  { codes: ["LA45"], name: "Stone Brown", aliases: ["stone brown", "brown", "stone"] },
  { codes: ["EA32", "LA32"], name: "Mauve", aliases: ["mauve", "purple"] },
  { codes: ["EA42", "LA42"], name: "Glazed Caramel", aliases: ["glazed caramel", "caramel", "tan"] },
  { codes: ["EA14", "LA14"], name: "Chateau", aliases: ["chateau", "tan", "neutral"] },
  { codes: ["EA44", "LA44"], name: "Earth / Black", aliases: ["earth", "overtrail"] },
];

// Build fast lookup maps

/** OEM code → color name (e.g., "223" → "Caviar") */
const exteriorCodeToName = new Map<string, string>();
/** Exact lowercase name → entry (e.g., "caviar" → entry) */
const exteriorExactName = new Map<string, ExteriorColorEntry>();
/** Generic aliases that map to MULTIPLE colors (e.g., "blue" → 4 different blues) */
const genericAliasToEntries = new Map<string, ExteriorColorEntry[]>();

for (const entry of EXTERIOR_COLORS) {
  exteriorCodeToName.set(entry.code.toUpperCase(), entry.name);
  exteriorExactName.set(entry.name.toLowerCase(), entry);
  for (const alias of entry.aliases) {
    const list = genericAliasToEntries.get(alias) ?? [];
    list.push(entry);
    genericAliasToEntries.set(alias, list);
  }
}

interface ColorResolution {
  name: string;
  /** "specific" = OEM code or exact name; "generic" = alias like "blue" or "black" */
  precision: "specific" | "generic";
  entry: ExteriorColorEntry;
}

/**
 * Resolve an exterior color input to a standardized entry.
 * Accepts OEM codes ("223"), full names ("Caviar"), or informal names ("black").
 */
function resolveColor(input: string): ColorResolution | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // 1. Try as OEM code (most precise)
  const byCode = exteriorCodeToName.get(trimmed.toUpperCase());
  if (byCode) {
    const entry = EXTERIOR_COLORS.find((e) => e.name === byCode);
    if (entry) return { name: byCode, precision: "specific", entry };
  }

  const lower = trimmed.toLowerCase();

  // 2. Try as exact official name (e.g., "Caviar", "Ultrasonic Blue 2.0")
  const byExactName = exteriorExactName.get(lower);
  if (byExactName) return { name: byExactName.name, precision: "specific", entry: byExactName };

  // 3. Try as alias — if it maps to exactly 1 color, it's specific; if multiple, it's generic
  const aliasMatches = genericAliasToEntries.get(lower);
  if (aliasMatches && aliasMatches.length === 1) {
    return { name: aliasMatches[0].name, precision: "specific", entry: aliasMatches[0] };
  }
  if (aliasMatches && aliasMatches.length > 1) {
    // Generic term like "blue" or "black" — resolve to first but mark as generic
    return { name: aliasMatches[0].name, precision: "generic", entry: aliasMatches[0] };
  }

  // 4. Substring match (e.g., "ultrasonic" finds "Ultrasonic Blue 2.0")
  for (const entry of EXTERIOR_COLORS) {
    const entryLower = entry.name.toLowerCase();
    if (entryLower.includes(lower) || lower.includes(entryLower)) {
      return { name: entry.name, precision: "specific", entry };
    }
    for (const alias of entry.aliases) {
      if (alias.length > 3 && (alias.includes(lower) || lower.includes(alias))) {
        return { name: entry.name, precision: "specific", entry };
      }
    }
  }

  return null;
}

/**
 * Resolve an exterior color input to a standardized name.
 * Accepts OEM codes ("223"), full names ("Caviar"), or informal names ("black").
 * Returns the official color name or null if no match.
 */
export function resolveExteriorColor(input: string): string | null {
  return resolveColor(input)?.name ?? null;
}

/**
 * Check if two color inputs refer to the same exterior color.
 * Handles codes, names, and informal aliases.
 *
 * Returns:
 * - "exact" if both resolve to the SAME specific color (e.g., "223" vs "Caviar")
 * - "partial" if they share a color family (e.g., "black" matches both Caviar & Obsidian)
 *   or if either input is a generic term (e.g., "blue" is partial for any blue)
 * - null if no relationship
 */
export function matchExteriorColors(
  colorA: string,
  colorB: string,
): "exact" | "partial" | null {
  const resA = resolveColor(colorA);
  const resB = resolveColor(colorB);

  if (!resA || !resB) return null;

  // If both are specific and resolve to the same color → exact
  if (resA.precision === "specific" && resB.precision === "specific") {
    if (resA.name === resB.name) return "exact";
  }

  // If one is generic (e.g., "blue") and the other matches a color in that family → partial
  // Also covers: same name but one/both are generic → partial (not exact)
  if (resA.name === resB.name) return resA.precision === "specific" && resB.precision === "specific" ? "exact" : "partial";

  // Check if they share a color family alias
  const familiesA = new Set(resA.entry.aliases);
  const familiesB = new Set(resB.entry.aliases);
  for (const family of familiesA) {
    if (familiesB.has(family)) return "partial";
  }

  return null;
}

// ─── Interior Color Matching ────────────────────────────────────────────────

/** Interior OEM code → entry (e.g., "EA20" or "LA20" → Black entry) */
const interiorCodeToEntry = new Map<string, InteriorColorEntry>();
/** Exact lowercase name → entry */
const interiorExactName = new Map<string, InteriorColorEntry>();
/** Generic interior aliases → multiple entries */
const interiorAliasToEntries = new Map<string, InteriorColorEntry[]>();

for (const entry of INTERIOR_COLORS) {
  for (const code of entry.codes) {
    interiorCodeToEntry.set(code.toUpperCase(), entry);
  }
  interiorExactName.set(entry.name.toLowerCase(), entry);
  for (const alias of entry.aliases) {
    const list = interiorAliasToEntries.get(alias) ?? [];
    list.push(entry);
    interiorAliasToEntries.set(alias, list);
  }
}

interface InteriorResolution {
  name: string;
  precision: "specific" | "generic";
  entry: InteriorColorEntry;
}

function resolveInterior(input: string): InteriorResolution | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // 1. Try as OEM code (EA20, LA20, LB81, etc.)
  const byCode = interiorCodeToEntry.get(trimmed.toUpperCase());
  if (byCode) return { name: byCode.name, precision: "specific", entry: byCode };

  const lower = trimmed.toLowerCase();

  // 2. Exact official name
  const byName = interiorExactName.get(lower);
  if (byName) return { name: byName.name, precision: "specific", entry: byName };

  // 3. Alias — single match = specific, multiple = generic
  const aliasMatches = interiorAliasToEntries.get(lower);
  if (aliasMatches && aliasMatches.length === 1) {
    return { name: aliasMatches[0].name, precision: "specific", entry: aliasMatches[0] };
  }
  if (aliasMatches && aliasMatches.length > 1) {
    return { name: aliasMatches[0].name, precision: "generic", entry: aliasMatches[0] };
  }

  // 4. Substring match
  for (const entry of INTERIOR_COLORS) {
    const entryLower = entry.name.toLowerCase();
    if (entryLower.includes(lower) || lower.includes(entryLower)) {
      return { name: entry.name, precision: "specific", entry };
    }
    for (const alias of entry.aliases) {
      if (alias.length > 3 && (alias.includes(lower) || lower.includes(alias))) {
        return { name: entry.name, precision: "specific", entry };
      }
    }
  }

  return null;
}

/**
 * Resolve an interior color input to a standardized name.
 */
export function resolveInteriorColor(input: string): string | null {
  return resolveInterior(input)?.name ?? null;
}

/**
 * Check if two interior color inputs refer to the same interior color.
 * Same logic as exterior: specific+specific same = exact, generic = partial, family = partial.
 */
export function matchInteriorColors(
  colorA: string,
  colorB: string,
): "exact" | "partial" | null {
  const resA = resolveInterior(colorA);
  const resB = resolveInterior(colorB);

  if (!resA || !resB) return null;

  if (resA.precision === "specific" && resB.precision === "specific") {
    if (resA.name === resB.name) return "exact";
  }

  if (resA.name === resB.name) return resA.precision === "specific" && resB.precision === "specific" ? "exact" : "partial";

  const familiesA = new Set(resA.entry.aliases);
  const familiesB = new Set(resB.entry.aliases);
  for (const family of familiesA) {
    if (familiesB.has(family)) return "partial";
  }

  return null;
}
