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
/** Lowercase color name → OEM code (e.g., "caviar" → "223") */
const exteriorNameToCode = new Map<string, string>();

for (const entry of EXTERIOR_COLORS) {
  exteriorCodeToName.set(entry.code.toUpperCase(), entry.name);
  exteriorNameToCode.set(entry.name.toLowerCase(), entry.code);
  for (const alias of entry.aliases) {
    // Don't overwrite more specific matches (e.g., "black" → first match wins)
    if (!exteriorNameToCode.has(alias)) {
      exteriorNameToCode.set(alias, entry.code);
    }
  }
}

/**
 * Resolve an exterior color input to a standardized name.
 * Accepts OEM codes ("223"), full names ("Caviar"), or informal names ("black").
 * Returns the official color name or null if no match.
 */
export function resolveExteriorColor(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Try as OEM code first
  const byCode = exteriorCodeToName.get(trimmed.toUpperCase());
  if (byCode) return byCode;

  // Try as name/alias (case-insensitive)
  const lower = trimmed.toLowerCase();
  const code = exteriorNameToCode.get(lower);
  if (code) {
    return exteriorCodeToName.get(code.toUpperCase()) ?? null;
  }

  // Partial match: check if input contains or is contained by any alias
  for (const entry of EXTERIOR_COLORS) {
    if (entry.name.toLowerCase().includes(lower) || lower.includes(entry.name.toLowerCase())) {
      return entry.name;
    }
    for (const alias of entry.aliases) {
      if (alias.includes(lower) || lower.includes(alias)) {
        return entry.name;
      }
    }
  }

  return null;
}

/**
 * Check if two color inputs refer to the same exterior color.
 * Handles codes, names, and informal aliases.
 * Returns: "exact" if same color, "partial" if same base color family, null if no match.
 */
export function matchExteriorColors(
  colorA: string,
  colorB: string,
): "exact" | "partial" | null {
  const resolvedA = resolveExteriorColor(colorA);
  const resolvedB = resolveExteriorColor(colorB);

  if (!resolvedA || !resolvedB) return null;

  // Exact same resolved color
  if (resolvedA === resolvedB) return "exact";

  // Check if they share a color family alias (e.g., both resolve to a "black" alias)
  const entryA = EXTERIOR_COLORS.find((e) => e.name === resolvedA);
  const entryB = EXTERIOR_COLORS.find((e) => e.name === resolvedB);
  if (entryA && entryB) {
    const familiesA = new Set(entryA.aliases);
    const familiesB = new Set(entryB.aliases);
    for (const family of familiesA) {
      if (familiesB.has(family)) return "partial";
    }
  }

  return null;
}
