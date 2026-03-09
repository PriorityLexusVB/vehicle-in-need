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
    expect(result.summary.value).toBeGreaterThan(0);
    expect(result.summary.hybridMix).toBe(50);
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

  it('extracts source code, interior, BOS, factory accessories, and PPOs from DM-style rows', () => {
    const source = '9704F RX500H INT 20 BOS Y FACTORY ACCY: BI CP FT PPOs: 2T 3J 59';
    const result = parseAllocationSource(source);

    expect(result.errors).toHaveLength(0);
    expect(result.vehicles).toHaveLength(1);
    expect(result.vehicles[0].sourceCode).toBe('9704F');
    expect(result.vehicles[0].model).toBe('RX500H');
    expect(result.vehicles[0].interior).toBe('20');
    expect(result.vehicles[0].bos).toBe('Y');
    expect(result.vehicles[0].factoryAccessories).toBe('BI CP FT');
    expect(result.vehicles[0].postProductionOptions).toBe('2T 3J 59');
  });

  it('marks timelineType as port only when port context is explicit', () => {
    const source = 'AT PORT 3/21 RX350';
    const result = parseAllocationSource(source);

    expect(result.errors).toHaveLength(0);
    expect(result.vehicles[0].timelineType).toBe('port');
    expect(result.vehicles[0].arrival).toBe('2026-03-21');
  });

  it('keeps BOS as TBD when only PI flag is present', () => {
    const source = 'RX350 PI Y ETA 3/12';
    const result = parseAllocationSource(source);

    expect(result.errors).toHaveLength(0);
    expect(result.vehicles[0].bos).toBe('TBD');
  });

  it('extracts source code and option fields from adjacent wrapped lines', () => {
    const source = [
      '9706 F INT 20 FACTORY ACCY: BI CC CP TP PPOs: 1S 2T 59 87 DF Z1 BOS Y',
      'GX550',
    ].join('\n');

    const result = parseAllocationSource(source);

    expect(result.errors).toHaveLength(0);
    expect(result.vehicles).toHaveLength(1);
    expect(result.vehicles[0].code).toBe('GX550');
    expect(result.vehicles[0].sourceCode).toBe('9706F');
    expect(result.vehicles[0].interior).toBe('20');
    expect(result.vehicles[0].factoryAccessories).toBe('BI CC CP TP');
    expect(result.vehicles[0].postProductionOptions).toBe('1S 2T 59 87 DF Z1');
  });

  it('parses live-style multiline extracted rows with split model token and month-day dates', () => {
    const source = [
      '9704 F INT 20 FACTORY ACCY: KG MF WL PPOs: 1S 2T 59 DF GN LOC DM Note 03-23 BOS Y',
      'TX 350',
      '9443F INT LA20 FACTORY ACCY: KG WL PPOs: 2T 3J 59 DF EG 02-24 BOS N',
      'GX550',
    ].join('\n');

    const result = parseAllocationSource(source);

    expect(result.errors).toHaveLength(0);
    expect(result.itemCount).toBe(2);
    expect(result.vehicles[0].sourceCode).toBe('9704F');
    expect(result.vehicles[0].code).toBe('TX350');
    expect(result.vehicles[0].arrival).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.vehicles[0].factoryAccessories).toBe('KG MF WL');
    expect(result.vehicles[0].postProductionOptions).toBe('1S 2T 59 DF GN');
    expect(result.vehicles[0].bos).toBe('Y');
    expect(result.vehicles[1].sourceCode).toBe('9443F');
    expect(result.vehicles[1].code).toBe('GX550');
    expect(result.vehicles[1].interior).toBe('LA20');
    expect(result.vehicles[1].bos).toBe('N');
  });

  it('parses when model token is split across newline boundaries', () => {
    const source = [
      '9706-F INT 20 FACTORY ACCY: KG MF WL PPOs: 1S 2T 59 DF GN BOS Y',
      'TX',
      '350 03-23',
    ].join('\n');

    const result = parseAllocationSource(source);

    expect(result.errors).toHaveLength(0);
    expect(result.itemCount).toBe(1);
    expect(result.vehicles[0].code).toBe('TX350');
    expect(result.vehicles[0].sourceCode).toBe('9706F');
    expect(result.vehicles[0].bos).toBe('Y');
    expect(result.vehicles[0].arrival).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('parses PDF-shaped multiline rows with wrapped fields and source codes', () => {
    const source = [
      '9353F INT EA26 FACTORY ACCY: BI CC',
      'CP PPOs: 1S 2T 59 DF LOC 03-12 BOS Y',
      'GX',
      '550 CAVIAR / BLACK',
      '9443F INT LA20 FACTORY ACCY: KG',
      'WL PPOs: 3J 59 PORT 03-18 BOS N',
      'TX',
      '350 CLOUD BURST / BLACK',
      '9706F INT 20 LOC 03-23 BOS Y',
      'TX 350',
    ].join('\n');

    const result = parseAllocationSource(source);

    expect(result.errors).toHaveLength(0);
    expect(result.itemCount).toBe(3);

    expect(result.vehicles[0].sourceCode).toBe('9353F');
    expect(result.vehicles[0].code).toBe('GX550');
    expect(result.vehicles[0].arrival).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.vehicles[0].bos).toBe('Y');

    expect(result.vehicles[1].sourceCode).toBe('9443F');
    expect(result.vehicles[1].code).toBe('TX350');
    expect(result.vehicles[1].timelineType).toBe('port');
    expect(result.vehicles[1].arrival).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.vehicles[1].bos).toBe('N');

    expect(result.vehicles[2].sourceCode).toBe('9706F');
    expect(result.vehicles[2].code).toBe('TX350');
    expect(result.vehicles[2].bos).toBe('Y');
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
