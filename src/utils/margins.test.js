import { describe, it, expect } from 'vitest';
import { packageMarginOf, hotelOnlyMarginOf, withRoomMargins, NO_MARGINS } from './margins';

const CFG = {
  apply: true,
  dynamicPackage: { enabled: true, baseMargin: 50, variablePercent: 6, minMargin: 100 },
  hotelOnly: { enabled: true, minMargin: 50, tiers: [{ from: 0, to: 499.99, percent: 15 }, { from: 500, to: 999.99, percent: 13 }, { from: 1000, to: 1499.99, percent: 11 }, { from: 1500, to: 2499.99, percent: 9 }, { from: 2500, to: null, percent: 8 }] },
};

describe('the Margin Menu on live prices — the same euros as the admin', () => {
  it('Delphin Diva: €486 + €1,745.04 → €183.86; hotel only €1,745.04 → €157.05', () => {
    expect(packageMarginOf(CFG, { flightNet: 486, hotelNet: 1745.04 })).toBe(183.86);
    expect(hotelOnlyMarginOf(CFG, 1745.04)).toBe(157.05);
    expect(hotelOnlyMarginOf(CFG, 200)).toBe(50);
  });
  it('rooms: a package waits for its flight; with it, each room carries its own margin', () => {
    const live = { av: 'ok', rooms: [{ price: 500 }, { price: 900 }] };
    expect(withRoomMargins(live, CFG, { isPackage: true, flightNet: null })).toBe(live);
    const pk = withRoomMargins(live, CFG, { isPackage: true, flightNet: 1000 });
    expect(pk.rooms.map((r) => [r.price, r.supplierPrice, r.margin])).toEqual([[640, 500, 140], [1064, 900, 164]]);
    const ho = withRoomMargins(live, CFG, { isPackage: false });
    expect(ho.rooms.map((r) => r.price)).toEqual([575, 1017]);
  });
  it('nothing switched on: the very same object, supplier prices untouched', () => {
    const live = { rooms: [{ price: 500 }] };
    expect(withRoomMargins(live, NO_MARGINS, { isPackage: true, flightNet: 1000 })).toBe(live);
    expect(withRoomMargins(live, { apply: true, dynamicPackage: CFG.dynamicPackage }, { isPackage: false })).toBe(live);
  });
});
