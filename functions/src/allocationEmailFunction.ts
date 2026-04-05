/**
 * Cloud Function: processAllocationEmail
 *
 * HTTP endpoint that accepts extracted allocation PDF text,
 * parses Toyota DM Allocation format, and publishes a new
 * allocation snapshot to Firestore.
 *
 * Called by Google Apps Script when a new allocation email arrives.
 * Secured with a shared secret (API key) to prevent unauthorized access.
 */

import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";

const allocationApiKey = defineSecret("ALLOCATION_API_KEY");

// ─── Lightweight Toyota DM Allocation Parser ────────────────────────────────
// Handles the "Toyota District Manager Allocation Application" PDF format.
// Row format: # Alloc# Model Serial# CC PI Color Seq# BOS FactoryAccy PPOs LOC DM_Note

interface ParsedVehicle {
  id: string;
  code: string;
  model: string;
  sourceCode: string;
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
}

// Lexus model code reference (base models only, for categorization)
const MODEL_REFERENCE: Record<string, { category: string; type: string; engine: string; rank: string }> = {
  RX350: { category: "Core", type: "SUV", engine: "Gas", rank: "High" },
  RX350H: { category: "Core", type: "SUV Hybrid", engine: "Hybrid", rank: "High" },
  RX500H: { category: "Core", type: "SUV Hybrid", engine: "Hybrid", rank: "Critical" },
  "RX450H+": { category: "Electrified", type: "PHEV SUV", engine: "Hybrid", rank: "Medium" },
  NX350: { category: "Core", type: "Compact SUV", engine: "Gas", rank: "High" },
  NX350H: { category: "Core", type: "Compact SUV Hybrid", engine: "Hybrid", rank: "High" },
  "NX450H+": { category: "Electrified", type: "PHEV SUV", engine: "Hybrid", rank: "Medium" },
  TX350: { category: "Growth", type: "Three-Row SUV", engine: "Gas", rank: "Critical" },
  TX500H: { category: "Growth", type: "Three-Row SUV Hybrid", engine: "Hybrid", rank: "Critical" },
  "TX550H+": { category: "Electrified", type: "Three-Row PHEV SUV", engine: "Hybrid", rank: "High" },
  GX550: { category: "Strategic", type: "Body-on-Frame SUV", engine: "Gas", rank: "Critical" },
  LX600: { category: "Flagship", type: "Luxury SUV", engine: "Gas", rank: "High" },
  LX700H: { category: "Flagship", type: "Luxury SUV Hybrid", engine: "Hybrid", rank: "High" },
  IS350: { category: "Core", type: "Sport Sedan", engine: "Gas", rank: "Medium" },
  ES350H: { category: "Core", type: "Sedan Hybrid", engine: "Hybrid", rank: "Medium" },
  ES350E: { category: "Electrified", type: "EV Sedan", engine: "EV", rank: "Medium" },
  ES500E: { category: "Electrified", type: "EV Sedan AWD", engine: "EV", rank: "Medium" },
  LS500: { category: "Flagship", type: "Luxury Sedan", engine: "Gas", rank: "High" },
  LC500: { category: "Halo", type: "Grand Tourer", engine: "Gas", rank: "High" },
  UX300H: { category: "Core", type: "Subcompact SUV Hybrid", engine: "Hybrid", rank: "Low" },
  RZ350E: { category: "Electrified", type: "EV SUV", engine: "EV", rank: "Medium" },
  RZ450E: { category: "Electrified", type: "EV SUV", engine: "EV", rank: "Medium" },
  RZ550E: { category: "Electrified", type: "EV SUV", engine: "EV", rank: "Medium" },
};

