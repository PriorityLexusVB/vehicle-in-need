/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Fully synthetic seed data for the preview-mock build.
 *
 * Every person, deal number, stock number and VIN here is invented. Nothing is
 * copied from production Firestore. Shapes follow types.ts and
 * src/utils/allocationTypes.ts so the real components render as in production.
 */

export const MOCK_MANAGER = {
  uid: "preview-manager-morgan",
  email: "morgan.reyes.demo@priorityautomotive.com",
  displayName: "Morgan Reyes",
};

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.now();

function isoDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function demoEmail(name: string): string {
  return `${name.toLowerCase().replace(/[^a-z]+/g, ".")}.demo@priorityautomotive.com`;
}

// ─── People ─────────────────────────────────────────────────────────────────

const SALESPEOPLE = ["Jordan Hale", "Casey Monroe", "Riley Brooks", "Taylor Quinn", "Drew Navarro"];
const MANAGERS = ["Morgan Reyes", "Avery Sinclair"];

function buildUsers(Timestamp: any) {
  const users: Record<string, any> = {};
  const created = Timestamp.fromMillis(NOW - 200 * DAY_MS);
  for (const name of MANAGERS) {
    const uid = name === MOCK_MANAGER.displayName ? MOCK_MANAGER.uid : `preview-${name.toLowerCase().replace(/\s+/g, "-")}`;
    users[uid] = {
      uid,
      email: name === MOCK_MANAGER.displayName ? MOCK_MANAGER.email : demoEmail(name),
      displayName: name,
      isManager: true,
      isActive: true,
      createdAt: created,
      updatedAt: created,
    };
  }
  SALESPEOPLE.forEach((name, index) => {
    const uid = `preview-${name.toLowerCase().replace(/\s+/g, "-")}`;
    users[uid] = {
      uid,
      email: demoEmail(name),
      displayName: name,
      isManager: false,
      isActive: index !== 4, // one deactivated rep so Settings shows both states
      createdAt: created,
      updatedAt: created,
    };
  });
  return users;
}

// ─── Allocation snapshot ────────────────────────────────────────────────────

interface ModelSpec {
  code: string;
  sourceCodes: string[];
  category: string;
  type: string;
  grade: string;
  engine: string;
  rank: string;
}

const MODELS: Record<string, ModelSpec> = {
  ES350H: { code: "ES350H", sourceCodes: ["9020F", "9025F"], category: "Core", type: "Sedan Hybrid", grade: "Premium", engine: "Hybrid", rank: "High" },
  TZ450E: { code: "TZ450E", sourceCodes: ["9300F"], category: "Electrified", type: "Three-Row EV SUV", grade: "Premium", engine: "EV", rank: "Medium" },
  TX350: { code: "TX350", sourceCodes: ["9353F", "9355F"], category: "Growth", type: "Three-Row SUV", grade: "Premium", engine: "Gas", rank: "High" },
  TX500H: { code: "TX500H", sourceCodes: ["9360F"], category: "Growth", type: "Three-Row SUV Hybrid", grade: "F SPORT Performance", engine: "Hybrid", rank: "Critical" },
  RX350: { code: "RX350", sourceCodes: ["9400F", "9411F"], category: "Core", type: "SUV", grade: "Premium", engine: "Gas", rank: "High" },
  RX350H: { code: "RX350H", sourceCodes: ["9450F", "9453F"], category: "Core", type: "SUV Hybrid", grade: "Premium", engine: "Hybrid", rank: "High" },
  "RX450H+": { code: "RX450H+", sourceCodes: ["9441F"], category: "Electrified", type: "PHEV SUV", grade: "Luxury", engine: "Hybrid", rank: "Medium" },
  GX550: { code: "GX550", sourceCodes: ["9704F", "9706F"], category: "Strategic", type: "Body-on-Frame SUV", grade: "Overtrail", engine: "Gas", rank: "Critical" },
  LX600: { code: "LX600", sourceCodes: ["9621F"], category: "Flagship", type: "Luxury SUV", grade: "Luxury", engine: "Gas", rank: "Medium" },
  UX300H: { code: "UX300H", sourceCodes: ["9721F", "9732F"], category: "Core", type: "Subcompact SUV Hybrid", grade: "Base", engine: "Hybrid", rank: "High" },
  NX350H: { code: "NX350H", sourceCodes: ["9848F", "9845F"], category: "Core", type: "Compact SUV Hybrid", grade: "Luxury", engine: "Hybrid", rank: "High" },
  RZ450E: { code: "RZ450E", sourceCodes: ["9901F"], category: "Electrified", type: "EV SUV", grade: "Premium", engine: "EV", rank: "Medium" },
};

