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
import { parseAllocationSource, AllocationVehicle } from "./allocationParser.js";

const allocationApiKey = defineSecret("ALLOCATION_API_KEY");

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
      // Parse using the robust shared parser (same one used by the frontend)
      console.log(`[processAllocationEmail] Parsing pdfText (${pdfText.length} chars) from subject: ${subject ?? "(none)"}`);
      const parsed = parseAllocationSource(pdfText);

      if (parsed.errors.length > 0) {
        console.error("[processAllocationEmail] Parser errors:", parsed.errors);
        res.status(400).json({ error: "Parser error", details: parsed.errors });
        return;
      }

      const { reportDate, vehicles, summary, itemCount } = parsed;

      console.log(`[processAllocationEmail] Parsed ${itemCount} vehicles, ${parsed.warnings.length} warning(s)`);
      if (parsed.warnings.length > 0) {
        console.warn("[processAllocationEmail] Parser warnings:", parsed.warnings);
      }

      if (vehicles.length === 0) {
        res.status(400).json({ error: "No vehicles found in allocation text" });
        return;
      }

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
        itemCount,
        summary,
        vehicles: vehicles.map((v: AllocationVehicle) => ({
          ...v,
          bos: v.bos === "Y" ? "Y" : "N",
        })),
        isLatest: true,
        source: "email-automation",
        emailSubject: subject || null,
        parserWarnings: parsed.warnings.length > 0 ? parsed.warnings : null,
        // TTL: auto-delete after 90 days (Firestore TTL policy on this field)
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      });

      await batch.commit();

      console.log(`[processAllocationEmail] Snapshot ${newRef.id} committed — ${itemCount} vehicles, reportDate=${reportDate}`);

      res.status(200).json({
        success: true,
        vehicleCount: vehicles.length,
        reportDate,
        snapshotId: newRef.id,
        warnings: parsed.warnings.length > 0 ? parsed.warnings : undefined,
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
