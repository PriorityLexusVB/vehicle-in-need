/**
 * Firebase Cloud Functions for Manager Role Management
 *
 * This module provides secure, auditable callable functions for:
 * - setManagerRole: Toggle manager status for users
 * - disableUser: Enable/disable user accounts
 *
 * All functions require the caller to have manager privileges (isManager custom claim)
 * and include comprehensive audit logging.
 */

import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";

/**
 * CORS configuration for allowed origins
 *
 * This array specifies which origins are allowed to call these Cloud Functions.
 * Firebase Functions v2 `onCall` functions handle CORS automatically when the
 * `cors` option is provided, including preflight OPTIONS requests.
 *
 * **Important:** After updating this list, you must redeploy the functions:
 *   ```bash
 *   cd functions && npm run build && cd .. && firebase deploy --only functions --project vehicles-in-need
 *   ```
 *
 * **Allowed Origins:**
 * - Production: Cloud Run app deployed at us-west1
 * - Development: Local development servers (Vite default port 5173, common alt port 3000)
 *
 * **CORS Behavior:**
 * - Preflight OPTIONS requests are automatically handled by Firebase Functions
 * - The Access-Control-Allow-Origin header is set dynamically based on the request origin
 * - Only origins in this list will receive successful CORS responses
 * - Invalid origins will result in CORS errors in the browser
 *
 * **Troubleshooting CORS Issues:**
 * 1. Verify the origin URL exactly matches (including protocol, no trailing slash)
 * 2. Ensure functions are deployed with the latest code containing this configuration
 * 3. Clear browser cache and try again
 * 4. Check browser console for the exact origin being sent in the request
 * 5. Verify the Firebase Functions logs for any CORS-related warnings
 *
 * **Security Note:**
 * - Never use `cors: true` in production as it allows ALL origins
 * - Always specify explicit origins for production deployments
 * - Keep this list minimal to reduce attack surface
 *
 * For multi-environment deployments, consider using Firebase Functions
 * environment configuration via `defineString()` from `firebase-functions/params`.
 */
const ALLOWED_ORIGINS = [
  "https://pre-order-dealer-exchange-tracker-842946218691.us-west1.run.app",
  "http://localhost:5173",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:3000",
];

// Initialize Firebase Admin
const app = initializeApp();
const auth = getAuth(app);
const db = getFirestore(app);

// Collection names
const USERS_COLLECTION = "users";
const AUDIT_LOGS_COLLECTION = "adminAuditLogs";

/**
 * Interface for the setManagerRole function input
 */
interface SetManagerRoleData {
  uid: string;
  isManager: boolean;
}

/**
 * Interface for the disableUser function input
 */
interface DisableUserData {
  uid: string;
  disabled: boolean;
}

/**
 * Interface for audit log entries
 */
interface AuditLogEntry {
  action: "setManagerRole" | "disableUser";
  performedByUid: string;
  performedByEmail: string | null;
  performedByIsManager: boolean;
  targetUid: string;
  targetEmail: string | null;
  previousValue: Record<string, unknown>;
  newValue: Record<string, unknown>;
  timestamp: FieldValue;
  success: boolean;
  errorMessage?: string;
}

/**
 * Validates that the caller has manager privileges via custom claims
 */
async function validateManagerAccess(callerUid: string): Promise<{
  isValid: boolean;
  callerEmail: string | null;
  callerIsManager: boolean;
  error?: string;
}> {
  try {
    const callerRecord = await auth.getUser(callerUid);
    const customClaims = callerRecord.customClaims || {};

    if (customClaims.isManager !== true) {
      // Fallback: Check Firestore document for isManager
      const userDoc = await db.collection(USERS_COLLECTION).doc(callerUid).get();
      if (!userDoc.exists || userDoc.data()?.isManager !== true) {
        return {
          isValid: false,
          callerEmail: callerRecord.email || null,
          callerIsManager: false,
          error: "Permission denied. Only managers can perform this action.",
        };
      }
      // Manager status from Firestore
      return {
        isValid: true,
        callerEmail: callerRecord.email || null,
        callerIsManager: true,
      };
    }

    return {
      isValid: true,
      callerEmail: callerRecord.email || null,
      callerIsManager: true,
    };
  } catch (error) {
    console.error("Error validating manager access:", error);
    return {
      isValid: false,
      callerEmail: null,
      callerIsManager: false,
      error: "Failed to validate permissions.",
    };
  }
}