// [model, sourceCodeIndex, exterior, interior, bos, arrivalOffsetDays, accessories?]
type VehicleRow = [string, number, string, string, "Y" | "N", number, string[]?];

const VEHICLE_ROWS: VehicleRow[] = [
  ["RX350", 0, "Caviar", "EA20 BLACK", "Y", 12, ["MF", "WL"]],
  ["RX350", 0, "Eminent White Pearl", "LA40 PALOMINO", "N", 18],
  ["RX350", 1, "Iridium", "EA20 BLACK", "N", 26],
  ["RX350", 1, "Nightfall Mica", "LA01 MACADAMIA", "N", 33, ["KG"]],
  ["RX350H", 0, "Copper Crest", "LA41 ACORN", "Y", 9],
  ["RX350H", 1, "Wind Chill Pearl", "LA20 BLACK", "N", 21],
  ["RX350H", 1, "Atomic Silver", "LA10 BIRCH", "N", 40],
  ["RX450H+", 0, "Ultrasonic Blue 2.0", "LA20 BLACK", "N", 28],
  ["TX350", 0, "Eminent White Pearl", "EA80 PEPPERCORN", "Y", 7],
  ["TX350", 0, "Cloudburst Gray", "EA20 BLACK", "N", 15],
  ["TX350", 1, "Caviar", "LA42 GLAZED CARAMEL", "N", 24],
  ["TX500H", 0, "Wind", "LA31 CIRCUIT RED", "N", 19, ["MF", "DF"]],
  ["TX500H", 0, "Ultra White", "LA20 BLACK", "N", 35],
  ["TZ450E", 0, "Wavelength", "LA10 BIRCH", "N", 44],
  ["TZ450E", 0, "Caviar", "LA20 BLACK", "N", 52],
  ["GX550", 0, "Earth", "LA44 EARTH / BLACK", "Y", 11, ["KG", "1S"]],
  ["GX550", 1, "Incognito", "LA20 BLACK", "N", 22],
  ["GX550", 1, "Eminent White Pearl", "LA45 STONE BROWN", "N", 37],
  ["LX600", 0, "Manganese Luster", "LA41 ACORN", "N", 30],
  ["LX600", 0, "Caviar", "LA20 BLACK", "N", 48],
  ["UX300H", 0, "Grecian Water", "EA20 BLACK", "N", 8],
  ["UX300H", 1, "Ultra White", "EA10 BIRCH", "N", 16],
  ["UX300H", 1, "Infrared", "EA20 BLACK", "N", 29],
  ["NX350H", 0, "Iridium", "LA30 RIOJA RED", "Y", 10],
  ["NX350H", 0, "Eminent White Pearl", "LA20 BLACK", "N", 20],
  ["NX350H", 1, "Nori Green Pearl", "LA01 MACADAMIA", "N", 31],
  ["ES350H", 0, "Caviar", "LA40 PALOMINO", "N", 13],
  ["ES350H", 1, "Wind Chill Pearl", "LA20 BLACK", "N", 23],
  ["ES350H", 1, "Atomic Silver", "EA20 BLACK", "N", 38],
  ["RZ450E", 0, "Ether", "EA80 PEPPERCORN", "N", 27],
  ["RZ450E", 0, "Cloudburst Gray", "EA20 BLACK", "N", 42],
];

