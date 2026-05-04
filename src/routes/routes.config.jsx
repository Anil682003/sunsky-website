import Home from '../pages/Home/Home';
import Search from '../pages/Search/Search';
import Packages from '../pages/Packages/Packages';
import Flights from '../pages/Flights/Flights';
import Hotels from '../pages/Hotels/Hotels';
import Transfers from '../pages/Transfers/Transfers';
import About from '../pages/About/About';
import Contact from '../pages/Contact/Contact';
import Login from '../pages/Auth/Login';
import Register from '../pages/Auth/Register';
import Account from '../pages/Account/Account';
import MyBookings from '../pages/Account/MyBookings';
import Profile from '../pages/Account/Profile';
import AccountSettings from '../pages/Account/AccountSettings';
import BookingFlow from '../pages/Booking/BookingFlow';
import BookingDetail from '../pages/Booking/BookingDetail';
import BookingConfirmation from '../pages/Booking/BookingConfirmation';
import NotFound from '../pages/NotFound/NotFound';

// layout: true  → wrapped in Navbar + Footer
// protected: true → requires auth, redirects to /login
export const publicRoutes = [
  { path: '/login',    component: Login,    layout: false },
  { path: '/register', component: Register, layout: false },
];

export const routes = [
  // Public pages
  { path: '/',           component: Home,      layout: true, protected: false },
  { path: '/search',     component: Search,    layout: true, protected: false },
  { path: '/packages',   component: Packages,  layout: true, protected: false },
  { path: '/flights',    component: Flights,   layout: true, protected: false },
  { path: '/hotels',     component: Hotels,    layout: true, protected: false },
  { path: '/transfers',  component: Transfers, layout: true, protected: false },
  { path: '/about',      component: About,     layout: true, protected: false },
  { path: '/contact',    component: Contact,   layout: true, protected: false },

  // Account (protected)
  { path: '/account',           component: Account,         layout: true, protected: true },
  { path: '/account/bookings',  component: MyBookings,      layout: true, protected: true },
  { path: '/account/profile',   component: Profile,         layout: true, protected: true },
  { path: '/account/settings',  component: AccountSettings, layout: true, protected: true },

  // Booking flow (protected)
  { path: '/booking/new',             component: BookingFlow,         layout: true, protected: true },
  { path: '/booking/:ref',            component: BookingDetail,       layout: true, protected: true },
  { path: '/booking/:ref/confirmation', component: BookingConfirmation, layout: true, protected: true },
];

export const notFoundRoute = { path: '*', component: NotFound, layout: true };
