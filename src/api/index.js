import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import useApi from '../hooks/useApi';
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

export const useHomepageConfig = () =>
  useApi(ENDPOINTS.homepageConfig, {
    immediate: true,
    transformResponse: (res) => (res?.success ? res.data.homepageConfig : null),
  });

export const useCitySearch = () =>
  useApi(ENDPOINTS.citySearch, {
    transformResponse: (res) => res?.data ?? [],
  });
