import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import useApi from '../hooks/useApi';
import axiosInstance from '../services/axiosInstance';
import { loginSuccess, updateUser } from '../store/slices/authSlice';
import { ENDPOINTS } from './endpoints';

// Shared post-login side-effects used by both login and register
const useAuthSuccess = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  return (res) => {
    const { accessToken, refreshToken, user } = res.data;
    if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
    dispatch(loginSuccess({ user, accessToken }));
    navigate('/account/bookings');
  };
};

export const useLogin = () => {
  const onSuccess = useAuthSuccess();
  return useApi(ENDPOINTS.login, { method: 'POST', onSuccess });
};

export const useRegister = () => {
  const onSuccess = useAuthSuccess();
  return useApi(ENDPOINTS.register, { method: 'POST', onSuccess });
};

export const useMe = () => {
  const dispatch = useDispatch();
  return useApi(ENDPOINTS.me, {
    immediate: true,
    transformResponse: (res) => res?.data ?? null,
    onSuccess: (profile) => {
      if (profile) dispatch(updateUser({ name: profile.name, email: profile.email }));
    },
  });
};

export const useMyBookings = () =>
  useApi(ENDPOINTS.myBookings, {
    immediate: true,
    transformResponse: (res) => res?.data ?? [],
  });

// Single booking detail by reference (e.g. ORD-000049)
export const useBooking = (ref) =>
  useApi(ENDPOINTS.bookingByRef(ref || '_'), {
    immediate: !!ref,
    transformResponse: (res) => res?.data ?? null,
  });

// Favourites — list (immediate) for the Favourites page
export const useFavourites = () =>
  useApi(ENDPOINTS.favourites, {
    immediate: true,
    transformResponse: (res) => res?.data ?? [],
  });

// Imperative helpers for the heart / save toggles (used across many cards).
export const addFavourite = (payload) =>
  axiosInstance.post(ENDPOINTS.favourites, payload);

export const removeFavourite = (hotelCode) =>
  axiosInstance.delete(ENDPOINTS.favouriteByCode(hotelCode));

// Fetch just the set of favourited hotelCodes (to mark hearts as filled).
export const fetchFavouriteCodes = async () => {
  try {
    const res = await axiosInstance.get(ENDPOINTS.favourites);
    const list = res?.data?.data ?? [];
    return new Set(list.map((f) => String(f.hotelCode)));
  } catch {
    return new Set();
  }
};

export const useHomepageConfig = () =>
  useApi(ENDPOINTS.homepageConfig, {
    immediate: true,
    transformResponse: (res) => (res?.success ? res.data.homepageConfig : null),
  });

export const useCitySearch = () =>
  useApi(ENDPOINTS.citySearch, {
    transformResponse: (res) => res?.data ?? [],
  });

// Every active country with its flag (emoji + flagcdn SVG url). Static reference
// data, so it is fetched once on mount rather than each time the picker opens.
export const useCountries = () =>
  useApi(ENDPOINTS.countries, {
    immediate: true,
    transformResponse: (res) => res?.data ?? [],
    errorMessage: 'Could not load countries',
  });

// Holiday/theme types as configured in the admin dashboard.
export const useHolidayTypes = () =>
  useApi(ENDPOINTS.holidayTypes, {
    immediate: true,
    transformResponse: (res) => res?.data ?? [],
    errorMessage: 'Could not load holiday types',
  });

// The countries linked to one holiday type. Resolves to { holidayType, countries }.
// Call execute(idOrSlug) — the slug comes from the /holidays/:slug route param.
export const useHolidayTypeCountries = () =>
  useApi(ENDPOINTS.holidayTypeCountries, {
    transformResponse: (res) => res?.data ?? null,
    errorMessage: 'Could not load destinations for this holiday type',
  });
