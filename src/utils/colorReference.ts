/**
 * 2025–2026 Lexus Paint & Interior Color Reference.
 * Maps OEM codes to color names and vice versa, enabling fuzzy matching
 * between order color preferences and allocation paint codes.
 */

interface ColorEntry {
  name: string;
  aliases: string[];
}

export interface ExteriorColorEntry extends ColorEntry {
  code: string;
}

export interface InteriorColorEntry extends ColorEntry {
  codes: string[];
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
  { codes: ["LA46"], name: "Sunflare", aliases: ["sunflare", "gold", "yellow"] },
  { codes: ["LA45"], name: "Stone Brown", aliases: ["stone brown", "brown", "stone"] },
  { codes: ["EA32", "LA32"], name: "Mauve", aliases: ["mauve", "purple"] },
  { codes: ["EA42", "LA42"], name: "Glazed Caramel", aliases: ["glazed caramel", "caramel", "tan"] },
  { codes: ["EA14", "LA14"], name: "Chateau", aliases: ["chateau", "tan", "neutral"] },
  { codes: ["EA44", "LA44"], name: "Earth / Black", aliases: ["earth", "overtrail"] },
];

// ─── Generic Color Resolver Factory ─────────────────────────────────────────

interface Resolution<T extends ColorEntry> {
  name: string;
  precision: "specific" | "generic";
  entry: T;
}

interface ColorMatcher {
  resolve: (input: string) => string | null;
  match: (a: string, b: string) => "exact" | "partial" | null;
}

function createColorMatcher<T extends ColorEntry>(
  entries: T[],
  getCodes: (entry: T) => string[],
): ColorMatcher {
  const codeToEntry = new Map<string, T>();
  const exactNameToEntry = new Map<string, T>();
  const aliasToEntries = new Map<string, T[]>();

  for (const entry of entries) {
    for (const code of getCodes(entry)) {
      codeToEntry.set(code.toUpperCase(), entry);
    }
    exactNameToEntry.set(entry.name.toLowerCase(), entry);
    for (const alias of entry.aliases) {
      const list = aliasToEntries.get(alias) ?? [];
      list.push(entry);
      aliasToEntries.set(alias, list);
    }
  }

  function resolveEntry(input: string): Resolution<T> | null {
    const trimmed = input.trim();
    if (!trimmed) return null;
    const upper = trimmed.toUpperCase();

    // 1. OEM code (direct)
    const byCode = codeToEntry.get(upper);
    if (byCode) return { name: byCode.name, precision: "specific", entry: byCode };

    // 1a. Compound string — try first token as OEM code (e.g., "6X4 NORI GREEN PEARL" → "6X4")
    const firstToken = upper.split(/\s+/)[0];
    if (firstToken && firstToken !== upper) {
      const byFirstToken = codeToEntry.get(firstToken);
      if (byFirstToken) return { name: byFirstToken.name, precision: "specific", entry: byFirstToken };
    }

    // 1b. Strip leading zero and retry (salespeople enter "0223" for "223", "01H9" for "1H9")
    if (/^0[A-Z0-9]{2,4}$/i.test(trimmed)) {
      const stripped = codeToEntry.get(upper.slice(1));
      if (stripped) return { name: stripped.name, precision: "specific", entry: stripped };
    }

    // 1c. Interior material prefix flexibility — try swapping prefix (LC20 → LA20, LB20, EA20)
    const materialMatch = upper.match(/^(E[A-Z]|L[A-Z])(\d{2})$/);
    if (materialMatch) {
      const suffix = materialMatch[2];
      for (const prefix of ["EA", "LA", "LB", "LC"]) {
        const variant = codeToEntry.get(`${prefix}${suffix}`);
        if (variant) return { name: variant.name, precision: "specific", entry: variant };
      }
    }

    const lower = trimmed.toLowerCase();

    // 2. Exact official name
    const byName = exactNameToEntry.get(lower);
    if (byName) return { name: byName.name, precision: "specific", entry: byName };

    // 3. Alias — single match = specific, multiple = generic
    const aliasMatches = aliasToEntries.get(lower);
    if (aliasMatches && aliasMatches.length === 1) {
      return { name: aliasMatches[0].name, precision: "specific", entry: aliasMatches[0] };
    }
    if (aliasMatches && aliasMatches.length > 1) {
      return { name: aliasMatches[0].name, precision: "generic", entry: aliasMatches[0] };
    }

    // 4. Substring match
    for (const entry of entries) {
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

  return {
    resolve: (input: string) => resolveEntry(input)?.name ?? null,

    match: (colorA: string, colorB: string) => {
      const resA = resolveEntry(colorA);
      const resB = resolveEntry(colorB);
      if (!resA || !resB) return null;

      const bothSpecific = resA.precision === "specific" && resB.precision === "specific";
      if (resA.name === resB.name) return bothSpecific ? "exact" : "partial";

      // Check if they share a color family alias
      const familiesA = new Set(resA.entry.aliases);
      for (const family of familiesA) {
        if (resB.entry.aliases.includes(family)) return "partial";
      }

      return null;
    },
  };
}

// ─── Build matchers ─────────────────────────────────────────────────────────

const exteriorMatcher = createColorMatcher(
  EXTERIOR_COLORS,
  (e) => [e.code],
);

const interiorMatcher = createColorMatcher(
  INTERIOR_COLORS,
  (e) => e.codes,
);

// ─── Public API ─────────────────────────────────────────────────────────────

export const resolveExteriorColor = exteriorMatcher.resolve;
export const matchExteriorColors = exteriorMatcher.match;
export const resolveInteriorColor = interiorMatcher.resolve;
export const matchInteriorColors = interiorMatcher.match;
