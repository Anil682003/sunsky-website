import { describe, it, expect } from 'vitest';
import { computeDeposit, depositKind, tripStartDate, DEFAULT_PRICING } from './checkoutPricing';

// The same cases the server's deposit.service.test.js runs against its computeDeposit: the two
// must give the same answer or the trip page promises one deposit and the checkout charges another.
const TODAY = '2026-11-10';
const cfg = (over = {}) => ({
  deposit: { ...DEFAULT_PRICING.deposit, enabled: true, percent: 40, balanceDueDaysBeforeDeparture: 42, ...over },
});

describe('computeDeposit (mirror of the server)', () => {
  it('is off by default', () => {
    expect(computeDeposit(DEFAULT_PRICING, 1000, '2027-09-01', { today: TODAY })).toBeNull();
  });

  it('takes a percentage, rounded to whole euros, with the balance to the cent', () => {
    expect(computeDeposit(cfg(), 1026.04, '2027-09-01', { today: TODAY, kind: 'package' })).toEqual({
      amount: 410, balance: 616.04, balanceDueDate: '2027-07-21', percent: 40, type: 'percent',
    });
  });

  it('takes a fixed amount, or an amount per paying traveller, and never less than the minimum', () => {
    expect(computeDeposit(cfg({ type: 'fixed', fixedAmount: 250 }), 1000, '2027-09-01', { today: TODAY }).amount).toBe(250);
    expect(computeDeposit(cfg({ type: 'perPerson', perPersonAmount: 100 }), 1000, '2027-09-01', { today: TODAY, pax: 3 }).amount).toBe(300);
    const min = computeDeposit(cfg({ percent: 10, minAmount: 150 }), 1000, '2027-09-01', { today: TODAY });
    expect(min.amount).toBe(150);
    // Not the configured 10% any more: the share the minimum is of the total.
    expect(min.percent).toBe(15);
  });

  it('respects the trip kinds SUNSKY switched on (flight-only is off by default)', () => {
    expect(computeDeposit(cfg(), 1000, '2027-09-01', { today: TODAY, kind: 'flight' })).toBeNull();
    expect(computeDeposit(cfg(), 1000, '2027-09-01', { today: TODAY, kind: 'hotel' })).not.toBeNull();
    expect(computeDeposit(cfg({ products: { package: true, hotel: false, flight: true } }), 1000, '2027-09-01', { today: TODAY, kind: 'hotel' })).toBeNull();
  });

  it('is no deposit when it would be the whole price, nothing, or due already', () => {
    expect(computeDeposit(cfg({ type: 'fixed', fixedAmount: 1000 }), 1000, '2027-09-01', { today: TODAY })).toBeNull();
    expect(computeDeposit(cfg({ percent: 100 }), 1000, '2027-09-01', { today: TODAY })).toBeNull();
    expect(computeDeposit(cfg(), 0, '2027-09-01', { today: TODAY })).toBeNull();
    // 42 days before 22/12/2026 is today: a balance due today is due already.
    expect(computeDeposit(cfg(), 1000, '2026-12-22', { today: TODAY })).toBeNull();
    expect(computeDeposit(cfg(), 1000, '2026-12-23', { today: TODAY }).balanceDueDate).toBe('2026-11-11');
  });
});

describe('depositKind / tripStartDate', () => {
  it('names the trip the way the server does', () => {
    expect(depositKind({ flight: true, hotel: true })).toBe('package');
    expect(depositKind({ hotel: true })).toBe('hotel');
    expect(depositKind({ flight: true })).toBe('flight');
    expect(depositKind({})).toBeNull();
  });

  it('starts the trip on its earliest date, whatever shape the dates come in', () => {
    expect(tripStartDate('2027-09-02', '2027-09-01T22:15:00', null, undefined, 'soon')).toBe('2027-09-01');
    expect(tripStartDate(null, '')).toBeNull();
  });
});
