#!/usr/bin/env node
/**
 * Screenshot the preview-mock build at several widths.
 *
 *   npm run build:mock
 *   npm run shots:mock                      → preview-mock/shots/
 *   npm run shots:mock -- C:\some\folder    → that folder
 *   npm run shots:mock -- out --routes=/,/allocation,/dealer-exchange,/admin
 *
 * Serves preview-mock/dist-mock with a tiny built-in static server (no extra
 * dependency), drives Chromium through the repo's @playwright/test, saves a
 * full-page PNG per route × width, and prints the horizontal-overflow check
 * (document scrollWidth vs clientWidth) plus any console/page errors.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(here, "dist-mock");

const args = process.argv.slice(2);
const routesArg = args.find((arg) => arg.startsWith("--routes="));
const outArg = args.find((arg) => !arg.startsWith("--"));
const outDir = path.resolve(outArg ?? path.join(here, "shots"));
const routes = routesArg
  ? routesArg.slice("--routes=".length).split(",").map((route) => route.trim()).filter(Boolean)
  : ["/", "/allocation", "/dealer-exchange"];
const widths = [375, 768, 1366, 1920];
const heights = { 375: 812, 768: 1024, 1366: 900, 1920: 1080 };

if (!fs.existsSync(path.join(distDir, "index.html"))) {
  console.error(`No build found at ${distDir}. Run "npm run build:mock" first.`);
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
  let filePath = path.normalize(path.join(distDir, urlPath));
  if (!filePath.startsWith(distDir)) {
    res.writeHead(403).end();
    return;
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) filePath = path.join(filePath, "index.html");
  if (!fs.existsSync(filePath)) {
    res.writeHead(404).end("not found");
    return;
  }
  res.writeHead(200, { "content-type": MIME[path.extname(filePath)] ?? "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const baseUrl = `http://127.0.0.1:${port}/index.html`;

function slug(route) {
  const cleaned = route.replace(/^\/+|\/+$/g, "").replace(/[^a-z0-9]+/gi, "-");
  return cleaned || "dashboard";
}

let browser;
const results = [];
try {
  browser = await chromium.launch();
  for (const route of routes) {
    for (const width of widths) {
      const context = await browser.newContext({ viewport: { width, height: heights[width] ?? 900 } });
      const page = await context.newPage();
      const errors = [];
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(`console: ${message.text()}`);
      });
      page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
      page.on("requestfailed", (request) => {
        const url = request.url();
        // Google Fonts is the only external request the app makes; note but don't fail on it.
        if (!/fonts\.(googleapis|gstatic)\.com/.test(url)) errors.push(`requestfailed: ${url}`);
      });

      await page.goto(`${baseUrl}#${route}`, { waitUntil: "load" });
      // Let mock listeners deliver, the DX feed resolve, and entry animations settle.
      await page.waitForSelector("main", { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1800);

      const metrics = await page.evaluate(() => ({
        hash: window.location.hash,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        loginVisible: /sign in with google/i.test(document.body.innerText),
        textLength: document.body.innerText.trim().length,
      }));
      // The fixed "synthetic data" pill would float mid-page in a full-page capture.
      await page.evaluate(() => document.getElementById("preview-mock-badge")?.remove());
      const file = path.join(outDir, `${slug(route)}-${width}.png`);
      await page.screenshot({ path: file, fullPage: true });
      await context.close();

      const overflow = metrics.scrollWidth - metrics.clientWidth;
      results.push({ route, width, file, overflow, errors, ...metrics });
      console.log(
        [
          `route=${route}`.padEnd(24),
          `width=${width}`.padEnd(11),
          `final=${metrics.hash}`.padEnd(26),
          `scrollWidth=${metrics.scrollWidth} clientWidth=${metrics.clientWidth}`,
          overflow > 0 ? `OVERFLOW +${overflow}px` : "no-overflow",
          metrics.loginVisible ? "LOGIN-SCREEN" : "",
          `errors=${errors.length}`,
        ].filter(Boolean).join("  "),
      );
      for (const error of errors) console.log(`    ${error}`);
    }
  }
} finally {
  await browser?.close();
  server.close();
}

const overflowing = results.filter((result) => result.overflow > 0);
const withErrors = results.filter((result) => result.errors.length > 0);
console.log(`\n${results.length} screenshots → ${outDir}`);
console.log(`horizontal overflow: ${overflowing.length === 0 ? "none" : overflowing.map((r) => `${r.route}@${r.width} (+${r.overflow}px)`).join(", ")}`);
console.log(`pages with console/page errors: ${withErrors.length}`);
