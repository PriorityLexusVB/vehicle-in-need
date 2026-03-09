# Nightly Handoff - 2026-03-09

## Scope Completed

- Restored manager upload and drag-drop source ingestion in Allocation Board manager panel.
- Stabilized parser/runtime regressions for multiline PDF-shaped allocation text.
- Preserved vehicle-first Strategy View behavior and Full Log code/model split behavior.

## Key Fixes Landed

- `components/AllocationBoard.tsx`
  - Added source file input + drag/drop handling in manager panel.
  - Added robust file reading fallback for runtimes where `File.text()` is unavailable (uses `FileReader`).
  - Kept parse preview flow (`Rows/Units/Value/Hybrid`) and parse/publish manager workflow.
  - Strategy and Full Log continue to render normalized 4-digit code display and distinct model values.

- `src/utils/allocationParser.ts`
  - Added multiline parsing hardening for wrapped rows and split model tokens.
  - Added date support for `MM-DD` style values used in extracted sources.
  - Prevented duplicate vehicle creation from merged-line matching.
  - Added narrow context-window extraction so source metadata (e.g., `9353F/9443F/9706F`) can be recovered when model tokens appear on following lines.

- `src/utils/allocationTypes.ts`
  - Added optional fields used by parser/UI mapping (`model`, `sourceCode`, `interior`, `timelineType`, `bos`, `factoryAccessories`, `postProductionOptions`).

## Tests Added/Updated

- `components/__tests__/AllocationBoard.test.tsx`
  - Manager panel upload controls and file upload loading path.
  - Strategy and Full Log assertions for code/model split.

- `src/utils/__tests__/allocationParser.test.ts`
  - DM-style extraction coverage.
  - Split-row and wrapped multiline regression coverage.
  - PDF-shaped sample coverage including:
    - source codes like `9353F`, `9443F`, `9706F`
    - wrapped Factory Accy / PPOs
    - `LOC` and `PORT` context
    - split model rows

## Validation Status (latest run)

- `npm run lint` -> pass (`LINT_EXIT:0`)
- `npx vitest run src/utils/__tests__/allocationParser.test.ts` -> pass (`12/12`)
- `npx vitest run components/__tests__/AllocationBoard.test.tsx` -> pass (`5/5`)

## Notes For Tomorrow

- Live verification target remains:
  - parse preview rows > 0 on the real sample
  - Strategy rows show `4-digit code · model` instead of `---- · model`
  - Full Log keeps `Code` and `Model` distinct
  - interior / Factory Accy / PPOs display only when truly present
