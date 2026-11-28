/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars -- mock signatures mirror the real SDK */
/**
 * Preview-mock stand-in for "firebase/auth".
 *
 * The preview is permanently "signed in" as a synthetic manager so the real
 * App renders its manager surfaces. Sign-out shows the real Login screen, and
 * any sign-in call from that screen signs the synthetic manager back in.
 */
import { MOCK_MANAGER } from "./seed";

type AuthListener = (user: any) => void;

const mockUser = {
  uid: MOCK_MANAGER.uid,
  email: MOCK_MANAGER.email,
  displayName: MOCK_MANAGER.displayName,
  emailVerified: true,
  isAnonymous: false,
  photoURL: null,
  providerData: [],
  getIdToken: async () => "preview-mock-token",
  getIdTokenResult: async () => ({ token: "preview-mock-token", claims: { isManager: true } }),
};

const listeners = new Set<AuthListener>();

const authInstance: any = {
  name: "[DEFAULT]",
  currentUser: mockUser,
  app: null,
  config: {},
};

function emit() {
  for (const listener of [...listeners]) listener(authInstance.currentUser);
}

export function getAuth(..._args: unknown[]) {
  return authInstance;
}

export function onAuthStateChanged(_auth: unknown, nextOrObserver: any): () => void {
  const listener: AuthListener =
    typeof nextOrObserver === "function" ? nextOrObserver : (user) => nextOrObserver?.next?.(user);
  listeners.add(listener);
  setTimeout(() => {
    if (listeners.has(listener)) listener(authInstance.currentUser);
  }, 0);
  return () => {
    listeners.delete(listener);
  };
}

export const onIdTokenChanged = onAuthStateChanged;

export async function signOut() {
  authInstance.currentUser = null;
  emit();
}

async function signInMockUser() {
  authInstance.currentUser = mockUser;
  emit();
  return { user: mockUser, providerId: "google.com", operationType: "signIn" };
}

export const signInWithPopup = signInMockUser;
export const signInWithRedirect = signInMockUser;
export const signInWithCredential = signInMockUser;

export async function getRedirectResult() {
  return null;
}

export async function setPersistence() {}

export const browserLocalPersistence = { type: "LOCAL" };
export const browserSessionPersistence = { type: "SESSION" };
export const inMemoryPersistence = { type: "NONE" };

export class GoogleAuthProvider {
  providerId = "google.com";
  private params: Record<string, string> = {};

  setCustomParameters(params: Record<string, string>) {
    this.params = { ...params };
    return this;
  }

  addScope() {
    return this;
  }

  static credential() {
    return {};
  }
}

export function connectAuthEmulator() {}

// Type-only names; exported as harmless values in case an import survives.
export class Auth {}
export class AuthProvider {}
export class UserCredential {}
export class User {}
