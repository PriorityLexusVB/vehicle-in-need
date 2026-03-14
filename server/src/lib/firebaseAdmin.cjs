/**
 * Shared Firebase Admin SDK singleton.
 *
 * Uses Application Default Credentials (ADC):
 *   - Local: `gcloud auth application-default login`
 *   - Cloud Run: runtime service account (automatic)
 *
 * Safe to require() from multiple modules — only initializes once.
 *
 * @module firebaseAdmin
 */

"use strict";

const admin = require("firebase-admin");

/** @returns {admin.app.App} */
function getApp() {
  if (admin.apps.length > 0) {
    return admin.app();
  }
  const app = admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
  });
  console.log("[FirebaseAdmin] Initialized with project:", app.options.projectId);
  return app;
}

/** @returns {admin.firestore.Firestore} */
function getFirestore() {
  getApp(); // ensure initialized
  return admin.firestore();
}

module.exports = { getApp, getFirestore, admin };
