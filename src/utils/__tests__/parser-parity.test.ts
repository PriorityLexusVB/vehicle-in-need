import { describe, it, expect } from 'vitest';
import { parseAllocationSource as parseReference } from '../allocationParser';
// The LIVE email-ingestion path (functions/src/allocationEmailFunction.ts) imports
// THIS copy. It is a hand-maintained duplicate of the reference above and MUST
// produce identical records — a car's vehicle id is the join key for
// vehicle_links, so any divergence orphans customer links on every allocation
// update. This test is the parity guard.
import { parseAllocationSource as parseFunctions } from '../../../functions/src/allocationParser';

// Realistic allocation-source fixtures (the shapes the parser actually sees).
const FIXTURES: Array<{ name: string; source: string }> = [
  {
    name: 'simple two-vehicle ETA rows',
    source: `Report Date: 3/1/2026\nETA 3/12 RX350 Black\nETA 3/22 TX500H White`,
  },
  {
    name: 'quantity tokens around the code',
    source: `2x RX350\nTX350 3`,
  },
  {
    name: 'multi-vehicle same-model (id-collision stress)',
    source: `Report Date: 3/1/2026\nETA 3/12 RX350 Eminent White\nETA 3/15 RX350 Nightfall Mica\nETA 3/22 RX350 Atomic Silver\nETA 4/1 NX350 Grecian Water\nETA 4/5 TX500H Blueprint`,
  },
  {
    // The REAL production shape: a Toyota District Manager Allocation PDF extract
    // (source codes, factory accessories, post-production options, arrival dates).
    // This is the golden fixture — the live email-ingestion path parses exactly this.
    name: 'real Toyota DM allocation (PDF-extracted, with options)',
    source: [
      '2/19/2026 Toyota District Manager Allocation Application District:06 08:17:13 AM Allocation Status By Dealer',
      'Dealer: 64506-PRIORITY LEXUS VIRGNA BCH',
      '1 022 9353F TS12I666 8 Y 0223-01 01728 Y BI CC CP TP 1S 2T 59 87 DF Z1 0',
      '4-02 ( TX 350 AWD TX 350 AWD )',
      '( CA VIAR )',
      '6 022 9360F TS12H857 5 Y 0223-20 01788 Y BC CP TP 2T 3J 43 DF KG 03-27',
      '( TX 500h AWD TX 500h AWD )',
      '( CA VIAR )',
      '7 022 9412F TC12C779 2 Y 01L1-21 01814 Y CP MR NW PB PJ PP TP 2T 3J 59 DF EF GN KG MF WL 03-26',
      '( RX 350 AWD 5-DOOR SUV 4X4 )',
      '( CLOUDBURST GRAY )',
      'Page 1 of 2',
    ].join('\n'),
  },
];

describe('parser parity — functions/ (live ingestion) must equal src/ (reference)', () => {
  for (const { name, source } of FIXTURES) {
    it(`produces identical vehicles[] and counts: ${name}`, () => {
      const ref = parseReference(source);
      const fn = parseFunctions(source);

      // Same number of records and same summary counts.
      expect(fn.itemCount).toBe(ref.itemCount);
      expect(fn.vehicles).toHaveLength(ref.vehicles.length);

      // The load-bearing invariant: the join key (id) + quantity must match,
      // then the full record must match field-for-field.
      expect(fn.vehicles.map((v) => v.id)).toEqual(ref.vehicles.map((v) => v.id));
      expect(fn.vehicles.map((v) => v.quantity)).toEqual(ref.vehicles.map((v) => v.quantity));
      expect(fn.vehicles).toEqual(ref.vehicles);
    });
  }
});