function buildVehicles() {
  const unitCounts = new Map<string, number>();
  return VEHICLE_ROWS.map(([modelKey, sourceIndex, color, interiorColor, bos, arrivalOffset, accessories]) => {
    const spec = MODELS[modelKey];
    const sourceCode = spec.sourceCodes[sourceIndex] ?? spec.sourceCodes[0];
    const base = [spec.code, sourceCode, spec.grade, color, interiorColor, bos]
      .map((part) => part.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""))
      .join("_");
    const unit = (unitCounts.get(base) ?? 0) + 1;
    unitCounts.set(base, unit);
    const vehicle: Record<string, any> = {
      id: `${base}-U${String(unit).padStart(2, "0")}`,
      code: spec.code,
      model: spec.code,
      sourceCode,
      quantity: 1,
      color,
      interiorColor,
      bos,
      arrival: isoDate(NOW + arrivalOffset * DAY_MS),
      grade: spec.grade,
      engine: spec.engine,
      // Production snapshots are MSRP-free (the parser zeroes these).
      msrp: 0,
      category: spec.category,
      type: spec.type,
      rank: spec.rank,
      profit: 0,
      totalValue: 0,
    };
    if (accessories) vehicle.factoryAccessories = accessories;
    return vehicle;
  });
}

// ─── Orders ─────────────────────────────────────────────────────────────────

interface OrderRow {
  id: string;
  customerName: string;
  salesperson: string;
  manager: string;
  daysAgo: number;
  model: string;
  modelNumber: string;
  year: string;
  exteriorColor1: string;
  exteriorColor2?: string;
  interiorColor1: string;
  interiorColor2?: string;
  msrp: number;
  depositAmount: number;
  status: string;
  options: string;
  stockNumber?: string;
  vin?: string;
  dxDealerName?: string;
  dxExpectedArrival?: string;
  linkVehicleIndex?: number;
  note?: string;
  securedVehicleInfo?: string;
}

