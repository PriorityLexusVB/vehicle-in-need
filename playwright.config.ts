import { defineConfig, devices } from "@playwright/test";

const e2ePort = Number(process.env.E2E_PORT || 8099);
const e2eBaseUrl = process.env.BASE_URL || `http://localhost:${e2ePort}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: e2eBaseUrl,
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: [{
    command: "npm run server",
    url: e2eBaseUrl,
    env: {
      PORT: String(e2ePort),
    },
    reuseExistingServer: true,
  }, {
    command: "npm run dev -- --host 127.0.0.1 --port 8101 --strictPort",
    url: "http://127.0.0.1:8101/e2e/fixtures/dx-preview.html",
    reuseExistingServer: !process.env.CI,
  }],
});