// 4-digit model code → base model
const CODE_TO_MODEL: Record<string, string> = {
  "9400": "RX350", "9401": "RX350", "9402": "RX350", "9403": "RX350", "9404": "RX350",
  "9410": "RX350", "9411": "RX350", "9412": "RX350", "9413": "RX350", "9414": "RX350", "9415": "RX350",
  "9450": "RX350H", "9451": "RX350H", "9452": "RX350H", "9453": "RX350H", "9455": "RX350H",
  "9441": "RX450H+", "9443": "RX450H+",
  "9458": "RX500H",
  "9834": "NX350", "9835": "NX350", "9836": "NX350", "9838": "NX350",
  "9844": "NX350H", "9845": "NX350H", "9846": "NX350H", "9847": "NX350H",
  "9848": "NX350H", "9849": "NX350H", "9850": "NX350H", "9851": "NX350H",
  "9855": "NX450H+", "9852": "NX450H+", "9854": "NX450H+",
  "9350": "TX350", "9351": "TX350", "9352": "TX350", "9353": "TX350",
  "9354": "TX350", "9355": "TX350", "9357": "TX350",
  "9360": "TX500H", "9361": "TX500H",
  "9365": "TX550H+",
  "9701": "GX550", "9702": "GX550", "9703": "GX550", "9704": "GX550", "9705": "GX550", "9706": "GX550",
  "9621": "LX600", "9622": "LX600", "9623": "LX600",
  "9626": "LX700H", "9627": "LX700H", "9628": "LX700H", "9629": "LX700H",
  "9504": "IS350", "9508": "IS350", "9510": "IS350", "9516": "IS350",
  "9020": "ES350H", "9021": "ES350H", "9025": "ES350H", "9026": "ES350H",
  "9030": "ES350E", "9032": "ES350E",
  "9035": "ES500E", "9037": "ES500E",
  "9126": "LS500",
  "9260": "LC500", "9262": "LC500",
  "9721": "UX300H", "9723": "UX300H", "9725": "UX300H", "9727": "UX300H",
  "9732": "UX300H", "9733": "UX300H", "9735": "UX300H", "9738": "UX300H",
  "9901": "RZ450E", "9902": "RZ450E", "9904": "RZ450E",
  "9905": "RZ350E", "9906": "RZ350E",
  "9909": "RZ550E",
};

function extractModelCode(modelField: string): string {
  const match = modelField.match(/^(\d{4})/);
  return match?.[1] ?? "";
}

function resolveModel(modelField: string): { code: string; baseModel: string; ref: typeof MODEL_REFERENCE[string] | null } {
  const fourDigit = extractModelCode(modelField);
  const baseModel = CODE_TO_MODEL[fourDigit] ?? modelField.replace(/\s+/g, "").toUpperCase();
  const ref = MODEL_REFERENCE[baseModel] ?? null;
  return { code: fourDigit || modelField, baseModel, ref };
}

