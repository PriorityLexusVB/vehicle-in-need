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
