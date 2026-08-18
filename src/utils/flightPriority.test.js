import { describe, it, expect } from 'vitest';
import { pickPriorityIndex, pickPriorityFlight, flightStops } from './flightPriority';

const F = (stops, totalPrice) => ({ stops, totalPrice });

describe('§23 flight priority (website mirror of the admin engine)', () => {
  it('picks the cheapest DIRECT over cheaper connections', () => {
    const flights = [F(2, 90), F(1, 120), F(0, 170), F(0, 210)];
    expect(pickPriorityIndex(flights)).toBe(2);          // the €170 direct, not the €90 2-stop
    expect(pickPriorityFlight(flights).totalPrice).toBe(170);
  });

  it('live BRU→AYT shape: a €924 2-stop must not beat the lone direct', () => {
    const flights = [F(2, 924.36), F(1, 1010), F(0, 1360)];
    expect(pickPriorityIndex(flights)).toBe(2);
  });

  it('no direct → cheapest 1-stop', () => {
    expect(pickPriorityIndex([F(2, 90), F(1, 150), F(1, 130)])).toBe(2);
  });

  it('only 2-stops → cheapest 2-stop', () => {
    expect(pickPriorityIndex([F(2, 300), F(2, 260)])).toBe(1);
  });

  it('derives stops from legs when no explicit stops', () => {
    expect(flightStops({ legs: [{}, {}] })).toBe(1);
    expect(pickPriorityIndex([{ legs: [{}, {}], totalPrice: 300 }, { legs: [{}], totalPrice: 400 }])).toBe(1);
  });

  it('empty / all-over-2-stops → 0 (always a valid index)', () => {
    expect(pickPriorityIndex([])).toBe(0);
    expect(pickPriorityIndex([F(3, 50), F(4, 40)])).toBe(0);
  });
});
