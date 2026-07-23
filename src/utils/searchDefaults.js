// Default search context for a link that has no search behind it — a homepage card, a saved
// favourite, any "just show me this hotel" entry point.
//
// The numbers match what the Results page falls back to when the URL carries no dates, so a
// traveller who lands on a hotel from the homepage sees the same stay they would have seen
// arriving through a search: a week away, a month out, two adults, one room.
//
// Dates are computed in UTC. `new Date('2026-01-01')` parses as UTC but `toISOString()` on a
// locally-built date shifts the day for anyone east of Greenwich — the same trap the Results
// page documents around checkOutForNights.

export const DEFAULT_LEAD_DAYS = 30;   // how far ahead the stay starts
export const DEFAULT_NIGHTS    = 7;

/** YYYY-MM-DD, `days` from now, computed in UTC so it never lands a day early or late. */
export function isoDaysFromNow(days, now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

/**
 * @returns {{ checkIn:string, checkOut:string, adults:string, children:string, rooms:string, nights:string }}
 */
export function defaultSearchContext(now = new Date()) {
  return {
    checkIn:  isoDaysFromNow(DEFAULT_LEAD_DAYS, now),
    checkOut: isoDaysFromNow(DEFAULT_LEAD_DAYS + DEFAULT_NIGHTS, now),
    adults:   '2',
    children: '0',
    rooms:    '1',
    nights:   String(DEFAULT_NIGHTS),
  };
}

/**
 * The href of a hotel's detail page, carrying enough context for it to price the stay and
 * render a header before its own content request lands.
 *
 * Returns null when there is no hotelCode — the caller must then render something that is not
 * a link, rather than a link to `/hotel/undefined`.
 *
 * @param {{ hotelCode?:string|number, name?:string, loc?:string, stars?:number|string,
 *           img?:string, destinationCode?:string }} hotel
 * @param {object} [ctx] search context; defaults to defaultSearchContext()
 */
export function hotelDetailHref(hotel, ctx = defaultSearchContext()) {
  const code = hotel?.hotelCode;
  if (code == null || String(code).trim() === '') return null;
  const qs = new URLSearchParams({
    checkIn:  ctx.checkIn,
    checkOut: ctx.checkOut,
    adults:   ctx.adults,
    children: ctx.children,
    rooms:    ctx.rooms,
    nights:   ctx.nights,
  });
  if (hotel.destinationCode) qs.set('destination', hotel.destinationCode);
  if (hotel.name)            qs.set('name', String(hotel.name).trim());
  if (hotel.img)             qs.set('img', hotel.img);
  if (hotel.loc)             qs.set('loc', String(hotel.loc).trim());
  if (hotel.stars)           qs.set('stars', String(hotel.stars));
  return `/hotel/${encodeURIComponent(String(code).trim())}?${qs.toString()}`;
}
