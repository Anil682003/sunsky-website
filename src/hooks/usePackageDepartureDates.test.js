// Departure dates the calendar is allowed to grey (UI-01 / Ch1 §7, §9A).
//
// Every test here is really the same test: greying a day is a claim we must be able to prove.
// The interesting cases are all the ways the answer fails to prove it.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import {
  usePackageDepartureDates,
  dateWindows,
  mergeDepartureDates,
  makeIsUnavailable,
  departureSummary,
  MAX_DESTINATIONS,
  WINDOW_DAYS,
} from './usePackageDepartureDates';

const get = vi.fn();
vi.mock('../services/axiosInstance', () => ({ default: { get: (...a) => get(...a) } }));

const ok = (dates, extra = {}) => ({
  data: {
    success: true,
    arrivals: { AYT: { status: 'FEASIBLE', trips: 3 } },
    departureDates: dates.map((date) => ({ date, fromPrice: 380, currency: 'EUR' })),
    ...extra,
  },
});

describe('splitting the question into windows the endpoint accepts', () => {
  it('asks one window when the range fits', () => {
    expect(dateWindows('2026-11-01', '2026-11-30')).toEqual([{ from: '2026-11-01', to: '2026-11-30' }]);
  });

  it('splits a longer range and leaves no gap or overlap between windows', () => {
    const w = dateWindows('2026-11-01', '2027-01-15');
    expect(w.length).toBeGreaterThan(1);
    expect(w[0].from).toBe('2026-11-01');
    expect(w[w.length - 1].to).toBe('2027-01-15');
    for (let i = 1; i < w.length; i += 1) {
      const prevEnd = new Date(`${w[i - 1].to}T00:00:00Z`);
      const thisStart = new Date(`${w[i].from}T00:00:00Z`);
      expect((thisStart - prevEnd) / 86400000).toBe(1);
    }
  });

  it('never asks for more days than the endpoint allows', () => {
    for (const w of dateWindows('2026-11-01', '2027-06-30')) {
      const days = (new Date(`${w.to}T00:00:00Z`) - new Date(`${w.from}T00:00:00Z`)) / 86400000 + 1;
      expect(days).toBeLessThanOrEqual(WINDOW_DAYS);
    }
  });

  it('asks nothing for an empty or reversed range', () => {
    expect(dateWindows('2026-11-10', '2026-11-01')).toEqual([]);
    expect(dateWindows(null, '2026-11-01')).toEqual([]);
  });
});

describe('what counts as proof that a day cannot fly', () => {
  it('unions the flyable dates across windows', () => {
    const d = mergeDepartureDates([
      { departureDates: [{ date: '2026-11-03' }], arrivals: {} },
      { departureDates: [{ date: '2026-12-02' }], arrivals: {} },
    ]);
    expect([...d].sort()).toEqual(['2026-11-03', '2026-12-02']);
  });

  it('a successful answer with no dates is a real answer: nothing flies', () => {
    expect(mergeDepartureDates([{ departureDates: [], arrivals: {} }])).toEqual(new Set());
  });

  it('refuses to judge when any arrival airport is UNKNOWN', () => {
    // NO_RETURN_FARES means the cache cannot see return fares at all, so the flyable days are
    // missing from the answer rather than absent from reality. Greying on it is a false claim.
    expect(mergeDepartureDates([{
      departureDates: [{ date: '2026-11-03' }],
      arrivals: { AYT: { status: 'FEASIBLE' }, ADB: { status: 'UNKNOWN', reason: 'NO_RETURN_FARES' } },
    }])).toBeNull();
  });

  it('refuses to judge a truncated answer', () => {
    expect(mergeDepartureDates([{ truncated: true, departureDates: [{ date: '2026-11-03' }], arrivals: {} }])).toBeNull();
  });

  it('one unusable window poisons the whole union', () => {
    // Otherwise the month we could not read would be greyed wholesale.
    expect(mergeDepartureDates([
      { departureDates: [{ date: '2026-11-03' }], arrivals: {} },
      { truncated: true, departureDates: [], arrivals: {} },
    ])).toBeNull();
  });
});

