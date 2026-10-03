import Home from '../pages/Home/Home';
import Results from '../pages/Results/Results';
import HotelDetail from '../pages/HotelDetail/HotelDetail';
import Packages from '../pages/Packages/Packages';
import Flights from '../pages/Flights/Flights';
import FlightDetail from '../pages/FlightDetail/FlightDetail';
import Hotels from '../pages/Hotels/Hotels';
import HolidayType from '../pages/HolidayType/HolidayType';
import Transfers from '../pages/Transfers/Transfers';
import About from '../pages/About/About';
import Contact from '../pages/Contact/Contact';
import Faq from '../pages/Faq/Faq';
import StaticPage from '../pages/StaticPage/StaticPage';
import SeoLanding from '../pages/SeoLanding/SeoLanding';
import Login from '../pages/Auth/Login';
import Register from '../pages/Auth/Register';
import ForgotPassword from '../pages/Auth/ForgotPassword';
import Account from '../pages/Account/Account';
import MyBookings from '../pages/Account/MyBookings';
import AccountBookingDetail from '../pages/Account/BookingDetail';
import Favourites from '../pages/Account/Favourites';
import Profile from '../pages/Account/Profile';
import AccountSettings from '../pages/Account/AccountSettings';
import Checkout from '../pages/Checkout/Checkout';
import CheckoutReturn from '../pages/Checkout/CheckoutReturn';
import HotelVoucher from '../pages/Voucher/HotelVoucher';
import BookingFlow from '../pages/Booking/BookingFlow';
import BookingDetail from '../pages/Booking/BookingDetail';
import BookingConfirmation from '../pages/Booking/BookingConfirmation';
import NotFound from '../pages/NotFound/NotFound';

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