function detectReportDate(text: string): string | null {
  const match = text.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
  if (!match) return null;
  const parts = match[1].split("/");
  if (parts.length === 3) {
    const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
    return `${year}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
  }
  return match[1];
}

// Toyota DM row pattern: # Alloc# Model Serial# CC PI Color Seq# BOS ...
const DM_ROW_PATTERN = /^\s*(\d+)\s+(\d{2,4})\s+(\d{4}[A-Z]?)\s+([A-Z0-9-]+)\s+(\d+)\s+([A-Z])\s+([\w-]+(?:\s*\([^)]*\))?)\s+(\d{4,5})\s+([YN])/;

function parseToyotaDMText(text: string): { reportDate: string | null; vehicles: ParsedVehicle[] } {
  const lines = text.split("\n");
  const reportDate = detectReportDate(text);
  const vehicles: ParsedVehicle[] = [];
  let rowIndex = 0;

  for (const line of lines) {
    const match = line.match(DM_ROW_PATTERN);
    if (!match) continue;

    const modelField = match[3];
    const colorRaw = match[7];
    const bos = match[9];

    const { code, baseModel, ref } = resolveModel(modelField);

    // Extract color code and name from format like "0223-20" or "0085-42 (EMINENT WHITE PEARL)"
    const colorParts = colorRaw.match(/^([\w-]+)(?:\s*\(([^)]+)\))?/);
    const colorToken = colorParts?.[1] ?? colorRaw;
    const colorName = colorParts?.[2] ?? "";

    // Split exterior-interior from compound token like "0223-20"
    const dashSplit = colorToken.split("-");
    const exteriorCode = dashSplit[0] ?? colorToken;
    const interiorCode = dashSplit[1] ?? "TBD";

    const exteriorDisplay = colorName
      ? `${exteriorCode} ${colorName}`
      : exteriorCode;

    // Try to extract arrival/LOC date from the rest of the line
    const restOfLine = line.slice((match.index ?? 0) + match[0].length);
    const arrivalMatch = restOfLine.match(/(\d{2}-\d{2})/);
    const arrival = arrivalMatch ? `2026-${arrivalMatch[1].replace("-", "-")}` : "TBD";

    rowIndex++;
    vehicles.push({
      id: `auto-${rowIndex}`,
      code: baseModel,
      model: baseModel,
      sourceCode: code,
      quantity: 1,
      color: exteriorDisplay,
      interiorColor: interiorCode,
      bos,
      arrival,
      grade: ref?.type ?? "Unknown",
      engine: ref?.engine ?? "Unknown",
      msrp: 0,
      category: ref?.category ?? "Unknown",
      type: ref?.type ?? "Unknown",
      rank: ref?.rank ?? "Medium",
      profit: 0,
      totalValue: 0,
    });
  }

  return { reportDate, vehicles };
}

// ─── Cloud Function ─────────────────────────────────────────────────────────

const ALLOCATION_SNAPSHOTS_COLLECTION = "allocationSnapshots";

export const processAllocationEmail = onRequest(
  { secrets: [allocationApiKey], cors: false },
  async (req, res) => {
    // Only accept POST
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    // Validate API key
    const providedKey = req.headers["x-api-key"] || req.body?.apiKey;
    if (!providedKey || providedKey !== allocationApiKey.value()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { pdfText, senderEmail, subject } = req.body;

    if (!pdfText || typeof pdfText !== "string") {
      res.status(400).json({ error: "Missing or invalid pdfText" });
      return;
    }

    try {
      // Parse the allocation text
      const { reportDate, vehicles } = parseToyotaDMText(pdfText);

      if (vehicles.length === 0) {
        res.status(400).json({ error: "No vehicles found in allocation text" });
        return;
      }

      // Calculate summary
      const units = vehicles.reduce((sum, v) => sum + v.quantity, 0);
      const hybridCount = vehicles.filter((v) =>
        v.engine === "Hybrid" || v.engine === "EV"
      ).length;
      const hybridMix = units > 0 ? Math.round((hybridCount / units) * 100) : 0;

      // Publish to Firestore (same pattern as allocationService.ts)
      const firestore = getFirestore();
      const snapshotsRef = firestore.collection(ALLOCATION_SNAPSHOTS_COLLECTION);

      // Mark previous latest as not latest
      const currentLatest = await snapshotsRef.where("isLatest", "==", true).get();
      const batch = firestore.batch();

      currentLatest.docs.forEach((doc) => {
        batch.update(doc.ref, { isLatest: false });
      });

      // Create new snapshot
      const newRef = snapshotsRef.doc();
      batch.set(newRef, {
        reportDate,
        publishedAt: FieldValue.serverTimestamp(),
        publishedByUid: "apps-script-automation",
        publishedByEmail: senderEmail || "automation@priorityautomotive.com",
        itemCount: vehicles.length,
        summary: { units, value: 0, hybridMix },
        vehicles: vehicles.map((v) => ({
          ...v,
          bos: v.bos === "Y" ? "Y" : "N",
        })),
        isLatest: true,
        source: "email-automation",
        emailSubject: subject || null,
        // TTL: auto-delete after 90 days (Firestore TTL policy on this field)
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      });

      await batch.commit();

      res.status(200).json({
        success: true,
        vehicleCount: vehicles.length,
        reportDate,
        snapshotId: newRef.id,
      });
    } catch (error) {
      console.error("Failed to process allocation email:", error);
      res.status(500).json({
        error: "Failed to process allocation",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
);
