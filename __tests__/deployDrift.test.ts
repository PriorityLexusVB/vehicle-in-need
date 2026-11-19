import { describe, expect, it } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS script under test
const { evaluateDrift, APP_PATHS } = require("../scripts/check-deploy-drift.cjs");

describe("deploy drift decision", () => {
  const base = {
    liveResolved: true,
    treeMatchesMain: false,
    appCommitIsInLive: false,
    appCommitAgeHours: 100,
    graceHours: 6,
  };

  it("is OK when production runs the same app code as main (even with different commit ids)", () => {
    expect(evaluateDrift({ ...base, treeMatchesMain: true })).toMatchObject({ state: "OK", exitCode: 0 });
  });

  it("is PENDING (exit 3) inside the grace window, so an open drift issue is not closed", () => {
    expect(evaluateDrift({ ...base, appCommitAgeHours: 2 })).toMatchObject({ state: "PENDING", exitCode: 3 });
  });

  it("is DRIFT (exit 1) when production differs from main and main's app code is older than the grace window", () => {
    expect(evaluateDrift({ ...base, appCommitAgeHours: 30 })).toMatchObject({ state: "DRIFT", exitCode: 1 });
  });

  it("treats exactly the grace boundary as DRIFT", () => {
    expect(evaluateDrift({ ...base, appCommitAgeHours: 6 })).toMatchObject({ state: "DRIFT" });
  });

  it("is UNKNOWN (exit 2) when production is ahead of / off main (contains main's latest app commit but differs)", () => {
    expect(evaluateDrift({ ...base, appCommitIsInLive: true })).toMatchObject({ state: "UNKNOWN", exitCode: 2 });
  });

  it("is UNKNOWN (exit 2) when production's version cannot be resolved to a commit", () => {
    expect(evaluateDrift({ ...base, liveResolved: false })).toMatchObject({ state: "UNKNOWN", exitCode: 2 });
  });

  it("does not watch CI-only files, so editing the workflow never raises a drift alarm", () => {
    expect(APP_PATHS.some((p: string) => p.startsWith(".github"))).toBe(false);
    expect(APP_PATHS).toContain("server");
    expect(APP_PATHS).toContain("src");
  });
});
