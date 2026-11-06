// Isolated test entry: actual DX UI/parser/feed, with no Firebase session or database access.
import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import DealerExchange from "../../components/DealerExchange";
import { beginDxRefresh, completeDxRefresh, createDxFeedState, failDxRefresh } from "../../src/utils/dxFeedState";
import { currentFileDxTrades } from "../../src/utils/dxCurrentFileScope";
import { fetchDxSheetWithMetadata } from "../../src/utils/dxSheetParser";
import "../../src/index.css";

function Preview() {
  const [feed, setFeed] = useState(createDxFeedState);
  const refresh = useCallback(async () => {
    setFeed((previous) => beginDxRefresh(previous, new Date()));
    try {
      const parsed = await fetchDxSheetWithMetadata(undefined, { signal: AbortSignal.timeout(10_000) });
      setFeed((previous) => completeDxRefresh(previous, currentFileDxTrades(parsed.trades), new Date(), parsed.rejectedRows));
    } catch {
      setFeed((previous) => failDxRefresh(previous, "Unable to refresh the source.", new Date()));
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return <MemoryRouter><main className="mx-auto max-w-7xl p-4 sm:p-6"><DealerExchange dxFeed={feed} onRefreshDx={() => { void refresh(); }} /></main></MemoryRouter>;
}

createRoot(document.getElementById("root")!).render(<Preview />);