const ORDER_ROWS: OrderRow[] = [
  { id: "ord-preview-01", customerName: "Avery Collins", salesperson: "Jordan Hale", manager: "Morgan Reyes", daysAgo: 3, model: "RX350", modelNumber: "9400", year: "2026", exteriorColor1: "Caviar", exteriorColor2: "Iridium", interiorColor1: "Black", msrp: 52350, depositAmount: 1000, status: "Factory Order", options: "Premium Package, Mark Levinson", linkVehicleIndex: 0, note: "Customer confirmed black interior. Wants delivery before the holidays." },
  { id: "ord-preview-02", customerName: "Blake Harrison", salesperson: "Casey Monroe", manager: "Avery Sinclair", daysAgo: 6, model: "TX500H", modelNumber: "9360", year: "2026", exteriorColor1: "Wind", interiorColor1: "Circuit Red", msrp: 71200, depositAmount: 2500, status: "Factory Order", options: "F SPORT Performance, Panoramic Roof", linkVehicleIndex: 11 },
  { id: "ord-preview-03", customerName: "Cameron Ellis", salesperson: "Riley Brooks", manager: "Morgan Reyes", daysAgo: 9, model: "GX550", modelNumber: "9704", year: "2026", exteriorColor1: "Earth", interiorColor1: "Earth / Black", msrp: 72500, depositAmount: 5000, status: "Factory Order", options: "Overtrail+, Cold Weather", linkVehicleIndex: 15, note: "Overtrail+ only. Will not take Premium." },
  { id: "ord-preview-04", customerName: "Dana Whitfield", salesperson: "Taylor Quinn", manager: "Avery Sinclair", daysAgo: 11, model: "9848", modelNumber: "9848", year: "2026", exteriorColor1: "Iridium", exteriorColor2: "Eminent White Pearl", interiorColor1: "Rioja Red", interiorColor2: "Black", msrp: 49800, depositAmount: 1000, status: "Factory Order", options: "Luxury Package" },
  { id: "ord-preview-05", customerName: "Emerson Price", salesperson: "Jordan Hale", manager: "Morgan Reyes", daysAgo: 14, model: "TX350", modelNumber: "9353", year: "2026", exteriorColor1: "Eminent White Pearl", interiorColor1: "Peppercorn", msrp: 58900, depositAmount: 1500, status: "Factory Order", options: "Premium, Tow Package", linkVehicleIndex: 8 },
  { id: "ord-preview-06", customerName: "Finley Grant", salesperson: "Casey Monroe", manager: "Morgan Reyes", daysAgo: 17, model: "LX600", modelNumber: "9621", year: "2026", exteriorColor1: "Manganese Luster", interiorColor1: "Acorn", msrp: 108500, depositAmount: 10000, status: "Factory Order", options: "Luxury, Rear Seat Entertainment" },
  { id: "ord-preview-07", customerName: "Harper Lane", salesperson: "Riley Brooks", manager: "Avery Sinclair", daysAgo: 5, model: "RX350H", modelNumber: "9453", year: "2026", exteriorColor1: "Copper Crest", interiorColor1: "Acorn", msrp: 55400, depositAmount: 1000, status: "Dealer Exchange", options: "Premium+", dxDealerName: "BAYSIDE", dxExpectedArrival: isoDate(NOW + 6 * DAY_MS), note: "Trading partner confirmed. Driver scheduled." },
  { id: "ord-preview-08", customerName: "Jamie Calloway", salesperson: "Taylor Quinn", manager: "Morgan Reyes", daysAgo: 8, model: "9025a", modelNumber: "9025", year: "2026", exteriorColor1: "Wind Chill Pearl", interiorColor1: "Black", msrp: 51200, depositAmount: 500, status: "Dealer Exchange", options: "Ultra Luxury", dxDealerName: "HARBORVIEW", dxExpectedArrival: isoDate(NOW + 3 * DAY_MS) },
  { id: "ord-preview-09", customerName: "Kendall Shaw", salesperson: "Jordan Hale", manager: "Avery Sinclair", daysAgo: 33, model: "UX300H", modelNumber: "9721", year: "2026", exteriorColor1: "Grecian Water", interiorColor1: "Black", msrp: 39800, depositAmount: 500, status: "Factory Order", options: "F SPORT Design" },
  { id: "ord-preview-10", customerName: "Logan Pierce", salesperson: "Casey Monroe", manager: "Morgan Reyes", daysAgo: 41, model: "RZ450E", modelNumber: "9901", year: "2026", exteriorColor1: "Ether", interiorColor1: "Peppercorn", msrp: 61200, depositAmount: 1000, status: "Locate", options: "Premium, Bi-tone" },
  { id: "ord-preview-11", customerName: "Micah Romero", salesperson: "Riley Brooks", manager: "Avery Sinclair", daysAgo: 2, model: "TZ450E", modelNumber: "9300", year: "2026", exteriorColor1: "Wavelength", interiorColor1: "Birch", msrp: 66800, depositAmount: 2000, status: "Factory Order", options: "Premium" },
  // Secured history
  { id: "ord-preview-12", customerName: "Parker Lyons", salesperson: "Jordan Hale", manager: "Morgan Reyes", daysAgo: 12, model: "RX350", modelNumber: "9411", year: "2026", exteriorColor1: "Atomic Silver", interiorColor1: "Birch", msrp: 51900, depositAmount: 1000, status: "Delivered", options: "Premium", stockNumber: "PV26118", vin: "JTJPREVW5T0000118", securedVehicleInfo: "RX350 · Atomic Silver · Birch" },
  { id: "ord-preview-13", customerName: "Quinn Holloway", salesperson: "Taylor Quinn", manager: "Avery Sinclair", daysAgo: 19, model: "NX350H", modelNumber: "9845", year: "2026", exteriorColor1: "Caviar", interiorColor1: "Palomino", msrp: 48600, depositAmount: 500, status: "Delivered", options: "Premium", stockNumber: "PV26104", vin: "JTJPREVW1T0000104" },
  { id: "ord-preview-14", customerName: "Reese Bennett", salesperson: "Casey Monroe", manager: "Morgan Reyes", daysAgo: 27, model: "TX350", modelNumber: "9355", year: "2026", exteriorColor1: "Nightfall Mica", interiorColor1: "Black", msrp: 57900, depositAmount: 1500, status: "Received", options: "Luxury", stockNumber: "PV26097", vin: "JTJPREVW8T0000097" },
  { id: "ord-preview-15", customerName: "Sawyer Hayes", salesperson: "Riley Brooks", manager: "Avery Sinclair", daysAgo: 45, model: "ES350H", modelNumber: "9020", year: "2026", exteriorColor1: "Eminent White Pearl", interiorColor1: "Macadamia", msrp: 50200, depositAmount: 500, status: "Delivered", options: "Luxury", stockNumber: "PV26071", vin: "JTJPREVW3T0000071" },
];

