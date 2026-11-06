import { test, expect } from "@playwright/test";

const preview = "http://127.0.0.1:8101/e2e/fixtures/dx-preview.html";
const source = "https://docs.google.com/spreadsheets/d/1OGBQ_4TRJB54ipPr5h-eAOjfLxLuY6EuchxSI3dWE7E/**";
const header = ["DATE", "YEAR", "MODEL #", "DESCRIPTION", "CC", "COLOR", "VIN (INCOMING)", "TRADING DEALER", "DEALER CODE", "STOCK #", "DX FEE", "OURS | THEIRS", "SALES CONSULTTANT", "OUTGOING STOCK#", "VIN (OUTGOING)", "MODEL #", "A SWAP?"];
const csv = (extra = false) => [header,
  ["10/5", "26", "9353", "TX350", "", "WHITE", "", "NEWPORT NEWS", "64531", "1001", "100", "OURS", "", "", "", "", ""],
  ["10/29", "26", "9845", "NX350h", "", "BLACK", "", "RALEIGH", "63203", "1002", "", "", "", "9002", "", "9353", "YES"],
  ["11/5", "26", "9353", "TX350", "", "BLUE", "", "NEWPORT NEWS", "64531", "1003", "0", "THEIRS", "", "9003", "", "9353", "YES"],
  ...(extra ? [["10/31", "26", "9353", "TX350", "", "SILVER", "", "NEWPORT NEWS", "64531", "1004", "50", "OURS", "", "", "", "", ""]] : []),
].map((row) => row.map((cell) => JSON.stringify(cell)).join(",")).join("\n");

for (const viewport of [{ name: "desktop", width: 1440, height: 1000 }, { name: "mobile", width: 390, height: 844 }]) {
  test(`${viewport.name}: month changes every surface, source links, refresh and failure states`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let mode: "initial" | "extra" | "failure" = "initial";
    await page.route(source, async (route) => {
      if (mode === "failure") return route.abort("failed");
      return route.fulfill({ status: 200, contentType: "text/csv", body: csv(mode === "extra") });
    });
    await page.goto(preview);
    await expect(page.getByText("3 ledger records", { exact: true })).toBeVisible();
    await expect(page.getByText("2 of 3 records have a fee", { exact: true })).toBeVisible();
    await expect(page.getByText(/We owe|They owe us/)).toHaveCount(0);
    const month = page.getByRole("combobox", { name: "Month" });
    await month.selectOption("2026-10");
    await expect(page.getByText("2 ledger records", { exact: true })).toBeVisible();
    await expect(page.getByText("2 received − 1 sent", { exact: true })).toBeVisible();
    await expect(page.getByText("1 of 2 records have a fee", { exact: true })).toBeVisible();
    await expect(page.getByText("1 without a fee entered", { exact: true })).toBeVisible();
    const partner = viewport.name === "desktop"
      ? page.getByRole("table").getByRole("button", { name: "NEWPORT NEWS", exact: true })
      : page.getByRole("button").filter({ hasText: "NEWPORT NEWS" });
    await partner.click();
    const drawer = page.getByTestId("dx-dealer-history-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer.getByTestId("dx-history-event")).toHaveCount(1);
    await expect(drawer.getByRole("link", { name: /Source: 2026 row/ })).toHaveAttribute("href", /range=A2:R2/);
    await page.getByRole("button", { name: "Close dealer history" }).click();
    await expect(drawer).not.toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`dx-${viewport.name}-october-partners.png`), fullPage: true });

    await page.getByRole("tab", { name: "Ledger records" }).click();
    await expect(page.getByRole("link", { name: /2026 row 4/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /2026 row 3/ }).filter({ visible: true })).toHaveCount(1);
    await month.selectOption("2026-11");
    await expect(page.getByText("1 ledger record", { exact: true })).toBeVisible();
    await expect(page.getByText("$0", { exact: true })).toBeVisible();
    await month.selectOption("2026-12");
    await expect(page.getByText("0 ledger records", { exact: true })).toBeVisible();
    await expect(page.getByText(/No DX records for December 2026/)).toBeVisible();
    await page.getByRole("tab", { name: "DX Partners" }).click();
    await expect(page.getByText(/No dealer exchanges for December 2026/)).toBeVisible();

    await month.selectOption("2026-10");
    mode = "extra";
    await page.getByRole("button", { name: "Refresh current source" }).click();
    await expect(page.getByText("3 ledger records", { exact: true })).toBeVisible();
    await expect(month).toHaveValue("2026-10");
    await expect(page.getByText("$150", { exact: true })).toBeVisible();
    mode = "failure";
    await page.getByRole("button", { name: "Refresh current source" }).click();
    await expect(page.getByText("Showing last successful data.", { exact: true })).toBeVisible();
    await expect(page.getByText("3 ledger records", { exact: true })).toBeVisible();
    await month.selectOption("");
    await expect(page.getByText("4 ledger records", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
