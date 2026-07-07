export const AUTH_REDIRECT_HASH_KEY = "vin:pending-auth-hash";

export function getHashlessCurrentUrl(): string {
  if (typeof window === "undefined") return "";

  const { origin, pathname, search } = window.location;
  return `${origin}${pathname}${search}`;
}

export function stripHashForFirebaseAuth(): void {
  if (typeof window === "undefined") return;

  const { hash } = window.location;
  if (!hash || hash === "#") return;

  try {
    window.sessionStorage.setItem(AUTH_REDIRECT_HASH_KEY, hash);
  } catch {
    // Auth can still proceed without route restoration if storage is blocked.
  }

  window.history.replaceState(
    window.history.state,
    document.title,
    getHashlessCurrentUrl()
  );
}

export function restoreHashAfterFirebaseAuth(): void {
  if (typeof window === "undefined") return;

  let pendingHash: string | null = null;
  try {
    pendingHash = window.sessionStorage.getItem(AUTH_REDIRECT_HASH_KEY);
    window.sessionStorage.removeItem(AUTH_REDIRECT_HASH_KEY);
  } catch {
    return;
  }

  if (!pendingHash || window.location.hash) return;

  window.history.replaceState(
    window.history.state,
    document.title,
    `${getHashlessCurrentUrl()}${pendingHash}`
  );
}
