# Sunsky Website

Customer-facing booking portal for the Sunsky travel platform. Public users browse travel products, register/login, and manage their bookings. The companion admin panel lives at `D:\sunsky-freelance\sunsky-admin`.

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | React 19 + Vite |
| Routing | React Router v7 |
| State | Redux Toolkit (`authSlice`) |
| HTTP | Axios — centralized `axiosInstance` with auto token refresh |
| Icons | Lucide React |
| Styling | CSS Modules — no external UI libraries |

## Design Tokens

- Primary accent: `#f5a51e` (amber/gold)
- Backgrounds: white + light grays
- Currency: European format (`€1.234,56`)
- Input height: 36px alignment

---

## Getting Started

```bash
npm install
npm run dev        # http://localhost:5173
```

### Environment variable (optional)

Create a `.env` file in the project root to override the API URL:

```env
VITE_API_URL=http://localhost:5000/api
```

The `axiosInstance` defaults to `http://localhost:5000/api` if this variable is not set.
To point at the production server instead, update `src/utils/ip.js`:

```js
// src/utils/ip.js
export const BASE_URL = 'http://91.134.71.79:5000/api';   // production
// export const BASE_URL = 'http://localhost:5000/api';    // local
```

---

## Relationship to sunsky-admin Backend

The website shares the **same backend** as the admin panel. All customer-facing endpoints live under the `/api/public/` namespace.

| Concern | sunsky-admin | sunsky-website |
|---|---|---|
| Audience | Agency staff (Super Admin / Admin / Employee) | End customers |
| Role hierarchy level | 1, 2, 3 | 4 (Customer) |
| Auth endpoint prefix | `/api/auth/` | `/api/public/auth/` |
| Booking type created | `offline` | `online` |
| Booking visibility | All bookings | Own bookings only |

> **Important:** The backend rejects logins from non-customer accounts on `/api/public/auth/login` and vice versa on `/api/auth/login`.

---

## Before Running — One-time Backend Setup

Run the customer role seed script **once** on the backend:

```bash
node backend/scripts/seed-customer-role.mjs
```

This inserts the `customer` role (hierarchyLevel 4) into the `roles` table. Registration will fail with a 500 error if this is skipped.

---

## Authentication Flow

```
Register (/register)
  → POST /api/public/auth/register
  → { type: 'private'|'professional', ...fields, password }
  → Creates users record + private_customers or professional_customers record
  → Returns { accessToken, refreshToken, user }
  → Auto-login → navigate to /account/bookings

Login (/login)
  → POST /api/public/auth/login
  → { email, password }
  → Returns { accessToken, refreshToken, user }
  → Stored in localStorage + Redux

Token Refresh (automatic)
  → axiosInstance intercepts 401 responses
  → POST /api/public/auth/refresh with stored refreshToken
  → Retries original request with new accessToken
  → On refresh failure → clears storage → redirect to /login
```

### Token storage

| Key | Value |
|---|---|
| `localStorage.accessToken` | JWT access token (24h expiry) |
| `localStorage.refreshToken` | JWT refresh token (7 days) |
| `localStorage.user` | Serialized user object (Redux persistence) |

---

## Project Structure

```
src/
  assets/               # Images, logos
  components/           # Shared UI components
    ProtectedRoute.jsx  # Redirects to /login if not authenticated
    PublicRoute.jsx     # Redirects to /account if already authenticated
  hooks/
    useApi.js           # Generic { data, loading, error, execute } hook
  pages/
    Auth/
      Login.jsx         # → POST /api/public/auth/login
      Register.jsx      # → POST /api/public/auth/register (private + professional)
    Account/
      MyBookings.jsx    # → GET /api/public/bookings
      Profile.jsx       # → GET /api/public/auth/me
      AccountSettings.jsx
      Account.jsx
    Home/               # Landing page + sections
    Search/
    Flights/
    Hotels/
    Packages/
    Transfers/
    Booking/
      BookingFlow.jsx
      BookingDetail.jsx
      BookingConfirmation.jsx
  routes/
    AppRouter.jsx       # Route rendering with Suspense + layout wrapping
    routes.config.jsx   # Route definitions (public / protected / layout flags)
  services/
    axiosInstance.js    # Axios with Bearer token injection + 401 auto-refresh
  store/
    index.js
    slices/authSlice.js # loginSuccess / logout / updateUser actions
  utils/
    ip.js               # BASE_URL + UPLOAD_BASE_URL constants
```

---

## API Endpoints Used

### Public (no auth required)
| Method | Endpoint | Used in |
|---|---|---|
| POST | `/api/public/auth/register` | Register.jsx |
| POST | `/api/public/auth/login` | Login.jsx |
| POST | `/api/public/auth/refresh` | axiosInstance (auto) |

### Customer (requires Bearer token + customer role)
| Method | Endpoint | Used in |
|---|---|---|
| GET | `/api/public/auth/me` | Profile.jsx |
| POST | `/api/public/auth/logout` | (logout action) |
| GET | `/api/public/bookings` | MyBookings.jsx |
| GET | `/api/public/bookings/:ref` | BookingDetail.jsx |

### Shared / read-only (no auth, served from admin backend)
| Prefix | Purpose |
|---|---|
| `/api/cms/` | CMS pages, FAQs |
| `/api/geo/` | Countries, destinations, zones |
| `/api/flights/` | Flight product data |
| `/api/hotels/` | Hotel product data |

---

## Customer Types

Registration supports two account types, each stored in a separate DB table:

| Type | DB Table | Code prefix | Form steps |
|---|---|---|---|
| Private | `private_customers` | `CUST-PRV-xxxxx` | Personal → Address → Security |
| Professional | `professional_customers` | `CUST-PRO-xxxxx` | Company → Invoicing → Contact → Security |

Both are linked to the `users` table by email.

---

## Route Map

| Path | Auth | Page |
|---|---|---|
| `/` | No | Home |
| `/search` | No | Search results |
| `/flights` | No | Flights listing |
| `/hotels` | No | Hotels listing |
| `/packages` | No | Packages listing |
| `/transfers` | No | Transfers listing |
| `/about` | No | About page |
| `/contact` | No | Contact page |
| `/login` | No (public only) | Login form |
| `/register` | No (public only) | Registration wizard |
| `/account` | Yes | Account dashboard |
| `/account/bookings` | Yes | My bookings list |
| `/account/profile` | Yes | Profile + customer details |
| `/account/settings` | Yes | Account settings |
| `/booking/new` | Yes | New booking flow |
| `/booking/:ref` | Yes | Booking detail |
| `/booking/:ref/confirmation` | Yes | Booking confirmation |

---

## Key Implementation Notes

- The `axiosInstance` auto-refreshes expired tokens — no manual token handling needed in components.
- `ProtectedRoute` reads `isAuthenticated` from Redux; unauthenticated users are redirected to `/login`.
- After registration the user is auto-logged-in (tokens returned immediately) and redirected to `/account/bookings`.
- Booking `balanceAmount = grandTotal − paidAmount` is computed server-side and returned in the API response.
- All monetary amounts are in EUR and formatted with `€` prefix, 2 decimal places.
