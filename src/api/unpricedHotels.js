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
  { destinations, checkIn, checkOut, adults, children, childAges, rooms, shownHotelCodes },
  { signal } = {},
) {
  if (!destinations?.length || !checkIn || !checkOut) return [];
  try {
    const { data } = await axiosInstance.post(
      '/hotel-availability/unpriced',
      {
        destinations,
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
