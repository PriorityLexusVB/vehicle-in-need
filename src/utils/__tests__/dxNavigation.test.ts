import { describe, expect, it } from "vitest";
import { getLegacyDxDestination } from "../dxNavigation";

describe("Dealer Exchange navigation compatibility", () => {
  it("maps the former Allocation Board DX focus URL to the first-class route", () => {
    const params = new URLSearchParams(
      "view=log&scrollTo=dx-pipeline&dxModel=TX350",
    );

    expect(getLegacyDxDestination(params)).toBe(
      "/dealer-exchange?scrollTo=dx-pipeline&dxModel=TX350",
    );
  });

  it("does not reroute Allocation Board-only focus queries", () => {
    expect(
      getLegacyDxDestination(new URLSearchParams("model=RX350&view=matches")),
    ).toBeNull();
  });
});
