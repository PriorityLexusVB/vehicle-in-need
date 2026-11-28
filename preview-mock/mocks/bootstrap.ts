/**
 * Runs before the app entry (injected into index.html by vite.mock.config.ts).
 *
 * 1. Intercepts the Dealer Exchange Google Sheet CSV request and answers with
 *    synthetic rows, so no network call reaches Google.
 * 2. Labels the page as a synthetic-data preview.
 */
import { buildDxCsv } from "./dx-feed";

const realFetch = window.fetch.bind(window);

window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (/docs\.google\.com\/spreadsheets\/.+\/gviz\/tq/.test(url)) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    if (init?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    return new Response(buildDxCsv(), {
      status: 200,
      headers: { "content-type": "text/csv; charset=utf-8" },
    });
  }
  return realFetch(input, init);
};

document.title = `Preview · ${document.title}`;

function addPreviewBadge() {
  const badge = document.createElement("div");
  badge.textContent = "Preview · synthetic data";
  badge.id = "preview-mock-badge";
  badge.setAttribute("aria-hidden", "true");
  badge.style.cssText = [
    "position:fixed",
    "left:8px",
    "bottom:8px",
    "z-index:2147483647",
    "pointer-events:none",
    "font:600 10px/1 Inter,system-ui,sans-serif",
    "letter-spacing:.04em",
    "text-transform:uppercase",
    "color:#fff",
    "background:rgba(12,10,9,.72)",
    "padding:5px 8px",
    "border-radius:999px",
  ].join(";");
  document.body.appendChild(badge);
}

if (document.body) addPreviewBadge();
else document.addEventListener("DOMContentLoaded", addPreviewBadge);