/**
 * Writes an audit log entry to Firestore
 */
async function writeAuditLog(entry: AuditLogEntry): Promise<void> {
  try {
    await db.collection(AUDIT_LOGS_COLLECTION).add(entry);
    console.log(
      `[AUDIT] ${entry.action} by ${entry.performedByEmail} on ${entry.targetEmail}: ` +
        `${JSON.stringify(entry.previousValue)} -> ${JSON.stringify(entry.newValue)} ` +
        `(success: ${entry.success})`
    );
  } catch (error) {
    // Log audit failure but don't fail the main operation
    console.error("Failed to write audit log:", error);
  }
}

/**
 * Counts the number of managers in the system
 */
async function countManagers(): Promise<number> {
  const managersSnapshot = await db
    .collection(USERS_COLLECTION)
    .where("isManager", "==", true)
    .get();
  return managersSnapshot.size;
}

/**
 * setManagerRole - Toggle manager status for a user
 *
 * **CORS Configuration:**
 * This function is configured with explicit CORS origins via the `cors` option.
 * Firebase Functions v2 automatically handles:
 * - Preflight OPTIONS requests
 * - Access-Control-Allow-Origin headers
 * - Access-Control-Allow-Methods (POST, OPTIONS)
 * - Access-Control-Allow-Headers (Content-Type, Authorization)
 *
 * The CORS configuration ensures only requests from allowed origins can call this function.
 * Requests from other origins will fail with a CORS error at the browser level.
 *
 * **Authorization Requirements:**
 * - Caller must be authenticated (Firebase Auth)
 * - Caller must be a manager (isManager custom claim or Firestore document)
 * - Cannot modify own role (prevents self-demotion/promotion)
 * - Cannot demote the last manager (lockout prevention)
 *
 * **Data Updates:**
 * - Updates both Firebase Auth custom claims AND Firestore document
 * - Writes comprehensive audit logs for all attempts (success and failure)
 *
 * @param request - CallableRequest containing auth context and data
 * @param request.data.uid - Target user's UID to modify
 * @param request.data.isManager - New manager status (true to promote, false to demote)
 * @returns Promise<{ success: boolean; uid: string; isManager: boolean }>
 * @throws HttpsError with appropriate error code for various failure scenarios
 */
