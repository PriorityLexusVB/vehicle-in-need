import { CURRENT_DX_SOURCE, type DxTrade } from "./dxSheetParser";

/** Live source-year rows only; an export's last date must never cap future refreshes. */
export const DX_CURRENT_FILE_START_DATE = `${CURRENT_DX_SOURCE.sourceYear}-01-01`;
export const DX_CURRENT_FILE_END_DATE = `${CURRENT_DX_SOURCE.sourceYear}-12-31`;
export const DX_CURRENT_FILE_DATE_LABEL = String(CURRENT_DX_SOURCE.sourceYear);

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
