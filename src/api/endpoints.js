export const ENDPOINTS = {
  // Auth
  login:           '/website/auth/login',
  register:        '/website/auth/register',
  me:              '/website/auth/me',
  refresh:         '/website/auth/refresh',

  // Bookings
  myBookings:      '/website/bookings',

  // CMS
  homepageConfig:  '/cms/layout/homepage-config',

  // Geo — function so the search term is encoded into the URL at call time
  citySearch: (q) => `/geo/cities?search=${encodeURIComponent(q)}&active=true&limit=8`,
};
