import { createContext, useContext } from 'react';

/**
 * The Hotelbeds code behind a readable hotel URL.
 *
 * WHY A CONTEXT AND NOT A ROUTE PARAM. The permanent hotel URL is
 * /hotel/turkije/antalya/monart-city (SEO Master §5), whose last segment is a NAME slug, not
 * a code. `HotelDetail` is driven by a code, and the slug cannot be turned into one without
 * asking the backend. So `SeoLanding` resolves it and hands it down, which is also the only
 * way this works for a visitor arriving cold from Google: router state would be empty and a
 * query parameter would create a second URL for the same hotel.
 *
 * This exists so that the readable URL IS the hotel page rather than a thin page beside it.
 * §8 allows exactly one canonical page per Hotelbeds code, and two URLs both showing the
 * hotel - one rich, one summary - is the duplicate that rule is there to prevent.
 */
export const SeoHotelCodeContext = createContext(null);

/** The resolved code when rendered under a readable hotel URL, else null. */
export function useSeoHotelCode() {
  return useContext(SeoHotelCodeContext);
}
