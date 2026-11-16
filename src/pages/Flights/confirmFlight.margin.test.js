// A flight sold alone is quoted and confirmed with its Flight Only margin; a package's never.
import { describe, it, expect } from 'vitest';
import { confirmBody } from './confirmFlight';
import { confirmBody as packageConfirmBody } from '../../utils/packageHandoff';

describe('sell: flight only on the flight pages', () => {
  it('the flight-only confirm asks for the selling price; the package confirm does not', () => {
    const s = { from: { code: 'BRU' }, to: { code: 'AYT' }, depISO: '2027-06-01', adults: 2, children: 0, infants: 0 };
    expect(confirmBody({ totalPrice: 526, confirm: {} }, s).sell).toBe('flight');
    const pkg = { from: 'BRU', to: 'AYT', depdate: '2027-06-01', retdate: '2027-06-08', outLegs: [], backLegs: [], flightPrice: 486 };
    expect('sell' in packageConfirmBody(pkg, { adults: 2, children: 0, infants: 0 })).toBe(false);
  });
});