describe('the predicate the calendar asks', () => {
  it('greys a day with no flight and leaves a flyable one alone', () => {
    const isUnavailable = makeIsUnavailable(new Set(['2026-11-03']), 0);
    expect(isUnavailable('2026-11-03')).toBe(false);
    expect(isUnavailable('2026-11-04')).toBe(true);
  });

  it('with flexible dates, a day counts as flyable when any day in its window is', () => {
    // ±2 and a flight on the 5th: the 3rd through the 7th all lead to a real search result,
    // so greying them would contradict the search the traveller is about to run.
    const isUnavailable = makeIsUnavailable(new Set(['2026-11-05']), 2);
    expect(isUnavailable('2026-11-03')).toBe(false);
    expect(isUnavailable('2026-11-07')).toBe(false);
    expect(isUnavailable('2026-11-02')).toBe(true);
    expect(isUnavailable('2026-11-08')).toBe(true);
  });

  it('greys nothing at all when the dates are unknown', () => {
    expect(makeIsUnavailable(null, 0)).toBeNull();
    expect(makeIsUnavailable(null, 3)).toBeNull();
  });

  it('never greys a day outside the window we actually asked about', () => {
    // We ask a few months ahead, not the whole year. Paging the calendar to next summer must
    // not grey it on the strength of an answer about November.
    const isUnavailable = makeIsUnavailable(new Set(['2026-11-05']), 0, { from: '2026-11-01', to: '2026-11-30' });
    expect(isUnavailable('2026-11-06')).toBe(true);
    expect(isUnavailable('2027-07-14')).toBe(false);
    expect(isUnavailable('2026-10-31')).toBe(false);
  });
});

