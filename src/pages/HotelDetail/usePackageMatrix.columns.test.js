import { describe, it, expect } from 'vitest';
import { sevenColumns } from './usePackageMatrix';

const day = (departure) => ({ iso: departure, departure, price: 600, state: 'AVAILABLE' });
const dates = (r) => r.days.map((d) => `${d.departure}${d.filler ? '·NA' : ''}`);

// Comfort Aparthotel Marseille Prado, DUS, 4 days (Levent, 4 Nov 2026): no flight before 12 Mar.
const MARSEILLE = ['2027-03-12', '2027-03-26', '2027-05-14', '2027-05-21', '2027-06-04'].map(day);

describe('sevenColumns', () => {
  it('always seven columns, selected in the middle, earlier calendar days marked not available', () => {
    const r = sevenColumns(MARSEILLE, '2027-03-12', '2026-11-05');
    expect(dates(r)).toEqual([
      '2027-03-09·NA', '2027-03-10·NA', '2027-03-11·NA', '2027-03-12',
      '2027-03-26', '2027-05-14', '2027-05-21',
    ]);
    expect(r.next).toBe('2027-06-04');   // the hidden date stays one arrow away
    expect(r.prev).toBeNull();
  });

  it('after the last package date: the next calendar days, not available', () => {
    const r = sevenColumns(MARSEILLE, '2027-06-04', '2026-11-05');
    expect(dates(r)).toEqual([
      '2027-03-26', '2027-05-14', '2027-05-21', '2027-06-04',
      '2027-06-05·NA', '2027-06-06·NA', '2027-06-07·NA',
    ]);
    expect(r.prev).toBe('2027-03-12');
  });

  it('keeps skipping dates without a package (12 Mar → 26 Mar)', () => {
    const r = sevenColumns(MARSEILLE, '2027-05-14', '2026-11-05');
    expect(dates(r)).toEqual([
      '2027-03-11·NA', '2027-03-12', '2027-03-26', '2027-05-14',
      '2027-05-21', '2027-06-04', '2027-06-05·NA',
    ]);
  });

  it('selected tomorrow: first column, never a past day; the other side takes the columns', () => {
    const tomorrow = '2026-11-05';
    const daily = ['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12'].map(day);
    const r = sevenColumns(daily, tomorrow, tomorrow);
    expect(dates(r)).toEqual(['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11']);
    expect(r.next).toBe('2026-11-12');
  });

  it('daily flights: three either side, nothing filled', () => {
    const daily = Array.from({ length: 9 }, (_, i) => day(`2027-03-${String(10 + i).padStart(2, '0')}`));
    const r = sevenColumns(daily, '2027-03-14', '2026-11-05');
    expect(dates(r)).toEqual(['2027-03-11', '2027-03-12', '2027-03-13', '2027-03-14', '2027-03-15', '2027-03-16', '2027-03-17']);
    expect(r.prev).toBe('2027-03-10');
    expect(r.next).toBe('2027-03-18');
  });

  it('no package dates: nothing to show (the page explains instead)', () => {
    expect(sevenColumns([], '2027-03-12', '2026-11-05').days).toEqual([]);
  });
});
