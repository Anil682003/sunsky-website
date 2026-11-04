import { describe, it, expect } from 'vitest';
import { transferAirport } from './transferAirport';

// 4 Nov 2026: a DUS→SAW Istanbul package was offered, priced and booked a shuttle from IST
// (Istanbul Airport, the destination's code), 80 km from where the plane landed.

const DUS_SAW = [
  { from: 'DUS', to: 'SAW', departure: '2027-06-06T13:10:00', arrival: '2027-06-06T17:25:00', airline: 'VF' },
  { from: 'SAW', to: 'DUS', departure: '2027-06-12T09:25:00', arrival: '2027-06-12T11:55:00', airline: 'VF' },
];

describe('the airport a transfer starts from', () => {
  it('is where the outbound flight lands, not the destination code', () => {
    expect(transferAirport({ outTo: 'SAW', legs: DUS_SAW, tripType: 'roundtrip', destination: 'IST' })).toBe('SAW');
  });

  it('reads the legs when the hand-over has no outTo (round trip split down the middle)', () => {
    expect(transferAirport({ legs: DUS_SAW, tripType: 'roundtrip', destination: 'IST' })).toBe('SAW');
  });

  it('takes the LAST outbound leg of a connection', () => {
    const legs = [
      { from: 'BRU', to: 'IST' }, { from: 'IST', to: 'BJV' },
      { from: 'BJV', to: 'IST' }, { from: 'IST', to: 'BRU' },
    ];
    expect(transferAirport({ legs, tripType: 'roundtrip', destination: 'BOD' })).toBe('BJV');
  });

  it('prefers outTo over a down-the-middle split that would land on a return connection', () => {
    // 1 leg out, 2 legs back: the middle split would call AYT→IST the last outbound leg.
    const legs = [{ from: 'BRU', to: 'AYT' }, { from: 'AYT', to: 'IST' }, { from: 'IST', to: 'BRU' }];
    expect(transferAirport({ outTo: 'AYT', legs, tripType: 'roundtrip', destination: 'AYT' })).toBe('AYT');
  });

  it('keeps only a three-letter code from outTo ("SAW Istanbul" → SAW)', () => {
    expect(transferAirport({ outTo: 'saw Istanbul', destination: 'IST' })).toBe('SAW');
    expect(transferAirport({ outTo: 'Istanbul Sabiha', legs: DUS_SAW, tripType: 'roundtrip', destination: 'IST' })).toBe('SAW');
  });

  it('falls back to the destination code when there is no flight to read, as before', () => {
    expect(transferAirport({ destination: 'AYT' })).toBe('AYT');
    expect(transferAirport({ legs: [], destination: 'AYT' })).toBe('AYT');
    expect(transferAirport()).toBeNull();
  });
});
