interface PositionedToken {
  text: string;
  x: number;
  y: number;
}

interface TextContentLike {
  items: unknown[];
}

interface PageLike {
  getTextContent: () => Promise<TextContentLike>;
}

interface TextItemLike {
  str?: string;
  transform?: number[];
}

interface PdfJsModuleLike {
  getDocument: (options: { data: Uint8Array }) => {
    promise: Promise<{ numPages: number; getPage: (pageNumber: number) => Promise<PageLike> }>;
    destroy: () => Promise<void>;
  };
  GlobalWorkerOptions: {
    workerSrc: string;
  };
}

interface WorkerUrlModuleLike {
  default?: string;
}

const LINE_Y_TOLERANCE = 2;
let isPdfWorkerConfigured = false;

async function getPdfJsModule(): Promise<PdfJsModuleLike> {
  const [pdfJsModule, workerModule] = await Promise.all([
    import("pdfjs-dist/legacy/build/pdf.mjs") as Promise<PdfJsModuleLike>,
    import("pdfjs-dist/legacy/build/pdf.worker.mjs?url") as Promise<WorkerUrlModuleLike>,
  ]);

  if (!isPdfWorkerConfigured) {
    const workerSrc = workerModule.default;
    if (!workerSrc) {
      throw new Error("Unable to initialize PDF parser worker.");
    }
    pdfJsModule.GlobalWorkerOptions.workerSrc = workerSrc;
    isPdfWorkerConfigured = true;
  }

  return pdfJsModule;
}

function normalizeTokenText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function tokensToLines(tokens: PositionedToken[]): string[] {
  if (tokens.length === 0) {
    return [];
  }

  const sorted = [...tokens].sort((a, b) => {
    const yDelta = b.y - a.y;
    if (Math.abs(yDelta) > LINE_Y_TOLERANCE) {
      return yDelta;
    }
    return a.x - b.x;
  });

  const buckets: Array<{ y: number; tokens: PositionedToken[] }> = [];

  for (const token of sorted) {
    const existing = buckets.find(
      (bucket) => Math.abs(bucket.y - token.y) <= LINE_Y_TOLERANCE,
    );

    if (existing) {
      existing.tokens.push(token);
    } else {
      buckets.push({ y: token.y, tokens: [token] });
    }
  }

  return buckets
    .map((bucket) =>
      bucket.tokens
        .sort((a, b) => a.x - b.x)
        .map((token) => token.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((line) => line.length > 0);
}

async function extractLinesFromPage(page: PageLike): Promise<string[]> {
  const textContent = await page.getTextContent();
  const tokens: PositionedToken[] = [];

  for (const item of textContent.items as TextItemLike[]) {
    if (!item?.str) {
      continue;
    }

    const text = normalizeTokenText(item.str);
    if (!text) {
      continue;
    }

    const transform = Array.isArray(item.transform) ? item.transform : [];
    const x = Number(transform[4] ?? 0);
    const y = Number(transform[5] ?? 0);

    tokens.push({ text, x, y });
  }

  return tokensToLines(tokens);
}

export async function extractAllocationTextFromPdf(file: File): Promise<string> {
  const isPdfName = file.name.toLowerCase().endsWith(".pdf");
  const isPdfMime = file.type === "application/pdf";

  if (!isPdfName && !isPdfMime) {
    throw new Error("Please upload a PDF allocation file.");
  }

  const { getDocument } = await getPdfJsModule();
  const fileBuffer = await file.arrayBuffer();
  const loadingTask = getDocument({
    data: new Uint8Array(fileBuffer),
  });

  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const pageLines = await extractLinesFromPage(page as unknown as PageLike);
      if (pageLines.length > 0) {
        pages.push(pageLines.join("\n"));
      }
    }
  } finally {
    void loadingTask.destroy();
  }

  const extracted = pages.join("\n").trim();
  if (!extracted) {
    throw new Error("The uploaded PDF did not contain extractable text.");
  }

  return extracted;
}
