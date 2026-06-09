import axios from 'axios';
import { BASE_URL } from '../utils/ip';

const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL || BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

axiosInstance.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Track in-flight refresh so concurrent 401s don't trigger multiple refresh calls
let refreshPromise = null;

axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    const isAuthEndpoint = original.url?.includes('/public/auth/');
    if (error.response?.status === 401 && !original._retried && !isAuthEndpoint) {
      original._retried = true;

      const refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken) {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('user');
        window.location.href = '/login';
        return Promise.reject(error);
      }

      try {
        if (!refreshPromise) {
          refreshPromise = axios
            .post(`${axiosInstance.defaults.baseURL}/public/auth/refresh`, { refreshToken })
            .finally(() => { refreshPromise = null; });
        }

        const { data } = await refreshPromise;
        const newToken = data.data.accessToken;
        localStorage.setItem('accessToken', newToken);
        original.headers.Authorization = `Bearer ${newToken}`;
        return axiosInstance(original);
      } catch {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        window.location.href = '/login';
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

export default axiosInstance;