export const setManagerRole = onCall<SetManagerRoleData>(
  {
    region: "us-west1",
    cors: ALLOWED_ORIGINS, // Explicit CORS configuration for allowed origins
  },
  async (request: CallableRequest<SetManagerRoleData>) => {
    const { auth: authContext, data } = request;

    // Validate authentication
    if (!authContext) {
      throw new HttpsError("unauthenticated", "User must be authenticated.");
    }

    const callerUid = authContext.uid;

    // Validate input
    if (!data || typeof data.uid !== "string" || typeof data.isManager !== "boolean") {
      throw new HttpsError(
        "invalid-argument",
        "Invalid input. Required: { uid: string, isManager: boolean }"
      );
    }

    const { uid: targetUid, isManager: newIsManager } = data;

    if (!targetUid || targetUid.trim() === "") {
      throw new HttpsError("invalid-argument", "Target user ID cannot be empty.");
    }

    // Validate manager access
    const {
      isValid,
      callerEmail,
      callerIsManager,
      error: accessError,
    } = await validateManagerAccess(callerUid);
    if (!isValid) {
      throw new HttpsError("permission-denied", accessError || "Permission denied.");
    }

    // Prevent self-modification
    if (callerUid === targetUid) {
      throw new HttpsError(
        "failed-precondition",
        "You cannot change your own manager status."
      );
    }

    // Get target user information
    let targetUserRecord;
    let targetUserDoc;
    try {
      targetUserRecord = await auth.getUser(targetUid);
      targetUserDoc = await db.collection(USERS_COLLECTION).doc(targetUid).get();
    } catch {
      throw new HttpsError("not-found", "Target user not found.");
    }

    const targetEmail = targetUserRecord.email || null;
    const currentClaims = targetUserRecord.customClaims || {};
    const currentIsManager = currentClaims.isManager === true;
    const firestoreIsManager = targetUserDoc.exists
      ? targetUserDoc.data()?.isManager === true
      : false;

    // If demoting a manager, check for last-manager lockout
    // NOTE: There is a potential race condition if two concurrent requests attempt to demote
    // different managers when only 2 managers exist. Both could pass this check before either
    // transaction completes, resulting in zero managers. For most use cases, this is acceptable
    // as simultaneous manager demotion is rare. For stricter guarantees, consider using
    // Firestore transactions with a manager count document that is updated atomically.
    if (currentIsManager && !newIsManager) {
      const managerCount = await countManagers();
      if (managerCount <= 1) {
        throw new HttpsError(
          "failed-precondition",
          "Cannot demote the last manager. At least one manager must exist."
        );
      }
    }

    // Prepare audit log entry
    const auditEntry: AuditLogEntry = {
      action: "setManagerRole",
      performedByUid: callerUid,
      performedByEmail: callerEmail,
      performedByIsManager: callerIsManager,
      targetUid,
      targetEmail,
      previousValue: {
        isManager: currentIsManager,
        firestoreIsManager,
      },
      newValue: { isManager: newIsManager },
      timestamp: FieldValue.serverTimestamp(),
      success: false,
    };

    try {
      // Update custom claims first
      await auth.setCustomUserClaims(targetUid, {
        ...currentClaims,
        isManager: newIsManager,
      });

      // Update Firestore document
      // If this fails after claims are updated, we log for manual reconciliation
      // since Firebase Auth custom claims cannot be rolled back atomically
      const userDocRef = db.collection(USERS_COLLECTION).doc(targetUid);
      try {
        if (targetUserDoc.exists) {
          await userDocRef.update({ isManager: newIsManager });
        } else {
          // Create user document if it doesn't exist
          await userDocRef.set(
            {
              uid: targetUid,
              email: targetEmail,
              displayName: targetUserRecord.displayName || null,
              isManager: newIsManager,
            },
            { merge: true }
          );
        }
      } catch (firestoreError) {
        // Log sync failure for manual reconciliation
        console.error(
          `[SYNC_FAILURE] Claims updated but Firestore failed for ${targetUid}. ` +
            `Claims isManager=${newIsManager}, Firestore may be out of sync. ` +
            `Run reconciliation script to fix.`,
          firestoreError
        );
        throw firestoreError;
      }

      // Mark audit as successful and write
      auditEntry.success = true;
      await writeAuditLog(auditEntry);

      console.log(
        `[setManagerRole] ${callerEmail} changed ${targetEmail} manager status: ` +
          `${currentIsManager} -> ${newIsManager}`
      );

      return {
        success: true,
        uid: targetUid,
        isManager: newIsManager,
      };
    } catch (error) {
      console.error("Error in setManagerRole:", error);
      auditEntry.errorMessage = error instanceof Error ? error.message : String(error);
      await writeAuditLog(auditEntry);
      throw new HttpsError("internal", "Failed to update manager role.");
    }
  }
);

/**
 * disableUser - Enable or disable a user account
 *
 * **CORS Configuration:**
 * This function uses the same CORS configuration as setManagerRole, allowing
 * calls from specified production and development origins. Firebase Functions v2
 * automatically handles CORS preflight requests and sets appropriate headers.
 *
 * **Authorization Requirements:**
 * - Caller must be authenticated (Firebase Auth)
 * - Caller must be a manager
 * - Cannot disable own account (prevents self-lockout)
 * - Cannot disable the only active manager (prevents system lockout)
 *
 * **Data Updates:**
 * - Updates Firebase Auth disabled flag
 * - Updates Firestore with isActive, disabledAt, disabledBy fields
 * - Writes comprehensive audit logs
 *
 * @param request - CallableRequest containing auth context and data
 * @param request.data.uid - Target user's UID to disable/enable
 * @param request.data.disabled - Whether to disable (true) or enable (false) the account
 * @returns Promise<{ success: boolean; uid: string; disabled: boolean }>
 * @throws HttpsError with appropriate error code for various failure scenarios
 */
