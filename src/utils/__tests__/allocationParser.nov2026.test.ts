import { describe, it, expect } from 'vitest';
import { parseAllocationSource } from '../allocationParser';
import { parseAllocationSource as parseFunctions } from '../../../functions/src/allocationParser';

// Rows taken from Allocation 112 (Nov 18, 2026). This report introduced three things the
// parser did not handle and that dropped or mis-tagged cars on the board:
//   - a "Z" value in the PI column (BOS and options were read wrong),
//   - new models: TZ 450e (9300A) and RX 450h+ worded "RX450H PHEV LUX" (9443A),
//   - January arrival dates on a November report (dated last year instead of next).
const ALLOCATION_112_EXCERPT = [
  '11/18/2026 Toyota District Manager Allocation Application District:06 02:20:37 PM Allocation Status By Dealer Kayla Westergaard',
  'Allocation#: 112',
  'Sequence Number Order',
  '# Alloc # Model Serial # CC PI Color Seq # BOS Factory Accy PPOs LOC DM_Note',
  'Dealer: 64506-PRIORITY LEXUS VIRGNA BCH',
  '2 112 9026A V147CQ36 7 Z 0223-43 01911 N CK PP 11-23 DM PRE SELECT',
  '( ES 350h AWD PREMIUM+ )',
  '( CAVIAR )',
  '3 112 9300A V2000541 0 Y 04Y5-21 01608 N CP PC C1 EG KG K3 2T 3J 43 99-99',
  '( TZ 450e AWD TZ 450e AWD )',
  '( COPPER CREST )',
  '6 112 9355A VS51C379 9 Y 01J9-20 01641 Y CP FT ML TP DF KG MF 2T 3J 01-09',
  '( TX 350 AWD TX 350 AWD )',
  '( CELESTIAL SILVER METALLIC )',
  '15 112 9443A V147CS33 2 Z 01L1-46 02009 N CP NM PA PB PC TP 11-23 RPLCMNT - JTJCJMGA4V143BQ02',
  '( RX450H PHEV LUX 4WD PHEV LUX )',
  '( CLOUDBURST )',
  '30 112 9857A VC49D298 5 Z 01L2-21 02049 Y DM PC TO 2T 7R 87 GN KG WL 12-10 MY 27 NXH',
  '( NX 350h Premium+ 5-DOOR SUV AWD )',
  '( IRIDIUM )',
].join('\n');

describe('Allocation 112 format (Nov 2026)', () => {
  const result = parseAllocationSource(ALLOCATION_112_EXCERPT);

  it('keeps every car, including the new TZ 450e and the RX 450h+ PHEV', () => {
    expect(result.errors).toHaveLength(0);
    expect(result.vehicles.map((v) => v.code)).toEqual(['ES350H', 'TZ450E', 'TX350', 'RX450H+', 'NX350H']);
    expect(result.warnings).toHaveLength(0);
  });

  it('reads BOS correctly when the PI column says Z', () => {
    const nx = result.vehicles.find((v) => v.code === 'NX350H');
    const es = result.vehicles.find((v) => v.code === 'ES350H');
    expect(nx?.bos).toBe('Y');
    expect(es?.bos).toBe('N');
  });

  it('dates January arrivals on a November report in the next year', () => {
    const tx = result.vehicles.find((v) => v.code === 'TX350');
    const nx = result.vehicles.find((v) => v.code === 'NX350H');
    expect(tx?.arrival).toBe('2027-01-09');
    expect(nx?.arrival).toBe('2026-12-10');
  });

  it('leaves arrival dates that carry their own year untouched', () => {
    const r = parseAllocationSource('Report Date: 11/18/2026\nETA 3/12/2026 RX350 Black');
    expect(r.vehicles[0].arrival).toBe('2026-03-12');
  });

  it('dates a December arrival on a January report in the previous year', () => {
    const r = parseAllocationSource('Report Date: 1/5/2027\nETA 12/20 RX350 Black');
    expect(r.vehicles[0].arrival).toBe('2026-12-20');
  });

  it('does not shift years when the report date itself has no year', () => {
    const r = parseAllocationSource('ETA 6/1 RX350 Black\nETA 2/1 TX500H White');
    const year = new Date().getFullYear();
    expect(r.vehicles.map((v) => v.arrival)).toEqual([`${year}-06-01`, `${year}-02-01`]);
    expect(parseFunctions('ETA 6/1 RX350 Black\nETA 2/1 TX500H White').vehicles.map((v) => v.arrival)).toEqual([
      `${year}-06-01`,
      `${year}-02-01`,
    ]);
  });

  it('warns instead of silently dropping a row whose model number is unknown', () => {
    const unknown = parseAllocationSource(
      ALLOCATION_112_EXCERPT.replace('9300A V2000541', '9999A V2000541').replace('( TZ 450e AWD TZ 450e AWD )', '( MYSTERY MODEL )'),
    );
    expect(unknown.vehicles).toHaveLength(4);
    expect(unknown.warnings.join(' ')).toContain('9999A');
  });

  it('produces identical records in the Cloud Function copy of the parser', () => {
    const fromFunctions = parseFunctions(ALLOCATION_112_EXCERPT);
    expect(fromFunctions.vehicles).toEqual(result.vehicles);
    expect(fromFunctions.warnings).toEqual(result.warnings);
  });
});
