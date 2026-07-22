export const ENDPOINTS = {
  // Auth
  login:           '/website/auth/login',
  register:        '/website/auth/register',
  me:              '/website/auth/me',
  refresh:         '/website/auth/refresh',
  forgotPassword:  '/website/auth/forgot-password',
  verifyResetCode: '/website/auth/verify-reset-code',
  resetPassword:   '/website/auth/reset-password',

  // Bookings
  myBookings:      '/website/bookings',
  bookingByRef:    (ref) => `/website/bookings/${encodeURIComponent(ref)}`,

  // Favourites
  favourites:      '/website/favourites',
  favouriteByCode: (code) => `/website/favourites/${encodeURIComponent(code)}`,

  // CMS
  homepageConfig:  '/cms/layout/homepage-config',
  footerConfig:    '/cms/layout/footer-config',

  // Geo
  countries:       '/website/geo/countries',
  geoPlaces: (countryIds) =>
    `/website/geo/places?countryIds=${countryIds.map((id) => encodeURIComponent(id)).join(',')}`,

  // Holiday types (linked to countries in the admin dashboard)
  holidayTypes:    '/website/holiday-types',
  holidayTypeCountries: (idOrSlug) =>
    `/website/holiday-types/${encodeURIComponent(idOrSlug)}/countries`,

  // Geo — function so the search term is encoded into the URL at call time
  citySearch: (q) => `/geo/cities?search=${encodeURIComponent(q)}&active=true&limit=8`,
};
