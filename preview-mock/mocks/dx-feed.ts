/**
 * Synthetic current-year Dealer Exchange CSV for the preview-mock build.
 *
 * The app's real fetchDxSheetWithMetadata() requests the 2026 DX Google Sheet
 * as CSV; bootstrap.ts intercepts that request and answers with this text, so
 * the real header-aware parser, relationship builder and components all run.
 *
 * Trading-partner names/codes are taken from the dealer list already shipped
 * in src/data/dxHistoricalSeeds.ts (dealerships, not customers) so current
 * rows merge with the bundled history the way production does. Every VIN,
 * stock number and consultant name below is invented.
 */
import { DX_HISTORICAL_SOURCES } from "../../src/data/dxHistoricalSeeds";
import { CURRENT_DX_SOURCE } from "../../src/utils/dxSheetParser";

const HEADER = [
  "DATE", "YEAR", "MODEL #", "DESCRIPTION", "CC", "COLOR", "VIN (INCOMING)",
  "TRADING DEALER", "DEALER CODE", "STOCK #", "DX FEE", "OURS | THEIRS",
  "SALES CONSULTANT", "OUTGOING STOCK#", "VIN (OUTGOING)", "MODEL #", "A SWAP?", "NOTES",
];

const CONSULTANTS = ["JORDAN HALE", "CASEY MONROE", "RILEY BROOKS", "TAYLOR QUINN", "DREW NAVARRO"];

const VEHICLES: Array<[model: string, description: string, cc: string, color: string]> = [
  ["9353", "TX350", "085", "WHITE"],
  ["9360", "TX500H", "1N0", "WIND"],
  ["9400", "RX350", "223", "CAVIAR"],
  ["9453", "RX350H", "4Y5", "COPPER CREST"],
  ["9441", "RX450H+", "8X1", "ULTRASONIC BLUE"],
  ["9704", "GX550", "4Z1", "EARTH"],
  ["9706", "GX550", "1L8", "INCOGNITO"],
  ["9621", "LX600", "1K2", "MANGANESE"],
  ["9721", "UX300H", "8Y6", "GRECIAN WATER"],
  ["9848", "NX350H", "1L2", "IRIDIUM"],
  ["9845", "NX350H", "085", "WHITE"],
  ["9020", "ES350H", "089", "WIND CHILL"],
  ["9901", "RZ450E", "8Z2", "ETHER"],
  ["9300", "TZ450E", "1M5", "WAVELENGTH"],
];

/** Top trading partners by historical frequency, as [name, code]. */
function topPartners(count: number): Array<[string, string]> {
  const tally = new Map<string, { name: string; code: string; n: number }>();
  for (const source of DX_HISTORICAL_SOURCES) {
    for (const record of source.records) {
      const name = record[8].trim();
      const code = record[9].trim();
      if (!name || !/^\d{5}$/.test(code)) continue;
      const entry = tally.get(code) ?? { name, code, n: 0 };
      entry.n += 1;
      tally.set(code, entry);
    }
  }
  return [...tally.values()]
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))
    .slice(0, count)
    .map((entry) => [entry.name, entry.code]);
}

function fakeVin(serial: number): string {
  // "PREVW" marks these as preview-only; still matches the 17-char VIN pattern.
  return `JTJPREVW${(serial % 10).toString()}T${String(serial).padStart(7, "0")}`;
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function buildDxCsv(): string {
  const partners = topPartners(15);
  const fallback: Array<[string, string]> = [["HARBORVIEW", "70101"], ["BAYSIDE", "70102"]];
  const pool = partners.length > 0 ? partners : fallback;
  const yearShort = String(CURRENT_DX_SOURCE.sourceYear).slice(-2);
  const today = new Date();
  const lastMonth = today.getFullYear() === CURRENT_DX_SOURCE.sourceYear ? today.getMonth() + 1 : 12;

  const rows: string[][] = [HEADER];
  let serial = 2601;
  // ~4-5 exchanges per month, rotating partners so the top few dominate.
  for (let month = 1; month <= lastMonth; month++) {
    const perMonth = 3 + (month % 3);
    for (let i = 0; i < perMonth; i++) {
      serial += 1;
      const partnerIndex = (month * 7 + i * 3) % pool.length;
      const weighted = i === 0 ? 0 : i === 1 ? 1 % pool.length : partnerIndex;
      const [dealer, dealerCode] = pool[weighted];
      const [model, description, cc, color] = VEHICLES[(month * 5 + i * 2) % VEHICLES.length];
      const day = Math.min(27, 2 + i * 6 + (month % 4));
      const ours = (month + i) % 3 !== 0;
      const isSwap = (month + i) % 4 === 0;
      const swapVehicle = VEHICLES[(month + i * 3) % VEHICLES.length];
      const fee = isSwap ? "0" : (month + i) % 5 === 0 ? "" : String(150 + ((month * 50 + i * 25) % 250));
      rows.push([
        `${month}/${day}`,
        yearShort,
        model,
        description,
        cc,
        color,
        fakeVin(serial),
        dealer,
        dealerCode,
        `PV${yearShort}${String(serial).slice(-3)}`,
        fee,
        ours ? "OURS" : "THEIRS",
        CONSULTANTS[(month + i) % CONSULTANTS.length],
        isSwap || !ours ? `PV${yearShort}${String(serial + 400).slice(-3)}` : "",
        isSwap || !ours ? fakeVin(serial + 400) : "",
        isSwap || !ours ? swapVehicle[0] : "",
        isSwap ? "YES" : "",
        "",
      ]);
    }
  }
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}
