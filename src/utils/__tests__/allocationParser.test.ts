import { describe, it, expect } from 'vitest';
import { parseAllocationSource, groupArrivalBucket } from '../allocationParser';

describe('parseAllocationSource', () => {
  it('parses mapped Lexus codes and computes summary', () => {
    const source = `Report Date: 3/1/2026\nETA 3/12 RX350 Black\nETA 3/22 TX500H White`;

    const result = parseAllocationSource(source);

    expect(result.errors).toHaveLength(0);
    expect(result.reportDate).toBe('2026-03-01');
    expect(result.itemCount).toBe(2);
    expect(result.summary.units).toBe(2);
    expect(result.summary.value).toBe(0);
    expect(result.summary.hybridMix).toBe(50);
    expect(result.vehicles[0].interiorColor).toBe('TBD');
    expect(result.vehicles[0].bos).toBe('TBD');
  });

  it('supports quantity tokens around model code', () => {
    const source = '2x RX350\nTX350 3';
    const result = parseAllocationSource(source);

    expect(result.errors).toHaveLength(0);
    expect(result.vehicles[0].quantity).toBe(2);
    expect(result.vehicles[1].quantity).toBe(3);
    expect(result.summary.units).toBe(5);
  });

  it('returns validation error when no mapped code is found', () => {
    const result = parseAllocationSource('random note with no allocation models');

    expect(result.vehicles).toHaveLength(0);
    expect(result.errors[0]).toContain('No supported Lexus model codes');
  });

  it('parses table-like header layouts with spaced/hyphenated model codes', () => {
    const source = [
      'Report Date: 3/1/2026',
      'QTY   MODEL        BOS   ETA          EXT COLOR              INT COLOR',
      '1     RX 350       Y     3/12/2026     223 Caviar             EA20 Black',
      '2     TX-500H      N     3/22/2026     085 Ultra White        LC10 Red',
    ].join('\n');

    const result = parseAllocationSource(source);

    expect(result.errors).toHaveLength(0);
    expect(result.itemCount).toBe(2);
    expect(result.vehicles[0].code).toBe('RX350');
    expect(result.vehicles[0].arrival).toBe('2026-03-12');
    expect(result.vehicles[0].color).toBe('223 CAVIAR');
    expect(result.vehicles[0].interiorColor).toBe('EA20 BLACK');
    expect(result.vehicles[0].bos).toBe('Y');
    expect(result.vehicles[0].quantity).toBe(1);
    expect(result.vehicles[1].code).toBe('TX500H');
    expect(result.vehicles[1].arrival).toBe('2026-03-22');
    expect(result.vehicles[1].color).toBe('085 ULTRA WHITE');
    expect(result.vehicles[1].interiorColor).toBe('LC10 RED');
    expect(result.vehicles[1].bos).toBe('N');
    expect(result.vehicles[1].quantity).toBe(2);
  });

  it('supports wrapped/PDF-like blocks where exterior color is on a continuation line', () => {
    const source = [
      'Allocation Date: 3/1/2026',
      'QTY   MODEL        ETA          EXT COLOR              INT COLOR',
      '1     RX350        3/12/2026',
      '                   223 Caviar             EA20 Black',
    ].join('\n');

    const result = parseAllocationSource(source);

    expect(result.errors).toHaveLength(0);
    expect(result.itemCount).toBe(1);
    expect(result.vehicles[0].code).toBe('RX350');
    expect(result.vehicles[0].arrival).toBe('2026-03-12');
    expect(result.vehicles[0].color).toBe('223 CAVIAR');
    expect(result.vehicles[0].interiorColor).toBe('EA20 BLACK');
  });

  it('does not guess arrival when multiple unrelated dates exist without context', () => {
    const source = [
      'Generated: 3/1/2026',
      'RX350 3/12/2026 Updated 3/2/2026 223 CAVIAR',
    ].join('\n');

    const result = parseAllocationSource(source);

    expect(result.errors).toHaveLength(0);
    expect(result.itemCount).toBe(1);
    expect(result.vehicles[0].code).toBe('RX350');
    expect(result.vehicles[0].arrival).toBe('TBD');
    expect(result.vehicles[0].color).toBe('223 CAVIAR');
  });

  it('parses Toyota District Manager Allocation PDF extracted format', () => {
    const source = [
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
    ].join('\n');

    const result = parseAllocationSource(source);

    expect(result.errors).toHaveLength(0);
    expect(result.reportDate).toBe('2026-02-19');

    const tx350 = result.vehicles.find((v) => v.code === 'TX350');
    const tx500h = result.vehicles.find((v) => v.code === 'TX500H');
    const rx350 = result.vehicles.find((v) => v.code === 'RX350');

    expect(tx350).toBeTruthy();
    expect(tx500h).toBeTruthy();
    expect(rx350).toBeTruthy();

    expect(tx350!.arrival).toBe('2026-04-02');
    expect(tx350!.color).toBe('223 CAVIAR');
    expect(tx350!.interiorColor).toBe('01');
    expect(tx350!.bos).toBe('Y');
    expect(tx350!.quantity).toBe(1);

    expect(tx500h!.arrival).toBe('2026-03-27');
    expect(tx500h!.color).toBe('223 CAVIAR');
    expect(tx500h!.interiorColor).toBe('20');
    expect(tx500h!.bos).toBe('Y');
    expect(tx500h!.quantity).toBe(1);

    expect(rx350!.arrival).toBe('2026-03-26');
    expect(rx350!.color).toBe('1L1 CLOUDBURST GRAY');
    expect(rx350!.interiorColor).toBe('21');
    expect(rx350!.bos).toBe('Y');
    expect(rx350!.quantity).toBe(1);
  });

  it('ignores Toyota DM metadata lines without warning noise', () => {
    const source = [
      '3/5/2026 Toyota District Manager Allocation Application',
      '04:21:19 PM',
      'District:06',
      'Allocation#: 031',
      'Dealer/Sequence Number Order',
      'Dealer: 64506-PRIORITY LEXUS VIRGNA BCH',
      '2 031 9353F TS14I127 7 Y 01J9-01 02045 Y BI CC CP TP G4 P9 Z1 2T 59 04-11',
      '( TX 350 AWD TX 350 AWD )',
      '( CELESTIAL SILVER METALLIC )',
    ].join('\n');

    const result = parseAllocationSource(source);

    expect(result.errors).toHaveLength(0);
    expect(result.itemCount).toBe(1);
    expect(result.warnings).toHaveLength(0);
    expect(result.vehicles[0].code).toBe('TX350');
    expect(result.vehicles[0].arrival).toBe('2026-04-11');
    expect(result.vehicles[0].bos).toBe('Y');
  });
});

describe('groupArrivalBucket', () => {
  it('returns unscheduled for unknown values', () => {
    expect(groupArrivalBucket('TBD')).toBe('UNSCHEDULED');
  });

  it('returns normalized bucket labels for parseable dates', () => {
    const now = new Date();
    const plusFive = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
    const label = groupArrivalBucket(plusFive.toISOString().slice(0, 10));
    expect(label).toBe('ARRIVING ≤ 7 DAYS');
  });
});
