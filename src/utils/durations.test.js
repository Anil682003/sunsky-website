import { describe, it, expect } from 'vitest';
import {
  DURATION_BANDS, MAX_TRAVEL_DAYS, MAX_STAY_NIGHTS,
  bandByLabel, bandForNights, bandForTravelDays, daysInBand, daysToNights, nightsToDays,
  stayDaysToNights, stayNightsToDays, stayNights, stayDays, stayCheckOut,
  packageTravelDays, packageReturnDate, withinTravelDayLimit, withinStayNightLimit,
} from './durations';

describe('daysToNights / nightsToDays', () => {
  it('treats N days as N-1 nights (arrive day 1, leave day N)', () => {
    expect(daysToNights(7)).toBe(6);   // "7 days" is a 6-night stay
    expect(daysToNights(2)).toBe(1);
    expect(nightsToDays(6)).toBe(7);
    expect(nightsToDays(1)).toBe(2);
  });
  it('never goes below one night', () => {
    expect(daysToNights(1)).toBe(1);
    expect(daysToNights(0)).toBe(1);
  });
  it('round-trips', () => {
    for (const d of [2, 5, 7, 14, 28]) expect(nightsToDays(daysToNights(d))).toBe(d);
  });
});

describe('bandForNights', () => {
  it('puts a stay in the band whose label the home page would show (matched on days = nights+1)', () => {
    // Pick "6-10 days" on the home page → land on detail with nights=6, field still reads "6-10 days".
    expect(bandForNights(6).label).toBe('6-10 days');   // 7 days
    expect(bandForNights(3).label).toBe('2-5 days');    // 4 days
    expect(bandForNights(13).label).toBe('11-16 days'); // 14 days
    expect(bandForNights(20).label).toBe('17-24 days'); // 21 days
  });

  it('covers every band boundary (in nights)', () => {
    for (const b of DURATION_BANDS) {
      expect(bandForNights(daysToNights(b.minDays)).label).toBe(b.label);
      expect(bandForNights(daysToNights(b.maxDays)).label).toBe(b.label);
    }
  });

  it('never leaves the field with no label to show', () => {
    expect(bandForNights(1).label).toBe('2-5 days');       // 2 days — first band
    expect(bandForNights(400).label).toBe('25-29 days');   // above the last
    for (const junk of [null, undefined, 'seven', NaN, {}]) {
      expect(bandForNights(junk).label).toBe('6-10 days'); // the default week
    }
  });
});

describe('daysInBand', () => {
  it('offers each exact DAY length inside the band', () => {
    expect(daysInBand(bandByLabel('6-10 days'))).toEqual([6, 7, 8, 9, 10]);
    expect(daysInBand(bandByLabel('2-5 days'))).toEqual([2, 3, 4, 5]);
  });

  it('stops the top band at 29, the longest trip SUNSKY sells', () => {
    expect(daysInBand(bandByLabel('25-29 days'))).toEqual([25, 26, 27, 28, 29]);
  });

  it('offers nothing longer than 29 days anywhere', () => {
    const longest = Math.max(...DURATION_BANDS.flatMap((b) => daysInBand(b)));
    expect(longest).toBe(MAX_TRAVEL_DAYS);
    expect(longest).toBe(29);
  });

  it('always contains the band\'s own representative length', () => {
    for (const b of DURATION_BANDS) {
      expect(daysInBand(b)).toContain(b.days);
    }
  });

  it('survives a missing band', () => {
    expect(daysInBand(null)).toEqual([]);
  });
});

describe('bandByLabel', () => {
  it('round-trips every label', () => {
    for (const b of DURATION_BANDS) expect(bandByLabel(b.label)).toEqual(b);
  });

  // The label rides in the search URL, so every link already shared carries the old spelling.
  // Without the alias those searches would land in the default week band, silently changing
  // the trip length someone was sent.
  it('still understands the "25+ days" links already out there', () => {
    expect(bandByLabel('25+ days').label).toBe('25-29 days');
    expect(bandByLabel('25+ days').maxDays).toBe(29);
  });
  it('falls back to the week band on an unknown label', () => {
    expect(bandByLabel('nonsense').label).toBe('6-10 days');
  });
});

