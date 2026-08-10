import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadPax, savePax, clearPax, purgePax, hasPaxParams, agesForCheckIn, PAX_TTL_MS } from './paxStore';

const KEY = 'sunsky.pax';
const raw = () => JSON.parse(localStorage.getItem(KEY) || 'null');

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.useRealTimers(); });

describe('savePax / loadPax', () => {
  it('gives back the party it was handed', () => {
    savePax({ adults: '3', children: '2', rooms: '2', childAges: '8,11', childDobs: '2017-04-02,2014-09-30' });
    expect(loadPax()).toEqual({
      adults: '3', children: '2', rooms: '2',
      childAges: '8,11', childDobs: '2017-04-02,2014-09-30',
    });
  });

  it('is empty before anything is saved', () => {
    expect(loadPax()).toBeNull();
  });

  it('pads a short date list so every child keeps their own row', () => {
    // Two children, one birthday: the second child must come back as a blank slot rather
    // than the first child's date sliding into their place.
    savePax({ adults: '2', children: '2', rooms: '1', childAges: '9', childDobs: '2016-01-01' });
    expect(loadPax().childDobs).toBe('2016-01-01,');
    expect(loadPax().childAges).toBe('9,8');   // 8 = the pages' CHILD_AGE_DEFAULT
  });

  it('drops the dates when there are no children', () => {
    savePax({ adults: '2', children: '0', rooms: '1', childAges: '8', childDobs: '2016-01-01' });
    expect(loadPax()).toEqual({ adults: '2', children: '0', rooms: '1', childAges: '', childDobs: '' });
  });

  it('refuses a party that makes no sense, leaving what was stored alone', () => {
    savePax({ adults: '2', children: '1', rooms: '1', childAges: '8', childDobs: '2016-01-01' });
    savePax({ adults: '0', children: '1', rooms: '1' });          // nobody to travel
    savePax({ adults: 'abc', children: '1', rooms: '1' });        // not a number
    expect(loadPax().adults).toBe('2');
    expect(loadPax().childDobs).toBe('2016-01-01');
  });
});

describe('the 48-hour window', () => {
  it('restores a party saved just under 48 hours ago', () => {
    savePax({ adults: '2', children: '1', rooms: '1', childAges: '8', childDobs: '2016-01-01' });
    vi.setSystemTime(Date.now() + PAX_TTL_MS - 60_000);
    expect(loadPax()?.childDobs).toBe('2016-01-01');
  });

  it('restores nothing once 48 hours have passed', () => {
    savePax({ adults: '2', children: '1', rooms: '1', childAges: '8', childDobs: '2016-01-01' });
    vi.setSystemTime(Date.now() + PAX_TTL_MS + 1000);
    expect(loadPax()).toBeNull();
  });

  it('DELETES the stored dates of birth rather than merely ignoring them', () => {
    savePax({ adults: '2', children: '1', rooms: '1', childAges: '8', childDobs: '2016-01-01' });
    expect(raw().childDobs).toBe('2016-01-01');
    vi.setSystemTime(Date.now() + PAX_TTL_MS + 1000);
    purgePax();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('restarts the window on each save, so it measures time away from the site', () => {
    savePax({ adults: '2', children: '1', rooms: '1', childAges: '8', childDobs: '2016-01-01' });
    vi.setSystemTime(Date.now() + PAX_TTL_MS - 60_000);
    savePax({ adults: '3', children: '1', rooms: '1', childAges: '8', childDobs: '2016-01-01' });
    vi.setSystemTime(Date.now() + PAX_TTL_MS - 60_000);
    expect(loadPax()?.adults).toBe('3');
  });

  it('treats a record with no timestamp as expired', () => {
    // Predates this format: its age cannot be established, and keeping personal data on a
    // guess is the wrong way round.
    localStorage.setItem(KEY, JSON.stringify({ adults: '2', children: '1', childDobs: '2016-01-01' }));
    expect(loadPax()).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('survives unparseable storage', () => {
    localStorage.setItem(KEY, 'not json');
    expect(loadPax()).toBeNull();
  });
});

describe('hasPaxParams', () => {
  it('is true when the link states any part of the occupancy', () => {
    expect(hasPaxParams(new URLSearchParams('adults=2'))).toBe(true);
    expect(hasPaxParams(new URLSearchParams('rooms=2'))).toBe(true);
    expect(hasPaxParams(new URLSearchParams('children=0'))).toBe(true);
  });

  it('is false for a link that says nothing about who is travelling', () => {
    expect(hasPaxParams(new URLSearchParams('checkIn=2026-09-01&destination=ANT'))).toBe(false);
    expect(hasPaxParams(new URLSearchParams(''))).toBe(false);
  });
});

describe('agesForCheckIn', () => {
  it('ages the child against the departure being searched, not the day they were saved', () => {
    const pax = { children: '1', childDobs: '2016-06-01', childAges: '8' };
    expect(agesForCheckIn(pax, '2026-05-31')).toBe('9');
    expect(agesForCheckIn(pax, '2026-06-01')).toBe('10');   // birthday lands before check-in
  });

  it('falls back to the stored age where no birthday was ever given', () => {
    expect(agesForCheckIn({ children: '2', childDobs: ',2016-06-01', childAges: '5,8' }, '2026-07-01')).toBe('5,10');
  });

  it('is empty when nobody under 18 is travelling', () => {
    expect(agesForCheckIn({ children: '0' }, '2026-07-01')).toBe('');
  });
});

describe('clearPax', () => {
  it('forgets the party outright', () => {
    savePax({ adults: '2', children: '1', rooms: '1', childAges: '8', childDobs: '2016-01-01' });
    clearPax();
    expect(loadPax()).toBeNull();
  });
});
