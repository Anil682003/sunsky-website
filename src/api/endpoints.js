export const ENDPOINTS = {
  // Auth
  login:           '/website/auth/login',
  register:        '/website/auth/register',
  me:              '/website/auth/me',
  refresh:         '/website/auth/refresh',

  // Bookings
  myBookings:      '/website/bookings',
  bookingByRef:    (ref) => `/website/bookings/${encodeURIComponent(ref)}`,

  // Favourites
  favourites:      '/website/favourites',
  favouriteByCode: (code) => `/website/favourites/${encodeURIComponent(code)}`,

  // CMS
  homepageConfig:  '/cms/layout/homepage-config',

  // Geo
  countries:       '/website/geo/countries',

  // Holiday types (linked to countries in the admin dashboard)
  holidayTypes:    '/website/holiday-types',
  holidayTypeCountries: (idOrSlug) =>
    `/website/holiday-types/${encodeURIComponent(idOrSlug)}/countries`,

  // Geo — function so the search term is encoded into the URL at call time
  citySearch: (q) => `/geo/cities?search=${encodeURIComponent(q)}&active=true&limit=8`,
};