/* ── the two products count days differently (master spec 3.4) ── */

describe('the unqualified aliases are the HOTEL ONLY formulas', () => {
  // They stay exported because Hero, Results and the hotel page already import them. What must
  // not survive is the idea that they also describe a package.
  it('daysToNights / nightsToDays are stayDaysToNights / stayNightsToDays', () => {
    expect(daysToNights).toBe(stayDaysToNights);
    expect(nightsToDays).toBe(stayNightsToDays);
    expect(stayDaysToNights(8)).toBe(7);
    expect(stayNightsToDays(7)).toBe(8);
  });
});

describe('stayNights / stayDays / stayCheckOut (HOTEL ONLY)', () => {
  // The spec's worked example: 8 days from 25 Oct is check-out 1 Nov and 7 nights.
  it('counts the spec example', () => {
    expect(stayCheckOut('2026-10-25', 8)).toBe('2026-11-01');
    expect(stayNights('2026-10-25', '2026-11-01')).toBe(7);
    expect(stayDays('2026-10-25', '2026-11-01')).toBe(8);
  });

  it('round-trips a picked duration back to the same nights', () => {
    for (const days of [2, 5, 7, 14, 29]) {
      const out = stayCheckOut('2027-03-14', days);
      expect(stayDays('2027-03-14', out)).toBe(days);
      expect(stayNights('2027-03-14', out)).toBe(stayDaysToNights(days));
    }
  });

  // Parsed at local midnight, never through toISOString(): east of Greenwich a UTC reading lands
  // the answer a day early, which would quietly shorten a stay by a night.
  it('crosses a month, a year and a DST switch without losing a day', () => {
    expect(stayCheckOut('2026-12-28', 8)).toBe('2027-01-04');
    expect(stayNights('2026-12-28', '2027-01-04')).toBe(7);
    // Europe/Brussels puts the clocks forward on 29 March 2026 and back on 25 October 2026.
    expect(stayNights('2026-03-27', '2026-03-31')).toBe(4);
    expect(stayNights('2026-10-23', '2026-10-27')).toBe(4);
    expect(stayCheckOut('2026-10-23', 5)).toBe('2026-10-27');
  });

  it('accepts a Date as well as an ISO string', () => {
    expect(stayNights(new Date(2026, 9, 25), new Date(2026, 10, 1))).toBe(7);
    expect(stayCheckOut(new Date(2026, 9, 25), 8)).toBe('2026-11-01');
  });

  it('refuses a stay nobody sleeps in, and anything unreadable', () => {
    expect(stayNights('2026-10-25', '2026-10-25')).toBeNull();   // zero nights is a broken search
    expect(stayNights('2026-10-25', '2026-10-24')).toBeNull();
    expect(stayDays('2026-10-25', '2026-10-25')).toBeNull();
    for (const junk of [null, undefined, '', 'next week', {}]) {
      expect(stayNights(junk, '2026-11-01')).toBeNull();
      expect(stayNights('2026-10-25', junk)).toBeNull();
      expect(stayCheckOut(junk, 8)).toBeNull();
    }
    expect(stayCheckOut('2026-10-25', 1)).toBeNull();            // a one-day "stay" has no night
  });
});

