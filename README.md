# Sunsky Website

Customer-facing booking portal for the Sunsky travel agency platform. End users browse and book travel products (flights, hotels, transfers, packages, insurance, car rentals, visas, cruises) from this application. The companion admin panel is located at `D:\sunskyadmin`.

## Tech Stack

- **React 19** + **Vite**
- **CSS Modules** (no external UI libraries)
- **Redux Toolkit** for state management
- **Lucide React** for icons
- **Axios** via a centralized `axiosInstance` for API calls
- Custom hooks built on a generic `useApi` pattern

## Design System

- Primary accent: amber/gold `#f5a51e`
- Clean whites and light grays for backgrounds
- Consistent border-radius and shadow tokens
- European-style currency formatting
- 36px height alignment for filter/search bars

## Development Approach

- **Frontend-first** — all screens built with static inline mock data before any API integration
- API integration phase deferred until all frontend modules are complete
- No external UI component libraries — everything is custom with CSS Modules
- `console.log` placeholders where API calls will eventually go

## Relationship to SunskyAdmin

| Concern | SunskyAdmin (`D:\sunskyadmin`) | sunsky-website (this repo) |
|---|---|---|
| Audience | Travel agency staff | End customers |
| Purpose | Manage bookings, finance, docs, travelers | Browse & book travel products |
| Backend | Express.js + MySQL (Sequelize) | Same backend API |

## Getting Started

```bash
npm install
npm run dev
```

## Project Structure (planned)

```
src/
  assets/
  components/       # Shared UI components
  pages/            # Route-level page components
  store/            # Redux slices
  hooks/            # Custom useApi-based hooks
  services/         # axiosInstance + API service files
  styles/           # Global CSS / design tokens
```

## Modules (planned)

1. Home / Landing page
2. Search & Results
3. Product Detail pages (Flight, Hotel, Package, etc.)
4. Booking Flow (multi-step wizard)
5. Traveler Details
6. Payment
7. Booking Confirmation
8. User Account (login, register, booking history)
