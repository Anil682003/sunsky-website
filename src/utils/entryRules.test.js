import { describe, it, expect } from 'vitest';

import { entryOf, isEntry, appliedSummary, LAST_MINUTE, ALL_INCLUSIVE } from './entryRules';

/**
 * UI-20 (Master §12B.2). Last Minute and All Inclusive are doors that carry a default with them,
 * and the default gives way to anything the traveller chose.
 */

describe('entryOf', () => {
  it('reads the slug a homepage card carries', () => {
    // The card slug is hyphenated; the API wants underscores. The same normalisation as the
    // server's own entryOf, or the two disagree about what the traveller walked through.
    expect(entryOf('last-minute')).toBe(LAST_MINUTE);
    expect(entryOf('all-inclusive')).toBe(ALL_INCLUSIVE);
    expect(entryOf('last_minute')).toBe(LAST_MINUTE);
    expect(entryOf('  All-Inclusive  ')).toBe(ALL_INCLUSIVE);
  });

  it('is a closed list: every other type changes nothing', () => {
    // "Last Minute Deals" is a type someone named, not this entry. Applying a 42-day window to
    // it would quietly hide the holidays they came to look at.
    expect(entryOf('last-minute-deals')).toBeNull();
    expect(entryOf('zonvakanties')).toBeNull();
    expect(entryOf('all inclusive')).toBeNull();   // a space is not a hyphen
    expect(entryOf('')).toBeNull();
    expect(entryOf(null)).toBeNull();
    expect(entryOf(undefined)).toBeNull();
  });

  it('isEntry agrees with it', () => {
    expect(isEntry('last-minute')).toBe(true);
    expect(isEntry('faq')).toBe(false);
  });
});

describe('appliedSummary', () => {
  it('reports the Last Minute window the server actually applied', () => {
    expect(appliedSummary({ entry: 'last_minute', window: { from: '2026-10-16', to: '2026-11-27' } }))
      .toEqual({ entry: LAST_MINUTE, from: '2026-10-16', to: '2026-11-27' });
  });

  it('reports the All Inclusive boards it applied', () => {
    expect(appliedSummary({ entry: 'all_inclusive', boards: ['ai', 'uai'] }))
      .toEqual({ entry: ALL_INCLUSIVE, boards: ['AI', 'UAI'] });
  });

  it('nothing applied means nothing to announce', () => {
    // The usual case once the traveller has chosen: their dates or meal plan stood, so the
    // summary says nothing rather than claiming a default is in force.
    expect(appliedSummary(null)).toBeNull();
    expect(appliedSummary(undefined)).toBeNull();
    expect(appliedSummary({})).toBeNull();
    expect(appliedSummary({ entry: 'zonvakanties' })).toBeNull();
  });

  it('a half-built window is not announced', () => {
    // "From 16 October to —" tells the traveller a range is in force without saying what it is.
    expect(appliedSummary({ entry: 'last_minute', window: { from: '2026-10-16' } })).toBeNull();
    expect(appliedSummary({ entry: 'last_minute' })).toBeNull();
    expect(appliedSummary({ entry: 'last_minute', window: { from: 'soon', to: 'later' } })).toBeNull();
  });

  it('an empty board list is not announced either', () => {
    expect(appliedSummary({ entry: 'all_inclusive', boards: [] })).toBeNull();
    expect(appliedSummary({ entry: 'all_inclusive' })).toBeNull();
  });

  it('takes the date part of a full timestamp', () => {
    expect(appliedSummary({ entry: 'last_minute', window: { from: '2026-10-16T00:00:00Z', to: '2026-11-27T23:59:59Z' } }))
      .toEqual({ entry: LAST_MINUTE, from: '2026-10-16', to: '2026-11-27' });
  });
});
