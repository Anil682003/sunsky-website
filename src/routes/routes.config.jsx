import { lazy } from 'react';

// Every page is its own file, loaded when its route opens (30 Oct 2026). One bundle with all
// pages was 1.6 MB: a shared Results or hotel link waited for checkout, account and voucher code
// before it could ask for any data (16 s download measured on prod). AppRouter's Suspense shows
// the loader meanwhile.
const Home = lazy(() => import('../pages/Home/Home'));
const Results = lazy(() => import('../pages/Results/Results'));
const HotelDetail = lazy(() => import('../pages/HotelDetail/HotelDetail'));
const Packages = lazy(() => import('../pages/Packages/Packages'));
const Flights = lazy(() => import('../pages/Flights/Flights'));
const FlightDetail = lazy(() => import('../pages/FlightDetail/FlightDetail'));
const Hotels = lazy(() => import('../pages/Hotels/Hotels'));
const HolidayType = lazy(() => import('../pages/HolidayType/HolidayType'));
const Transfers = lazy(() => import('../pages/Transfers/Transfers'));
const About = lazy(() => import('../pages/About/About'));
const Contact = lazy(() => import('../pages/Contact/Contact'));
const Faq = lazy(() => import('../pages/Faq/Faq'));
const StaticPage = lazy(() => import('../pages/StaticPage/StaticPage'));
const SeoLanding = lazy(() => import('../pages/SeoLanding/SeoLanding'));
const Login = lazy(() => import('../pages/Auth/Login'));
const Register = lazy(() => import('../pages/Auth/Register'));
const ForgotPassword = lazy(() => import('../pages/Auth/ForgotPassword'));
const Account = lazy(() => import('../pages/Account/Account'));
const MyBookings = lazy(() => import('../pages/Account/MyBookings'));
const AccountBookingDetail = lazy(() => import('../pages/Account/BookingDetail'));
const Favourites = lazy(() => import('../pages/Account/Favourites'));
const Profile = lazy(() => import('../pages/Account/Profile'));
const AccountSettings = lazy(() => import('../pages/Account/AccountSettings'));
const Checkout = lazy(() => import('../pages/Checkout/Checkout'));
const CheckoutReturn = lazy(() => import('../pages/Checkout/CheckoutReturn'));
const HotelVoucher = lazy(() => import('../pages/Voucher/HotelVoucher'));
const BookingFlow = lazy(() => import('../pages/Booking/BookingFlow'));
const BookingDetail = lazy(() => import('../pages/Booking/BookingDetail'));
const BookingConfirmation = lazy(() => import('../pages/Booking/BookingConfirmation'));
const NotFound = lazy(() => import('../pages/NotFound/NotFound'));

// layout: true  → wrapped in Navbar + Footer
// footer: false → keeps the navbar but drops the footer (see Layout)
// protected: true → requires auth, redirects to /login
export const publicRoutes = [
  { path: '/login',    component: Login,    layout: false },
  { path: '/register', component: Register, layout: false },
  { path: '/forgot-password', component: ForgotPassword, layout: false },
];

export const routes = [
  // Public pages
  { path: '/',           component: Home,      layout: true, protected: false },
  { path: '/results',    component: Results,   layout: true, protected: false },
  { path: '/hotel/:hotelCode', component: HotelDetail, layout: true, footer: false, protected: false },
  { path: '/packages',   component: Packages,  layout: true, protected: false },
  { path: '/flights',    component: Flights,   layout: true, protected: false },
  { path: '/flights/:id', component: FlightDetail, layout: true, protected: false },
  { path: '/hotels',     component: Hotels,    layout: true, protected: false },
  { path: '/holidays/:slug', component: HolidayType, layout: true, protected: false },
  { path: '/transfers',  component: Transfers, layout: true, protected: false },
  { path: '/about',      component: About,     layout: true, protected: false },
  { path: '/contact',    component: Contact,   layout: true, protected: false },
  // Help centre. The questions are CMS-managed (CMS → FAQ); /faq#faq-<id> opens
  // one answer directly, so support can link straight at it.
  { path: '/faq',        component: Faq,       layout: true, protected: false },
  // CMS static/legal pages (CMS → Static Pages), e.g. /p/privacy-policy
  { path: '/p/:slug',    component: StaticPage, layout: true, protected: false },

  // Checkout (guest checkout allowed — customer details are asked when not signed in)
  { path: '/checkout',   component: Checkout,  layout: true, protected: false },
  // Return page for redirect payments (Bancontact / iDEAL / PayPal)
  { path: '/checkout/return', component: CheckoutReturn, layout: true, protected: false },

  // Hotel voucher — standalone printable document (no navbar/footer)
  { path: '/voucher',    component: HotelVoucher, layout: false, protected: false },

  // Account (protected)
  { path: '/account',           component: Account,         layout: true, protected: true },
  { path: '/account/bookings',  component: MyBookings,      layout: true, protected: true },
  { path: '/account/bookings/:ref', component: AccountBookingDetail, layout: true, protected: true },
  { path: '/account/favourites', component: Favourites,     layout: true, protected: true },
  { path: '/account/profile',   component: Profile,         layout: true, protected: true },
  { path: '/account/settings',  component: AccountSettings, layout: true, protected: true },

  // Booking flow (protected)
  { path: '/booking/new',             component: BookingFlow,         layout: true, protected: true },
  { path: '/booking/:ref',            component: BookingDetail,       layout: true, protected: true },
  { path: '/booking/:ref/confirmation', component: BookingConfirmation, layout: true, protected: true },
];

/**
 * Permanent SEO pages (SEO Master §5): /zonvakanties, /zonvakanties/turkije,
 * /zonvakanties/turkije/antalya, /zonvakanties/turkije/antalya/side, plus /last-minute/…,
 * /goedkope-vakanties/…, /all-inclusive/… and /reisgids/….
 *
 * WILDCARDS, AND THEY HAVE TO BE. The URLs are built from live Geo Data, so the set of valid
 * paths is not knowable at build time; `SeoLanding` asks the backend what each one is and
 * renders a not-found state when the answer is nothing. That is safe here because React
 * Router ranks by specificity rather than by order: every static route above, /about and
 * /faq and the rest, still wins against `/:a`.
 *
 * `server/index.js` answers the same question before React loads, so a crawler gets the real
 * title and a real 404 status rather than this component's rendered one.
 */
const seoLandingRoutes = ['/:a', '/:a/:b', '/:a/:b/:c', '/:a/:b/:c/:d'].map((path) => ({
  path, component: SeoLanding, layout: true, protected: false,
}));

routes.push(...seoLandingRoutes);

export const notFoundRoute = { path: '*', component: NotFound, layout: true };
