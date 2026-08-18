export const ENDPOINTS = {
  // Auth
  login:           '/website/auth/login',
  register:        '/website/auth/register',
  // "Does this address already have a login?" — answers one boolean and nothing else, so a
  // guest who already has an account is sent to sign in instead of creating a second one.
  emailCheck:      '/website/auth/email-check',
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
  headerConfig:    '/cms/layout/header-config',
  footerConfig:    '/cms/layout/footer-config',
  staticPages:     '/cms/static-pages',

  // Geo
  countries:       '/website/geo/countries',
  // Airport typeahead for the flight search — the dashboard's own airport list (terminals),
  // airports only, slimmed for a per-keystroke call. See sunsky-admin geoPublic.controller.
  airportSearch: (q, limit = 8) =>
    `/website/geo/airports?search=${encodeURIComponent(q)}&limit=${limit}`,
  geoPlaces: (countryIds) =>
    `/website/geo/places?countryIds=${countryIds.map((id) => encodeURIComponent(id)).join(',')}`,

  // What SUNSKY charges for the things it sells itself — insurance rates, baggage prices,
  // the booking fee, the deposit rule. The SAME record the server re-prices bookings with,
  // so the checkout can never show a number the server will reject.
  checkoutConfig:  '/website/checkout-config',

  // Holiday types (linked to countries in the admin dashboard)
  holidayTypes:    '/website/holiday-types',
  holidayTypeCountries: (idOrSlug) =>
    `/website/holiday-types/${encodeURIComponent(idOrSlug)}/countries`,

  // Geo — function so the search term is encoded into the URL at call time
  citySearch: (q) => `/geo/cities?search=${encodeURIComponent(q)}&active=true&limit=8`,
};
