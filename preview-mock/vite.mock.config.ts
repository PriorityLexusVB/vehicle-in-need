/**
 * Preview-mock build: the REAL app (index.html → src/main.tsx → App.tsx and
 * every component) bundled with Firebase swapped for in-memory mocks seeded
 * with synthetic data. Output is a static folder that works on any static
 * host (relative asset paths + HashRouter).
 *
 *   npm run build:mock   → preview-mock/dist-mock/
 *
 * The production build (vite.config.ts) is not touched by this file.
 */
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const mock = (file: string) => path.resolve(here, "mocks", file);

function gitSha(): string {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: repoRoot }).toString().trim();
  } catch {
    return "dev";
  }
}

/** Load the fetch interceptor + preview badge before the app entry. */
function injectPreviewBootstrap(): Plugin {
  return {
    name: "preview-mock-bootstrap",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        const entry = '<script type="module" src="/src/main.tsx"></script>';
        if (!html.includes(entry)) {
          throw new Error("preview-mock: could not find the app entry script in index.html");
        }
        return html.replace(
          entry,
          `<script type="module" src="/preview-mock/mocks/bootstrap.ts"></script>\n    ${entry}`,
        );
      },
    },
  };
}

/**
 * The real Google Sheet IDs for the DX workbooks stay out of the public
 * preview bundle. The fetch interceptor in mocks/bootstrap.ts answers any
 * sheet URL, so placeholder IDs work the same.
 */
function scrubSheetIds(): Plugin {
  return {
    name: "preview-mock-scrub-sheet-ids",
    enforce: "pre",
    transform(code, id) {
      if (id.replace(/\\/g, "/").endsWith("services/firebase.ts")) {
        // Firebase is fully mocked; keep the real project config out of the bundle.
        return code
          .replace(/apiKey: "[^"]+"/, 'apiKey: "preview-api-key"')
          .replace(/vehicles-in-need/g, "preview-project")
          .replace(/(messagingSenderId|appId|measurementId): "[^"]+"/g, '$1: "preview"');
      }
      if (!/dxSheetParser\.ts$/.test(id)) return null;
      let year = 2024;
      return code.replace(/workbookId: "[A-Za-z0-9_-]{30,}"/g, () => `workbookId: "preview-sheet-${year++}"`);
    },
  };
}

const commitSha = `${gitSha()}-preview`;
const buildTime = new Date().toISOString();

export default defineConfig({
  root: repoRoot,
  base: "./",
  publicDir: path.resolve(repoRoot, "public"),
  plugins: [
    nodePolyfills({ protocolImports: true }),
    react(),
    injectPreviewBootstrap(),
    scrubSheetIds(),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(commitSha),
    __BUILD_TIME__: JSON.stringify(buildTime),
    "import.meta.env.VITE_APP_COMMIT_SHA": JSON.stringify(commitSha),
    "import.meta.env.VITE_APP_BUILD_TIME": JSON.stringify(buildTime),
  },
  resolve: {
    alias: [
      { find: /^firebase\/app$/, replacement: mock("firebase-app.ts") },
      { find: /^firebase\/auth$/, replacement: mock("firebase-auth.ts") },
      { find: /^firebase\/firestore$/, replacement: mock("firebase-firestore.ts") },
      { find: /^firebase\/functions$/, replacement: mock("firebase-functions.ts") },
      { find: /^virtual:pwa-register\/react$/, replacement: mock("pwa-register-react.ts") },
      // Real DX history is confidential; the public preview gets fictional dealers.
      { find: /^(\.\.?\/)+(src\/)?data\/dxHistoricalSeeds(\.ts)?$/, replacement: mock("dxHistoricalSeeds.ts") },
      { find: /^@\//, replacement: `${repoRoot}/` },
    ],
  },
  build: {
    outDir: path.resolve(here, "dist-mock"),
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 4000,
  },
  preview: {
    port: 4174,
    strictPort: false,
  },
});
