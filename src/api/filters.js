// filters.js — website content-filter API (holiday theme, geo cascade).
//
// The search flow: the site asks the ADMIN content API which hotels match the chosen
// content filters, gets back a list of hotelCodes, and passes those to the CACHE price
// search (/contracts/cheapest?hotelCodes=...). This module is the admin half.
//
// Admin calls go through axiosInstance, whose baseURL already ends in /api, so the paths
// here are relative to /api (endpoints live at /api/hotel-filters/*).
import axiosInstance from '../services/axiosInstance';

/** Active holiday/theme types → [{ id, name, category, icon }]. For the filter chips. */
export async function fetchThemes() {
  const { data } = await axiosInstance.get('/hotel-filters/themes');
  return data?.data ?? [];
}

/** Countries that have hotels → [{ code, name }]. Cascade level 1. */
export async function fetchCountries() {
  const { data } = await axiosInstance.get('/hotel-filters/countries');
  return data?.data ?? [];
}

/** Destinations in a country that have hotels → [{ code, name }]. Cascade level 2. */
export async function fetchDestinations(countryCode) {
  if (!countryCode) return [];
  const { data } = await axiosInstance.get('/hotel-filters/destinations', { params: { countryCode } });
  return data?.data ?? [];
}

/**
 * Resolve the content filters to matching hotelCodes (+ attributes).
 * Pass the SEARCH destination so the set stays bounded and fast.
 *
 * @returns {Promise<{ count:number, hotelCodes:string[], attributes:Record<string,object> }>}
 */
export async function fetchMatchingHotels({ destinationCode, countryCode, themes = [] } = {}) {
  const params = {};
  if (destinationCode) params.destinationCode = destinationCode;
  if (countryCode)     params.countryCode = countryCode;
  if (themes.length)   params.themes = themes.join(',');
  const { data } = await axiosInstance.get('/hotel-filters/hotels', { params });
  return data?.data ?? { count: 0, hotelCodes: [], attributes: {} };
}
