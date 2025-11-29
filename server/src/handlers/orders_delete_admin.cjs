/**
 * Orders Delete Admin Handler - Server-side Admin SDK Delete Example
 *
 * This Express route provides a secure server-side endpoint for deleting orders
 * using the Firebase Admin SDK. This bypasses Firestore security rules and performs
 * deletion with service account credentials.
 *
 * IMPORTANT: This endpoint should be protected by authentication middleware
 * that verifies the user has manager permissions.
 *
 * Usage:
 *   DELETE /api/orders/:orderId
 *
 * Prerequisites:
 *   - Firebase Admin SDK initialized (see initializeFirebaseAdmin())
 *   - Service account with Firestore admin permissions
 *   - GOOGLE_APPLICATION_CREDENTIALS environment variable set (or running on GCP)
 *
 * Integration:
 *   // In your main server file (e.g., index.cjs)
 *   const ordersDeleteRouter = require('./src/handlers/orders_delete_admin.cjs');
 *   app.use('/api/orders', ordersDeleteRouter.router);
 *
 * References:
 *   - Failing job: b7bbf4ce81bc133cf79910dea610113b18695186
 *   - MD060 fixed in PR #134
 *
 * @module orders_delete_admin
 */

"use strict";

const express = require("express");
const admin = require("firebase-admin");

/**
 * Initialize Firebase Admin SDK
 * Call this once in your main server file before using the router
 * @returns {admin.app.App} The initialized Firebase app
 */
function initializeFirebaseAdmin() {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  // Initialize with application default credentials
  // In production (Cloud Run), this uses the service account attached to the service
  // Locally, this uses GOOGLE_APPLICATION_CREDENTIALS or ADC
  const app = admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
  });

  console.log(
    "[FirebaseAdmin] Initialized with project:",
    app.options.projectId
  );
  return app;
}

/**
 * Get Firestore instance
 * @returns {admin.firestore.Firestore}
 */
function getFirestore() {
  return admin.firestore();
}

/**
 * Middleware to verify Firebase ID token and extract user info
 *
 * This middleware:
 * 1. Extracts the Bearer token from Authorization header
 * 2. Verifies the token with Firebase Auth
 * 3. Attaches user info (including custom claims) to the request
 *
 * @param {express.Request} req - Express request
 * @param {express.Response} res - Express response
 * @param {express.NextFunction} next - Express next function
 */
async function verifyAuthToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.warn("[Auth] Missing or invalid Authorization header");
    res.status(401).json({
      success: false,
      error: "Unauthorized",
      message:
        "Missing or invalid Authorization header. Expected: Bearer <token>",
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const idToken = authHeader.substring(7); // Remove 'Bearer ' prefix

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);

    // Extract user info including custom claims
    // Note: We check both 'isManager' and 'manager' claim names for backwards compatibility.
    // The Firestore security rules use 'isManager', while the tools/set-manager-custom-claims.mjs
    // script may set 'manager'. Standardize on 'isManager' for new implementations.
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      isManager:
        decodedToken.isManager === true || decodedToken.manager === true,
    };

    console.log(
      `[Auth] Verified user: ${req.user.uid} (${req.user.email}), isManager: ${req.user.isManager}`
    );
    next();
  } catch (error) {
    console.error("[Auth] Token verification failed:", error);
    res.status(401).json({
      success: false,
      error: "Unauthorized",
      message: "Invalid or expired authentication token",
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Middleware to verify the user has manager permissions
 * Must be used after verifyAuthToken middleware
 *
 * @param {express.Request} req - Express request with user property
 * @param {express.Response} res - Express response
 * @param {express.NextFunction} next - Express next function
 */
function requireManager(req, res, next) {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: "Unauthorized",
      message: "Authentication required",
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (!req.user.isManager) {
    console.warn(
      `[Auth] Non-manager attempted delete: ${req.user.uid} (${req.user.email})`
    );
    res.status(403).json({
      success: false,
      error: "Forbidden",
      message: "Manager permissions required to delete orders",
      timestamp: new Date().toISOString(),
    });
    return;
  }

  next();
}

/**
 * Delete an order by ID using Firebase Admin SDK
 *
 * This function:
 * 1. Validates the order exists
 * 2. Logs the deletion for audit trail
 * 3. Deletes the order document
 * 4. Returns success/failure status
 *
 * @param {string} orderId - The order document ID
 * @param {{uid: string, email?: string}} deletedBy - Who deleted the order
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function deleteOrderById(orderId, deletedBy) {
  const db = getFirestore();
  const orderRef = db.collection("orders").doc(orderId);

  console.log(`[OrderDelete] Attempting to delete order: ${orderId}`);
  console.log(
    `[OrderDelete] Deleted by: ${deletedBy.uid} (${deletedBy.email})`
  );

  try {
    // Check if order exists
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      console.warn(`[OrderDelete] Order not found: ${orderId}`);
      return { success: false, error: "Order not found" };
    }

    const orderData = orderDoc.data();
    console.log(`[OrderDelete] Found order:`, {
      id: orderId,
      customerName: orderData?.customerName,
      createdByUid: orderData?.createdByUid,
      status: orderData?.status,
    });

    // Optional: Archive the order before deletion for audit purposes
    // Uncomment the following to enable archiving:
    /*
    const archiveRef = db.collection('orders_deleted').doc(orderId);
    await archiveRef.set({
      ...orderData,
      _deletedAt: admin.firestore.FieldValue.serverTimestamp(),
      _deletedBy: deletedBy.uid,
      _deletedByEmail: deletedBy.email,
    });
    console.log(`[OrderDelete] Archived order to orders_deleted: ${orderId}`);
    */

    // Delete the order
    await orderRef.delete();

    console.log(`[OrderDelete] Successfully deleted order: ${orderId}`);

    return { success: true };
  } catch (error) {
    console.error(`[OrderDelete] Error deleting order ${orderId}:`, error);

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: errorMessage };
  }
}

