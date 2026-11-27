// The information box's settings for one hotel (admin GET /hotel-availability/hotel-info): whether
// the box is live, the hotel transfer notice and the confirmed deposit. No supplier call behind it;
// the answer is cached a minute by the admin and remembered here per hotel. Any failure: no box.
import { useEffect, useState } from 'react';
import axiosInstance from '../services/axiosInstance';

const memo = new Map();

export function useHotelInfo({ hotelCode, supplier = null, destination = null, country = null, enabled = true } = {}) {
  const key = enabled && (hotelCode || destination || country)
    ? [hotelCode || '', supplier || '', destination || '', country || ''].join('|')
    : null;
  // The answer is kept with the key it belongs to, so a changed hotel or rate never shows the
  // previous one's box while its own answer is on its way.
  const [answer, setAnswer] = useState({ key: null, info: null });

  useEffect(() => {
    if (!key || memo.has(key)) return undefined;
    let alive = true;
    const params = {};
    if (hotelCode) params.hotelCode = String(hotelCode);
    if (supplier) params.supplier = String(supplier);
    if (destination) params.destination = String(destination);
    if (country) params.country = String(country);
    axiosInstance.get('/hotel-availability/hotel-info', { params, timeout: 8000 })
      .then(({ data }) => {
        const v = data?.success ? { live: !!data.live, notice: data.notice || null, deposit: data.deposit || null } : null;
        memo.set(key, v);
        // Re-render only when there is a box to show: while it is switched off (or the answer
        // failed) the page renders exactly as it did before this hook existed.
        if (alive && v?.live) setAnswer({ key, info: v });
      })
      .catch(() => { memo.set(key, null); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!key) return null;
  if (memo.has(key)) return memo.get(key);
  return answer.key === key ? answer.info : null;
}

export default useHotelInfo;
