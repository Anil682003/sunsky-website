// useDepartureAirports — the §25 departure master list, fetched from admin and cached
// once per session, with the label registry kept in sync so airportCity()/airportLabel()
// resolve any admin-added airport. Optionally checks which airports have a real flight to the
// searched destination when { destination, checkIn } are supplied.
//
// An airport with no flight there is NOT removed from the list (spec 3.7). It stays visible and
// the caller marks it unavailable with a reason, because a choice that silently vanishes cannot
// be understood or undone. Only a proven "no flight" (`available[code] === false`) counts:
// while the check runs, when it fails, or when the flight cache has nothing for the route,
// `validity` says so and nothing is marked unavailable.
import { useEffect, useState } from 'react';
import { fetchDepartureAirports } from '../api/filters';
import { setDepartureAirports, getDepartureAirports } from '../utils/airports';

// Module-level cache: the master list is the same for everyone and rarely changes, so it is
// fetched once and shared across every picker on the site.
let _masterCache = null;
let _inflight = null;

function loadMaster() {
  if (_masterCache) return Promise.resolve(_masterCache);
  if (_inflight) return _inflight;
  // The whole call is guarded: a missing/failing airports API must degrade to the seed,
  // never crash a picker. (Wrapping catches even a synchronous throw, e.g. a test mock that
  // doesn't provide this export.)
  try {
    _inflight = Promise.resolve(fetchDepartureAirports())
      .then(({ airports }) => {
        if (airports?.length) setDepartureAirports(airports);   // feed the label registry
        _masterCache = getDepartureAirports();
        return _masterCache;
      })
      .catch(() => { _masterCache = getDepartureAirports(); return _masterCache; })
      .finally(() => { _inflight = null; });
    return _inflight;
  } catch {
    _masterCache = getDepartureAirports();
    return Promise.resolve(_masterCache);
  }
}

export function useDepartureAirports({ destination, checkIn, checkOut, adults } = {}) {
  const [airports, setAirports] = useState(getDepartureAirports());
  const [available, setAvailable] = useState(null); // { CODE: boolean } or null (unknown)
  // 'idle' (nothing to check) | 'checking' | 'ok' (available is proven) | 'unknown' (the flight
  // cache holds nothing for the route) | 'error' (the check failed). Only 'ok' may disable.
  const [validity, setValidity] = useState('idle');

  // 1) master list, once
  useEffect(() => {
    let live = true;
    loadMaster().then((list) => { if (live && list) setAirports([...list]); });
    return () => { live = false; };
  }, []);

  // 2) §26 validity for the current destination + dates. All setState happens inside the async
  // `run()` (never synchronously in the effect body), so a destination change resets validity
  // without a cascading render.
  useEffect(() => {
    let live = true;
    const ctrl = new AbortController();
    const run = async () => {
      if (!destination || !checkIn) { if (live) { setAvailable(null); setValidity('idle'); } return; }
      if (live) { setAvailable(null); setValidity('checking'); }
      try {
        const { airports: annotated, cacheHasData } = await fetchDepartureAirports(
          { destination, checkIn, checkOut, adults }, { signal: ctrl.signal },
        );
        if (!live) return;
        if (!cacheHasData) { setAvailable(null); setValidity('unknown'); return; }  // no data: disable nothing
        const map = {};
        for (const a of annotated) map[a.code] = a.available !== false;
        setAvailable(map);
        setValidity('ok');
      } catch (e) {
        // An aborted check was replaced by a newer one, which owns the state now.
        if (live && e?.name !== 'AbortError' && e?.code !== 'ERR_CANCELED') { setAvailable(null); setValidity('error'); }
      }
    };
    run();
    return () => { live = false; ctrl.abort(); };
  }, [destination, checkIn, checkOut, adults]);

  // Every active airport, always. The caller greys out the ones `available` proves have no
  // flight, instead of this hook hiding them.
  return {
    airports,
    popular: airports.filter((a) => a.popular),
    other: airports.filter((a) => !a.popular),
    available: validity === 'ok' ? available : null,
    validity,
    loading: !_masterCache,
  };
}