function buildOrders(Timestamp: any, vehicles: Record<string, any>[]) {
  const orders: Record<string, any> = {};
  const vehicleLinks: Record<string, any> = {};
  const notes: Record<string, Record<string, any>> = {};

  for (const row of ORDER_ROWS) {
    const createdMs = NOW - row.daysAgo * DAY_MS - 3 * 60 * 60 * 1000;
    const salespersonUid = `preview-${row.salesperson.toLowerCase().replace(/\s+/g, "-")}`;
    const order: Record<string, any> = {
      salesperson: row.salesperson,
      manager: row.manager,
      date: isoDate(createdMs),
      customerName: row.customerName,
      dealNumber: `D${(48200 + Number(row.id.slice(-2)) * 7).toString()}`,
      year: row.year,
      model: row.model,
      modelNumber: row.modelNumber,
      exteriorColor1: row.exteriorColor1,
      interiorColor1: row.interiorColor1,
      msrp: row.msrp,
      depositAmount: row.depositAmount,
      status: row.status,
      options: row.options,
      createdAt: Timestamp.fromMillis(createdMs),
      createdByUid: salespersonUid,
      createdByEmail: demoEmail(row.salesperson),
      salespersonEmail: demoEmail(row.salesperson),
    };
    if (row.exteriorColor2) order.exteriorColor2 = row.exteriorColor2;
    if (row.interiorColor2) order.interiorColor2 = row.interiorColor2;
    if (row.stockNumber) order.stockNumber = row.stockNumber;
    if (row.vin) order.vin = row.vin;
    if (row.dxDealerName) order.dxDealerName = row.dxDealerName;
    if (row.dxExpectedArrival) order.dxExpectedArrival = row.dxExpectedArrival;
    if (row.securedVehicleInfo) order.securedVehicleInfo = row.securedVehicleInfo;

    if (row.linkVehicleIndex !== undefined) {
      const vehicle = vehicles[row.linkVehicleIndex];
      const linkedAt = Timestamp.fromMillis(createdMs + DAY_MS);
      order.allocatedVehicleId = vehicle.id;
      order.allocatedVehicleInfo = `${vehicle.model} - ${vehicle.color} - ${vehicle.arrival}`;
      order.linkedAt = linkedAt;
      order.linkedByUid = MOCK_MANAGER.uid;
      vehicleLinks[vehicle.id] = { orderId: row.id, linkedAt, linkedByUid: MOCK_MANAGER.uid };
    }

    if (row.note) {
      const noteAt = Timestamp.fromMillis(createdMs + 2 * DAY_MS);
      order.latestNoteText = row.note;
      order.latestNoteAt = noteAt;
      order.latestNoteByUid = MOCK_MANAGER.uid;
      order.latestNoteByName = MOCK_MANAGER.displayName;
      notes[`orders/${row.id}/notes`] = {
        [`${row.id}-note-1`]: {
          text: row.note,
          createdAt: noteAt,
          createdByUid: MOCK_MANAGER.uid,
          createdByName: MOCK_MANAGER.displayName,
          createdByEmail: MOCK_MANAGER.email,
          createdByRole: "manager",
        },
      };
    }

    orders[row.id] = order;
  }

  return { orders, vehicleLinks, notes };
}

/**
 * Build every seeded collection. Takes the mock Timestamp class as a parameter
 * so this module never imports the Firestore mock (no circular import).
 */
export function seedDatabase(Timestamp: any): Record<string, Record<string, any>> {
  const vehicles = buildVehicles();
  const { orders, vehicleLinks, notes } = buildOrders(Timestamp, vehicles);
  const hybridCount = vehicles.filter((vehicle) => vehicle.engine !== "Gas").length;
  const reportMs = NOW - 3 * DAY_MS;

  return {
    users: buildUsers(Timestamp),
    orders,
    vehicle_links: vehicleLinks,
    allocationSnapshots: {
      "preview-snapshot-latest": {
        reportDate: isoDate(reportMs),
        publishedAt: Timestamp.fromMillis(reportMs + 5 * 60 * 60 * 1000),
        publishedByUid: MOCK_MANAGER.uid,
        publishedByEmail: MOCK_MANAGER.email,
        itemCount: vehicles.length,
        summary: {
          units: vehicles.length,
          value: 0,
          hybridMix: Math.round((hybridCount / vehicles.length) * 100),
        },
        vehicles,
        isLatest: true,
      },
    },
    ...notes,
  };
}
