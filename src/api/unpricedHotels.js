import axiosInstance from '../services/axiosInstance';

/**
 * The hotels this destination has that the price cache could NOT price for these dates, but
 * World2Meet can still sell.
 *
 * /contracts/cheapest only returns bookable hotels — a hotel with no allotment, or one that
 * fails the occupancy or minimum-stay rules, is simply absent, so the results page never learns
 * it exists. Some of those are still on sale at World2Meet. The admin checks them in a single
 * live call and answers with the ones that can be booked.
 *
 * Called ONCE per search, when the list has run out (`hasMore === false`) — never per page.
 *
 * `hotelCodes` narrows it to a named set instead of sweeping the destination: the hotel a
 * traveller picked from the typeahead, or the hotels a content facet resolved to. A hotel
 * searched BY NAME that the cache cannot price is the case this matters most for — without it
 * the page says "no stays found", which reads as "we do not sell this hotel".
 *
 * Prices are deliberately not requested: these cards carry a "check live prices" button, and the
 * real price is quoted on the hotel page by the existing live check.
 *
 * Failure is silent by design. The priced hotels are already on screen and must not be disturbed
 * by a supplier being slow, so this resolves to an empty list instead of throwing.
 *
 * @returns {Promise<{hotelCode:string, w2mHotelCode:string, boardCode:string|null,
 *                    roomName:string|null, refundable:boolean}[]>}
 */
export async function fetchUnpricedHotels(
  { destinations, hotelCodes, checkIn, checkOut, adults, children, childAges, rooms, shownHotelCodes },
  { signal } = {},
) {
  if ((!destinations?.length && !hotelCodes?.length) || !checkIn || !checkOut) return [];
  try {
    const { data } = await axiosInstance.post(
      '/hotel-availability/unpriced',
      {
        destinations,
        ...(hotelCodes?.length ? { hotelCodes: hotelCodes.map(String) } : {}),
        checkin: checkIn,
        checkout: checkOut,
        adults: Number(adults) || 2,
        children: Number(children) || 0,
        childAges: childAges
          ? String(childAges).split(',').map(Number).filter(Number.isFinite)
          : [],
        rooms: Number(rooms) || 1,
        shownHotelCodes: (shownHotelCodes || []).map(String),
      },
      { signal },
    );
    return Array.isArray(data?.hotels) ? data.hotels : [];
  } catch {
    return [];
  }
}

export default fetchUnpricedHotels;
