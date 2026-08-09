import axios from 'axios';
import { BASE_URL } from '../utils/ip';

const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL || BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Timeout for the LIVE-SUPPLIER endpoints (rooms, flights, transfers). These fan out to
 * Hotelbeds / Diana / Airtuerk and are in a different class from our own CRUD: the shared
 * 15s budget was shorter than the suppliers' own timeouts, so the browser routinely aborted
 * a request the server went on to answer successfully. The customer saw "taking longer than
 * usual" while a perfectly good set of rooms arrived at a closed socket.
 *
 * The admin endpoint now races its suppliers against a 12.5s deadline, so this sits above it
 * with room for network latency — a timeout here means something is genuinely wrong, not
 * merely slow.
 */
export const SUPPLIER_TIMEOUT = 25000;

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

    const isAuthEndpoint = original.url?.includes('/website/auth/');
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
            .post(`${axiosInstance.defaults.baseURL}/website/auth/refresh`, { refreshToken })
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
