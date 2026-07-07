import { beforeEach, describe, expect, it } from "vitest";
import {
  AUTH_REDIRECT_HASH_KEY,
  restoreHashAfterFirebaseAuth,
  stripHashForFirebaseAuth,
} from "../authRedirectUrl";

describe("auth redirect URL helpers", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  it("strips hash routes before Firebase auth starts", () => {
    window.history.replaceState(null, "", "/#/admin");

    stripHashForFirebaseAuth();

    expect(window.location.href).toBe(`${window.location.origin}/`);
    expect(window.sessionStorage.getItem(AUTH_REDIRECT_HASH_KEY)).toBe("#/admin");
  });

  it("keeps normal query params while stripping only the hash", () => {
    window.history.replaceState(null, "", "/?source=vin#/admin");

    stripHashForFirebaseAuth();

    expect(window.location.href).toBe(`${window.location.origin}/?source=vin`);
    expect(window.sessionStorage.getItem(AUTH_REDIRECT_HASH_KEY)).toBe("#/admin");
  });

  it("restores the pending hash route after Firebase auth completes", () => {
    window.history.replaceState(null, "", "/#/admin");
    stripHashForFirebaseAuth();

    restoreHashAfterFirebaseAuth();

    expect(window.location.href).toBe(`${window.location.origin}/#/admin`);
    expect(window.sessionStorage.getItem(AUTH_REDIRECT_HASH_KEY)).toBeNull();
  });

  it("does nothing when the current URL has no hash route", () => {
    stripHashForFirebaseAuth();

    expect(window.location.href).toBe(`${window.location.origin}/`);
    expect(window.sessionStorage.getItem(AUTH_REDIRECT_HASH_KEY)).toBeNull();
  });
});
