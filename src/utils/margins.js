// The Margin Menu on live prices (Levent, 16 Nov 2026: hotels and packages were sold at purchase
// price). Mirrors sunsky-admin services/margin/marginApply.service.js, with the same rules file
// (marginRules.js), so the price this page quotes is the price the server re-checks and charges.
//
// The config comes from the admin (/website/margins): `{ apply: false }` until SUNSKY switches a
// product on (MARGINS_APPLY), then only the products switched on. Nothing applied → every price
// below is the supplier's own, exactly as before.
import axiosInstance from '../services/axiosInstance';
import { ENDPOINTS } from '../api/endpoints';
import { calculate, PRODUCTS, round2 } from './marginRules';

export const NO_MARGINS = Object.freeze({ apply: false });

/** PURE. The package margin on NET flight + hotel together (0 when not applied). */
export function packageMarginOf(cfg, { flightNet, hotelNet }) {
  if (!cfg?.apply || !cfg.dynamicPackage) return 0;
  const r = calculate(PRODUCTS.DYNAMIC_PACKAGE, { dynamicPackage: cfg.dynamicPackage }, { flightCost: round2(flightNet), hotelCost: round2(hotelNet) });
  return r.ok ? r.margin : 0;
}

/** PURE. The Hotel Only margin on the whole stay's NET (0 when not applied). */
export function hotelOnlyMarginOf(cfg, hotelNet) {
  if (!cfg?.apply || !cfg.hotelOnly) return 0;
  const r = calculate(PRODUCTS.HOTEL_ONLY, { hotelOnly: cfg.hotelOnly }, { supplierCost: round2(hotelNet) });
  return r.ok ? r.margin : 0;
}

/**
 * PURE. The live rooms as this page sells them: each room's `price` with its margin, its own
 * `supplierPrice` kept. A package needs its flight's price (`flightNet`); until it is known the
 * rooms stay as they came (no package total is quoted before the flight anyway). The same object
 * when nothing changes, so nothing re-renders for nothing.
 */
export function withRoomMargins(live, cfg, { isPackage = false, flightNet = null } = {}) {
  if (!live?.rooms?.length || !cfg?.apply) return live;
  if (isPackage && !(Number(flightNet) > 0)) return live;
  let changed = false;
  const rooms = live.rooms.map((r) => {
    const net = Number(r.price);
    if (!(net > 0)) return r;
    const margin = isPackage ? packageMarginOf(cfg, { flightNet: Number(flightNet), hotelNet: net }) : hotelOnlyMarginOf(cfg, net);
    if (!(margin > 0)) return r;
    changed = true;
    return { ...r, price: round2(net + margin), supplierPrice: net, margin };
  });
  return changed ? { ...live, rooms } : live;
}

let pending = null;
let cached = null;
let cachedAt = 0;
const TTL_MS = 60_000;

/** The current margin config, fetched at most once a minute; never throws (→ no margins). */
export function fetchMargins() {
  if (cached && Date.now() - cachedAt < TTL_MS) return Promise.resolve(cached);
  if (!pending) {
    pending = axiosInstance.get(ENDPOINTS.margins)
      .then((res) => { cached = res?.data?.data?.apply ? res.data.data : NO_MARGINS; cachedAt = Date.now(); return cached; })
      .catch(() => NO_MARGINS)
      .finally(() => { pending = null; });
  }
  return pending;
}

/** Tests only. */
export function _resetMarginsCache() { pending = null; cached = null; cachedAt = 0; }
