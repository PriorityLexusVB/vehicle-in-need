import { describe, expect, it } from "vitest";

const { evaluateDrift, APP_PATHS } = require("../scripts/check-deploy-drift.cjs");

describe("deploy drift decision", () => {
  const base = { liveResolved: true, appCommitIsInLive: true, appCommitAgeHours: 100, graceHours: 6 };

  it("is OK when production contains the latest app-code commit", () => {
    expect(evaluateDrift(base)).toMatchObject({ state: "OK", exitCode: 0 });
  });

  it("is PENDING (exit 0) inside the grace window", () => {
    expect(evaluateDrift({ ...base, appCommitIsInLive: false, appCommitAgeHours: 2 })).toMatchObject({
      state: "PENDING",
      exitCode: 0,
    });
  });

  it("is DRIFT (exit 1) once the latest app code is missing and older than the grace window", () => {
    expect(evaluateDrift({ ...base, appCommitIsInLive: false, appCommitAgeHours: 30 })).toMatchObject({
      state: "DRIFT",
      exitCode: 1,
    });
  });

  it("is UNKNOWN (exit 2) when production's version cannot be resolved to a commit", () => {
    expect(evaluateDrift({ ...base, liveResolved: false })).toMatchObject({ state: "UNKNOWN", exitCode: 2 });
  });

  it("treats exactly the grace boundary as DRIFT", () => {
    expect(evaluateDrift({ ...base, appCommitIsInLive: false, appCommitAgeHours: 6 })).toMatchObject({
      state: "DRIFT",
    });
  });

  it("does not watch CI-only files, so editing the workflow never raises a drift alarm", () => {
    expect(APP_PATHS.some((p: string) => p.startsWith(".github"))).toBe(false);
    expect(APP_PATHS).toContain("server");
    expect(APP_PATHS).toContain("src");
  });
});