export const disableUser = onCall<DisableUserData>(
  {
    region: "us-west1",
    cors: ALLOWED_ORIGINS, // Explicit CORS configuration for allowed origins
  },
  async (request: CallableRequest<DisableUserData>) => {
    const { auth: authContext, data } = request;

    // Validate authentication
    if (!authContext) {
      throw new HttpsError("unauthenticated", "User must be authenticated.");
    }

    const callerUid = authContext.uid;

    // Validate input
    if (!data || typeof data.uid !== "string" || typeof data.disabled !== "boolean") {
      throw new HttpsError(
        "invalid-argument",
        "Invalid input. Required: { uid: string, disabled: boolean }"
      );
    }

    const { uid: targetUid, disabled } = data;

    if (!targetUid || targetUid.trim() === "") {
      throw new HttpsError("invalid-argument", "Target user ID cannot be empty.");
    }

    // Validate manager access
    const {
      isValid,
      callerEmail,
      callerIsManager,
      error: accessError,
    } = await validateManagerAccess(callerUid);
    if (!isValid) {
      throw new HttpsError("permission-denied", accessError || "Permission denied.");
    }

    // Prevent self-disable
    if (callerUid === targetUid) {
      throw new HttpsError(
        "failed-precondition",
        "You cannot disable your own account."
      );
    }

    // Get target user information
    let targetUserRecord;
    let targetUserDoc;
    try {
      targetUserRecord = await auth.getUser(targetUid);
      targetUserDoc = await db.collection(USERS_COLLECTION).doc(targetUid).get();
    } catch {
      throw new HttpsError("not-found", "Target user not found.");
    }

    const targetEmail = targetUserRecord.email || null;
    const currentDisabled = targetUserRecord.disabled || false;
    const firestoreIsActive = targetUserDoc.exists
      ? targetUserDoc.data()?.isActive !== false
      : true;
    const targetIsManager = targetUserDoc.exists
      ? targetUserDoc.data()?.isManager === true
      : false;

    // If disabling a manager, check that they are not the only active manager
    // This prevents accidental lockout by disabling all managers
    if (disabled && targetIsManager) {
      const managerCount = await countManagers();
      if (managerCount <= 1) {
        throw new HttpsError(
          "failed-precondition",
          "Cannot disable the only active manager. Demote their manager role first or promote another user."
        );
      }
    }

    // Prepare audit log entry
    const auditEntry: AuditLogEntry = {
      action: "disableUser",
      performedByUid: callerUid,
      performedByEmail: callerEmail,
      performedByIsManager: callerIsManager,
      targetUid,
      targetEmail,
      previousValue: {
        disabled: currentDisabled,
        isActive: firestoreIsActive,
        isManager: targetIsManager,
      },
      newValue: { disabled, isActive: !disabled },
      timestamp: FieldValue.serverTimestamp(),
      success: false,
    };

    try {
      // Update Firebase Auth disabled flag
      await auth.updateUser(targetUid, { disabled });

      // Update Firestore document
      const userDocRef = db.collection(USERS_COLLECTION).doc(targetUid);
      const updateData: Record<string, unknown> = {
        isActive: !disabled,
      };

      if (disabled) {
        updateData.disabledAt = FieldValue.serverTimestamp();
        updateData.disabledBy = callerUid;
      } else {
        // When reactivating, clear the disabled fields
        updateData.disabledAt = FieldValue.delete();
        updateData.disabledBy = FieldValue.delete();
      }

      if (targetUserDoc.exists) {
        await userDocRef.update(updateData);
      } else {
        // Create user document if it doesn't exist
        await userDocRef.set(
          {
            uid: targetUid,
            email: targetEmail,
            displayName: targetUserRecord.displayName || null,
            isManager: false,
            ...updateData,
          },
          { merge: true }
        );
      }

      // Mark audit as successful and write
      auditEntry.success = true;
      await writeAuditLog(auditEntry);

      console.log(
        `[disableUser] ${callerEmail} ${disabled ? "disabled" : "enabled"} ${targetEmail}`
      );

      return {
        success: true,
        uid: targetUid,
        disabled,
      };
    } catch (error) {
      console.error("Error in disableUser:", error);
      auditEntry.errorMessage = error instanceof Error ? error.message : String(error);
      await writeAuditLog(auditEntry);
      throw new HttpsError("internal", "Failed to update user status.");
    }
  }
);
