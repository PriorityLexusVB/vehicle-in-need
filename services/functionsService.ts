/**
 * Firebase Functions service for role management
 * 
 * This module provides callable functions for manager role management:
 * - setManagerRole: Toggle manager status for users
 * - disableUser: Enable/disable user accounts
 * 
 * All functions require the caller to have manager privileges.
 */

import { getFunctions, httpsCallable, connectFunctionsEmulator, Functions } from "firebase/functions";
import { getApp, getApps } from "firebase/app";

// Lazy-load Firebase Functions instance
let functionsInstance: Functions | null = null;
let emulatorConnected = false;

function getFunctionsInstance(): Functions {
  if (!functionsInstance) {
    // Check if Firebase app is initialized
    if (getApps().length === 0) {
      throw new Error("Firebase app not initialized. Please ensure Firebase is initialized before calling functions.");
    }
    
    const app = getApp();
    functionsInstance = getFunctions(app, "us-west1");
    
    // Connect to emulator in development (only once)
    if (!emulatorConnected && typeof import.meta !== 'undefined' && import.meta.env?.DEV && import.meta.env?.VITE_USE_EMULATORS === "true") {
      connectFunctionsEmulator(functionsInstance, "localhost", 5001);
      emulatorConnected = true;
    }
  }
  return functionsInstance;
}

/**
 * Input for setManagerRole function
 */
export interface SetManagerRoleInput {
  uid: string;
  isManager: boolean;
}

/**
 * Result from setManagerRole function
 */
export interface SetManagerRoleResult {
  success: boolean;
  uid: string;
  isManager: boolean;
}

/**
 * Input for disableUser function
 */
export interface DisableUserInput {
  uid: string;
  disabled: boolean;
}

/**
 * Result from disableUser function
 */
export interface DisableUserResult {
  success: boolean;
  uid: string;
  disabled: boolean;
}

/**
 * Call the setManagerRole cloud function
 * 
 * @param uid - The target user's UID
 * @param isManager - Whether to grant or revoke manager status
 * @returns Promise with the result containing success status
 * @throws HttpsError if the operation fails (permission denied, invalid input, etc.)
 */
export async function callSetManagerRole(
  uid: string,
  isManager: boolean
): Promise<SetManagerRoleResult> {
  const functions = getFunctionsInstance();
  const callable = httpsCallable<SetManagerRoleInput, SetManagerRoleResult>(
    functions,
    "setManagerRole"
  );
  const result = await callable({ uid, isManager });
  return result.data;
}

/**
 * Call the disableUser cloud function
 * 
 * @param uid - The target user's UID
 * @param disabled - Whether to disable or enable the account
 * @returns Promise with the result containing success status
 * @throws HttpsError if the operation fails (permission denied, invalid input, etc.)
 */
export async function callDisableUser(
  uid: string,
  disabled: boolean
): Promise<DisableUserResult> {
  const functions = getFunctionsInstance();
  const callable = httpsCallable<DisableUserInput, DisableUserResult>(
    functions,
    "disableUser"
  );
  const result = await callable({ uid, disabled });
  return result.data;
}

/**
 * Parse Firebase Functions error messages into user-friendly messages
 */
export function parseFirebaseFunctionError(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const functionError = error as { code: string; message?: string };
    
    switch (functionError.code) {
      case "functions/unauthenticated":
        return "You must be logged in to perform this action.";
      case "functions/permission-denied":
        return "You don't have permission to perform this action. Only managers can manage user roles.";
      case "functions/invalid-argument":
        return functionError.message || "Invalid input provided.";
      case "functions/failed-precondition":
        return functionError.message || "This action cannot be performed due to current conditions.";
      case "functions/not-found":
        return "The specified user was not found.";
      case "functions/internal":
        return "An unexpected error occurred. Please try again.";
      default:
        return functionError.message || "An error occurred. Please try again.";
    }
  }
  
  if (error instanceof Error) {
    return error.message;
  }
  
  return "An unexpected error occurred. Please try again.";
}