/**
 * Create the Express router for order delete operations
 * @returns {express.Router}
 */
function createOrdersDeleteRouter() {
  const router = express.Router();

  /**
   * DELETE /api/orders/:orderId
   *
   * Delete an order by ID (managers only)
   *
   * Headers:
   *   Authorization: Bearer <firebase-id-token>
   *
   * Response:
   *   200: { success: true, orderId: "...", message: "Order deleted successfully" }
   *   401: { success: false, error: "Unauthorized", message: "..." }
   *   403: { success: false, error: "Forbidden", message: "..." }
   *   404: { success: false, error: "Not Found", message: "..." }
   *   500: { success: false, error: "Internal Server Error", message: "..." }
   */
  router.delete("/:orderId", verifyAuthToken, requireManager, async (req, res) => {
    const { orderId } = req.params;
    const timestamp = new Date().toISOString();

    console.log(`[API] DELETE /api/orders/${orderId}`);
    console.log(`[API] Request from: ${req.user?.uid} (${req.user?.email})`);

    // Validate orderId
    if (!orderId || typeof orderId !== "string" || orderId.trim() === "") {
      res.status(400).json({
        success: false,
        orderId: orderId || "",
        error: "Bad Request",
        message: "Invalid order ID",
        timestamp,
      });
      return;
    }

    // Perform the deletion
    const result = await deleteOrderById(orderId, {
      uid: req.user.uid,
      email: req.user?.email,
    });

    if (!result.success) {
      const statusCode = result.error === "Order not found" ? 404 : 500;
      res.status(statusCode).json({
        success: false,
        orderId,
        error: statusCode === 404 ? "Not Found" : "Internal Server Error",
        message: result.error || "Failed to delete order",
        timestamp,
      });
      return;
    }

    // Success
    res.status(200).json({
      success: true,
      orderId,
      message: "Order deleted successfully",
      timestamp,
    });
  });

  return router;
}

// Export a pre-configured router for easy integration
const ordersDeleteRouter = createOrdersDeleteRouter();

module.exports = {
  initializeFirebaseAdmin,
  verifyAuthToken,
  requireManager,
  deleteOrderById,
  createOrdersDeleteRouter,
  router: ordersDeleteRouter,
};

/**
 * Example integration into your main server file:
 *
 * // server/index.cjs
 *
 * const { initializeFirebaseAdmin, router: ordersDeleteRouter } = require('./src/handlers/orders_delete_admin.cjs');
 *
 * // Initialize Firebase Admin SDK once at startup
 * initializeFirebaseAdmin();
 *
 * // Mount the delete route
 * app.use('/api/orders', ordersDeleteRouter);
 *
 * // Now DELETE /api/orders/:orderId is available
 */
