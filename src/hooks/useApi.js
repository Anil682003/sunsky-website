import { useState, useCallback, useEffect, useRef } from 'react';
import axiosInstance from '../services/axiosInstance';
import { sharedGet } from '../api/sharedGet';

const useApi = (url, options = {}) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const {
    method = 'GET',
    params = null,
    immediate = false,
    responseType,
    transformResponse,
    errorMessage = 'Something went wrong',
    onSuccess,
    onError,
    // Public reference data the same for every visitor (CMS configs, holiday types): one request
    // shared by every component asking at once, kept for a minute (api/sharedGet.js).
    shared = false,
  } = options;

  const transformRef = useRef(transformResponse);
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  transformRef.current = transformResponse;
  onSuccessRef.current = onSuccess;
  onErrorRef.current = onError;

  const execute = useCallback(
    async (...args) => {
      setLoading(true);
      setError(null);

      const resolvedUrl = typeof url === 'function' ? url(...args) : url;
      const hasBody = ['POST', 'PUT', 'PATCH'].includes(method);
      const paramsFn = typeof params === 'function';
      const resolvedParams = paramsFn ? params(...args) : params;
      const payload = hasBody && !paramsFn ? (args.length >= 2 ? args[1] : args[0]) : null;
      const hasParams = resolvedParams && Object.keys(resolvedParams).length > 0;

      try {
        const config = {
          method,
          url: resolvedUrl,
          ...(hasParams && { params: resolvedParams }),
          ...(payload && { data: payload }),
          ...(responseType && { responseType }),
        };

        const result = shared && method === 'GET' && !responseType
          ? await sharedGet(resolvedUrl, { params: hasParams ? resolvedParams : null })
          : (await axiosInstance(config)).data;
        const transform = transformRef.current;
        const finalData = transform ? transform(result) : result;
        setData(finalData);

        if (onSuccessRef.current) onSuccessRef.current(finalData);

        return result;
      } catch (err) {
        const msg = err.response?.data?.message || errorMessage;
        setError(msg);

        if (onErrorRef.current) onErrorRef.current(msg);

        throw err;
      } finally {
        setLoading(false);
      }
    },
    [url, method, params, errorMessage, responseType, shared]
  );

  useEffect(() => {
    if (immediate && method === 'GET') {
      execute();
    }
  }, [immediate, method, execute]);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setLoading(false);
  }, []);

  return { data, loading, error, execute, reset, refetch: execute };
};

export default useApi;