describe('asking the endpoint', () => {
  beforeEach(() => get.mockReset());

  it('asks with hotel destination codes, which is what the search already has', async () => {
    // This used to assert the opposite. The destinations branch carried no dates until the cache
    // team added departureDates to it (16 Oct 2026), so the hook had to turn destinations into
    // arrival airports first and ask that way. One question does it now.
    get.mockResolvedValue(ok(['2026-11-03']));
    const { result } = renderHook(() => usePackageDepartureDates({
      enabled: true, destinations: ['AYT', 'GZP'], from: '2026-11-01', to: '2026-11-30', adults: 2, children: 0,
    }));
    await waitFor(() => expect(result.current.state).toBe('ok'));
    const [, opts] = get.mock.calls[0];
    expect(opts.params.destinations).toBe('AYT,GZP');
    expect(opts.params.arrivals).toBeUndefined();
    expect([...result.current.dates]).toEqual(['2026-11-03']);
  });

  it('one hotel asks about itself, so the dates match that hotel and not its whole destination', async () => {
    // hotelCode makes the server narrow to the arrival airports whose GeoData scope covers this
    // hotel. Without it a hotel served by only one of its destination's airports would be judged
    // on flights it cannot actually use.
    get.mockResolvedValue(ok(['2026-11-03']));
    const { result } = renderHook(() => usePackageDepartureDates({
      enabled: true, destinations: ['AYT'], hotelCode: '165406',
      from: '2026-11-01', to: '2026-11-30', adults: 2, children: 0,
    }));
    await waitFor(() => expect(result.current.state).toBe('ok'));
    const [, opts] = get.mock.calls[0];
    expect(opts.params.hotelCode).toBe('165406');
  });

  it('asks one request per window and merges them', async () => {
    get.mockResolvedValue(ok(['2026-11-03']));
    const { result } = renderHook(() => usePackageDepartureDates({
      enabled: true, destinations: ['AYT'], from: '2026-11-01', to: '2027-01-15', adults: 2, children: 0,
    }));
    await waitFor(() => expect(result.current.state).toBe('ok'));
    expect(get.mock.calls.length).toBe(dateWindows('2026-11-01', '2027-01-15').length);
  });

  it('a refused answer greys nothing', async () => {
    // The server answered but would not judge. Same catch branch as a dropped connection, and
    // it exercises it without handing the runner a bare rejected promise to complain about.
    get.mockResolvedValue({ data: { success: false, message: 'index unavailable' } });
    const { result } = renderHook(() => usePackageDepartureDates({
      enabled: true, destinations: ['AYT'], from: '2026-11-01', to: '2026-11-30', adults: 2, children: 0,
    }));
    await waitFor(() => expect(result.current.state).toBe('error'));
    expect(result.current.dates).toBeNull();
    expect(makeIsUnavailable(result.current.dates, 0)).toBeNull();
  });

  it('a dropped connection greys nothing', async () => {
    get.mockImplementation((url) => (String(url).includes('/feasibility')
      ? Promise.reject(new Error('down'))
      : Promise.resolve({ data: {} })));
    const { result } = renderHook(() => usePackageDepartureDates({
      enabled: true, destinations: ['AYT'], from: '2026-11-01', to: '2026-11-30', adults: 2, children: 0,
    }));
    await waitFor(() => expect(get).toHaveBeenCalled());
    await new Promise((r) => { setTimeout(r, 100); });
    expect(result.current.dates).toBeNull();
    expect(result.current.state).toBe('error');
  });

  it('asks nothing, and greys nothing, for a search too wide to judge', async () => {
    // Sixty-one destinations cannot be asked in one question, and an answer about sixty of them
    // would hide days that fly to the sixty-first. The ceiling used to be ten ARRIVAL AIRPORTS,
    // which a few countries passed easily, so wide searches greyed nothing at all.
    const many = Array.from({ length: MAX_DESTINATIONS + 1 }, (_, i) => `A${i}`);
    const { result } = renderHook(() => usePackageDepartureDates({
      enabled: true, destinations: many, from: '2026-11-01', to: '2026-11-30', adults: 2, children: 0,
    }));
    expect(result.current.state).toBe('too-wide');
    expect(result.current.dates).toBeNull();
    expect(get).not.toHaveBeenCalled();
  });

  it('asks nothing when the product is not Flight + Hotel', async () => {
    const { result } = renderHook(() => usePackageDepartureDates({
      enabled: false, arrivals: ['AYT'], from: '2026-11-01', to: '2026-11-30', adults: 2, children: 0,
    }));
    expect(result.current.state).toBe('idle');
    expect(get).not.toHaveBeenCalled();
  });

  it('an UNKNOWN arrival leaves the calendar untouched even though dates came back', async () => {
    get.mockResolvedValue(ok(['2026-11-03'], {
      arrivals: { AYT: { status: 'FEASIBLE' }, ADB: { status: 'UNKNOWN', reason: 'NO_RETURN_FARES' } },
    }));
    const { result } = renderHook(() => usePackageDepartureDates({
      enabled: true, destinations: ['AYT', 'ADB'], from: '2026-11-01', to: '2026-11-30', adults: 2, children: 0,
    }));
    await waitFor(() => expect(result.current.state).toBe('ok'));
    expect(result.current.dates).toBeNull();
  });

  it('carries the party and trip length into the question', async () => {
    get.mockResolvedValue(ok([]));
    const { result } = renderHook(() => usePackageDepartureDates({
      enabled: true, destinations: ['AYT'], from: '2026-11-01', to: '2026-11-30',
      adults: 3, children: 1, childAges: '8', travelDays: 8, origins: ['BRU'],
    }));
    await waitFor(() => expect(result.current.state).toBe('ok'));
    const [, opts] = get.mock.calls[0];
    expect(opts.params).toMatchObject({ adults: 3, children: 1, childAges: '8', travelDays: '8', origins: 'BRU' });
  });
});

describe('departureSummary', () => {
  it('names the first day that flies and how many do', () => {
    const s = departureSummary(new Set(['2026-12-02', '2026-11-03', '2026-11-20']));
    expect(s).toEqual({ earliest: '2026-11-03', count: 3 });
  });

  it('one flyable day in six months is still an answer', () => {
    // The case the spec names: NRN with a single flight. The calendar opens on that month and
    // says "1 possible departure date found".
    expect(departureSummary(new Set(['2027-03-14']))).toEqual({ earliest: '2027-03-14', count: 1 });
  });

  it('says nothing when there is nothing to say', () => {
    // Unknown and "nothing flies" both return null: there is no earliest departure to print in
    // either case, and a calendar that announces an earliest date it does not have is worse
    // than one that stays quiet.
    expect(departureSummary(null)).toBeNull();
    expect(departureSummary(new Set())).toBeNull();
  });

  it('does not care what order the dates arrived in', () => {
    const a = departureSummary(new Set(['2026-11-03', '2026-12-02']));
    const b = departureSummary(new Set(['2026-12-02', '2026-11-03']));
    expect(a).toEqual(b);
  });
});
