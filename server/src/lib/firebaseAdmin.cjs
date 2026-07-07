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

const firebaseAdmin = require("firebase-admin");
const {
  applicationDefault,
  getApp: getDefaultApp,
  getApps,
  initializeApp,
} = require("firebase-admin/app");
const {
  FieldValue,
  Timestamp,
  getFirestore: getDefaultFirestore,
} = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

const admin = {
  ...firebaseAdmin,
  get apps() {
    return getApps();
  },
  app: getDefaultApp,
  auth: () => getAuth(getApp()),
  credential: { applicationDefault },
  firestore: Object.assign(() => getFirestore(), { FieldValue, Timestamp }),
  initializeApp,
};

/** @returns {admin.app.App} */
function getApp() {
  if (getApps().length > 0) {
    return getDefaultApp();
  }
  const app = initializeApp({
    credential: applicationDefault(),
    projectId:
      process.env.FIREBASE_PROJECT_ID ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.GCLOUD_PROJECT,
  });
  console.log("[FirebaseAdmin] Initialized with project:", app.options.projectId);
  return app;
}

/** @returns {admin.firestore.Firestore} */
function getFirestore() {
  getApp(); // ensure initialized
  return getDefaultFirestore();
}

module.exports = { getApp, getFirestore, admin };
