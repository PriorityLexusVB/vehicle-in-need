import { CURRENT_DX_SOURCE, type DxTrade } from "./dxSheetParser";

/** Rob's accepted Trade Summary export; older seed files remain recovery artifacts only. */
export const DX_CURRENT_FILE_START_DATE = "2026-01-02";
export const DX_CURRENT_FILE_END_DATE = "2026-10-05";
export const DX_CURRENT_FILE_DATE_LABEL = "Jan 2–Oct 5, 2026";

export function currentFileDxTrades(trades: readonly DxTrade[]): DxTrade[] {
  return trades.filter((trade) =>
    trade.sourceYear === CURRENT_DX_SOURCE.sourceYear
    && trade.sourceWorkbookId === CURRENT_DX_SOURCE.workbookId
    && trade.sourceDataKind === "FULL_ROW"
    && trade.date >= DX_CURRENT_FILE_START_DATE
    && trade.date <= DX_CURRENT_FILE_END_DATE
    && /^\d{4}-\d{2}-\d{2}$/.test(trade.date)
    && !Number.isNaN(Date.parse(`${trade.date}T00:00:00Z`))
    && new Date(`${trade.date}T00:00:00Z`).toISOString().slice(0, 10) === trade.date,
  );
}
