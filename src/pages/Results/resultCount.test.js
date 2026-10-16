import { describe, it, expect } from 'vitest';

import { countState, SEARCHING, CALCULATING, COUNT } from './resultCount';

/**
 * UI-08. The count may print a number only when that number answers the question being asked.
 */

const pkg = (over) => countState({ transport: 'package', ...over });
const hotel = (over) => countState({ transport: 'hotel_only', ...over });

describe('before anything is in', () => {
  it('is searching, with no number', () => {
    expect(countState({ loading: true }).kind).toBe(SEARCHING);
    // Even with rows already on screen from the last search, loading wins: those rows are not
    // the answer to this question.
    expect(countState({ loading: true, loadedCount: 20, shownTotal: 400 }).value).toBeNull();
  });
});

describe('Flight + Hotel, where destinations answer one at a time', () => {
  it('does not state a total while groups are still answering', () => {
    // The running sum climbs as each destination replies. Printing it shows a precise figure
    // that is about to change, which is worse than showing none.
    expect(pkg({ pkgLoadingGroups: 2, loadedCount: 40 }).kind).toBe(CALCULATING);
    expect(pkg({ pkgLoadingGroups: 1, loadedCount: 40 }).value).toBeNull();
  });

  it('states it once every group is in', () => {
    const r = pkg({ pkgLoadingGroups: 0, shownTotal: 3842, loadedCount: 20 });
    expect(r.kind).toBe(COUNT);
    expect(r.value).toBe(3842);
    expect(r.approx).toBe(false);
  });

  it('a stated total is trusted even with groups outstanding', () => {
    // The API gave the number; the remaining groups only fill in rows. Waiting here would hold
    // back a figure we already have.
    const r = pkg({ pkgLoadingGroups: 3, shownTotal: 3842 });
    expect(r.kind).toBe(COUNT);
    expect(r.value).toBe(3842);
  });
});

describe('after a filter change', () => {
  it('shows the calculating state, not the previous filters\' total', () => {
    expect(hotel({ filtering: true, shownTotal: 3842, loadedCount: 20 }).kind).toBe(CALCULATING);
    expect(pkg({ filtering: true, shownTotal: 3842 }).kind).toBe(CALCULATING);
  });

  it('then the new total', () => {
    expect(hotel({ filtering: false, shownTotal: 624 })).toEqual({ kind: COUNT, value: 624, approx: false });
  });
});

describe('Hotel only, where the cache prices only what the page needs', () => {
  it('marks the count approximate when more pages exist and no total was stated', () => {
    // 20 loaded of an unknown number is a floor, not a total: "20+".
    expect(hotel({ shownTotal: null, loadedCount: 20, hasMore: true }))
      .toEqual({ kind: COUNT, value: 20, approx: true });
  });

  it('is exact when the list is all there is', () => {
    expect(hotel({ shownTotal: null, loadedCount: 17, hasMore: false }))
      .toEqual({ kind: COUNT, value: 17, approx: false });
  });

  it('a stated total is never dressed up as approximate', () => {
    // A random-order search prices every hotel, so the API states the real total. The "+" there
    // would understate a number we are certain of.
    expect(hotel({ shownTotal: 57, loadedCount: 20, hasMore: true }))
      .toEqual({ kind: COUNT, value: 57, approx: false });
  });
});

describe('edges', () => {
  it('zero is a real answer and is stated plainly', () => {
    expect(hotel({ shownTotal: 0, loadedCount: 0 })).toEqual({ kind: COUNT, value: 0, approx: false });
  });

  it('nothing loaded and nothing stated reads as zero, not as a missing number', () => {
    expect(hotel({ shownTotal: null, loadedCount: 0, hasMore: false }).value).toBe(0);
  });

  it('called with nothing does not throw', () => {
    expect(countState()).toEqual({ kind: COUNT, value: 0, approx: false });
  });

  it('hotel-only never waits on package groups', () => {
    // pkgLoadingGroups belongs to the package path; a stale non-zero must not freeze the
    // Hotel only count on "Calculating…".
    expect(hotel({ pkgLoadingGroups: 5, shownTotal: 57 }).kind).toBe(COUNT);
  });
});