describe('packageTravelDays / packageReturnDate (PACKAGE)', () => {
  // Travel days run from the OUTBOUND DEPARTURE date to the RETURN DEPARTURE date, inclusive.
  it('counts departure date to departure date', () => {
    expect(packageTravelDays('2026-10-25', '2026-11-01')).toBe(8);
    expect(packageReturnDate('2026-10-25', 8)).toBe('2026-11-01');
    expect(packageTravelDays('2026-10-25', '2026-10-25')).toBe(1);  // out and back the same day
    expect(packageReturnDate('2026-10-25', 1)).toBe('2026-10-25');
  });

  it('round-trips every band length', () => {
    for (const b of DURATION_BANDS) {
      for (const days of daysInBand(b)) {
        expect(packageTravelDays('2027-05-02', packageReturnDate('2027-05-02', days))).toBe(days);
      }
    }
  });

  // THE BUG THIS SPLIT EXISTS FOR. A package's hotel nights are not its travel days minus one:
  // they come from the flight times, and a return flight before 04:00 checks the room out the
  // previous day (spec 3.4). So nothing here may be fed through the stay formulas, and nothing
  // here pretends to know the nights.
  it('says nothing about hotel nights', () => {
    const days = packageTravelDays('2026-10-25', '2026-11-01');
    expect(days).toBe(8);
    // An 8-day package can be 7 nights or 6. Only the API, holding the flight times, knows which.
    expect(stayDaysToNights(days)).toBe(7);   // what the old single formula would have claimed
    expect(typeof days).toBe('number');       // a count of days, never a count of nights
  });

  it('refuses a return before the outbound, and anything unreadable', () => {
    expect(packageTravelDays('2026-11-01', '2026-10-25')).toBeNull();
    for (const junk of [null, undefined, '', 'soon', {}]) {
      expect(packageTravelDays(junk, '2026-11-01')).toBeNull();
      expect(packageTravelDays('2026-10-25', junk)).toBeNull();
      expect(packageReturnDate(junk, 8)).toBeNull();
    }
    expect(packageReturnDate('2026-10-25', 0)).toBeNull();
  });
});

describe('29 days is the ceiling', () => {
  it('caps a HOTEL ONLY stay at 28 nights', () => {
    expect(MAX_STAY_NIGHTS).toBe(28);
    expect(MAX_STAY_NIGHTS).toBe(MAX_TRAVEL_DAYS - 1);
    expect(stayDaysToNights(MAX_TRAVEL_DAYS)).toBe(28);
    expect(stayNightsToDays(MAX_STAY_NIGHTS)).toBe(MAX_TRAVEL_DAYS);
    expect(withinStayNightLimit(28)).toBe(true);
    expect(withinStayNightLimit(29)).toBe(false);
    expect(withinStayNightLimit(0)).toBe(false);
  });

  it('caps a PACKAGE at 29 travel days', () => {
    expect(withinTravelDayLimit(29)).toBe(true);
    expect(withinTravelDayLimit(30)).toBe(false);
    expect(withinTravelDayLimit(0)).toBe(false);
    expect(withinTravelDayLimit('seven')).toBe(false);
    // The longest trip the picker can build stays inside the limit.
    expect(packageTravelDays('2026-10-25', packageReturnDate('2026-10-25', MAX_TRAVEL_DAYS)))
      .toBe(MAX_TRAVEL_DAYS);
    expect(stayNights('2026-10-25', stayCheckOut('2026-10-25', MAX_TRAVEL_DAYS)))
      .toBe(MAX_STAY_NIGHTS);
  });
});

describe('bandForTravelDays', () => {
  it('matches a day count straight onto the bands, the way a package is banded', () => {
    expect(bandForTravelDays(8).label).toBe('6-10 days');
    expect(bandForTravelDays(2).label).toBe('2-5 days');
    expect(bandForTravelDays(29).label).toBe('25-29 days');
    for (const b of DURATION_BANDS) {
      expect(bandForTravelDays(b.minDays).label).toBe(b.label);
      expect(bandForTravelDays(b.maxDays).label).toBe(b.label);
      expect(bandForTravelDays(b.days).label).toBe(b.label);
    }
  });

  it('agrees with bandForNights only through the HOTEL ONLY conversion', () => {
    expect(bandForTravelDays(7).label).toBe(bandForNights(6).label);
    // Same number, different question: 7 nights is an 8-day stay, and 7 travel days is 7 days.
    expect(bandForNights(7).label).toBe(bandForTravelDays(8).label);
  });

  it('never leaves the field with no label to show', () => {
    expect(bandForTravelDays(1).label).toBe('2-5 days');
    expect(bandForTravelDays(400).label).toBe('25-29 days');
    for (const junk of [null, undefined, '', 'seven', NaN, {}]) {
      expect(bandForTravelDays(junk).label).toBe('6-10 days');
    }
  });
});
