// Which ticked departure airports have NO package at all in the next 12 months (Levent, 25 Nov 2026:
// "If the user selects an airport without any package, the search button has to be inactive.
// Check with Rijsel."). Asked of GET /flight-availability/feasibility/origins, which answers per
// airport SOME / NONE / UNKNOWN.
//
// Only NONE is proof. UNKNOWN, a failed request or a request still running all give `noPackage`
// null, and then nothing is blocked: unknown is not impossible (same rule as searchGate).
import { useEffect, useState } from 'react';
import axiosInstance from '../services/axiosInstance';

/** PURE. The airports the answer PROVES have no package, or null when the answer is not usable. */
export function noPackageOrigins(data, asked) {
  if (!data?.success || !data.origins || typeof data.origins !== 'object') return null;
  const out = new Set();
  for (const code of asked) {
    const st = data.origins[code]?.status;
    if (st === undefined) return null;   // an airport left unanswered: say nothing
    if (st === 'NONE') out.add(code);
  }
  return out;
}

/**
 * @param q  enabled, origins[], adults, children
 * @returns {{ noPackage: Set<string>|null, state: 'idle'|'loading'|'ok'|'error' }}
 */
export function useOriginPackages(q = {}) {
  const asked = q.enabled ? [...new Set((q.origins || []).filter(Boolean).map((o) => String(o).toUpperCase()))].sort() : [];
  const key = asked.length ? [asked.join(','), q.adults ?? '', q.children ?? ''].join('|') : '';
  const [answer, setAnswer] = useState({ key: '', noPackage: null, state: 'idle' });

  useEffect(() => {
    if (!key) return undefined;
    const ctrl = new AbortController();
    const params = { origins: asked.join(',') };
    if (q.adults != null) params.adults = q.adults;
    if (q.children != null) params.children = q.children;
    axiosInstance.get('/flight-availability/feasibility/origins', { params, signal: ctrl.signal })
      .then(({ data }) => {
        const noPackage = noPackageOrigins(data, asked);
        setAnswer({ key, noPackage, state: noPackage ? 'ok' : 'error' });
      })
      .catch(() => { if (!ctrl.signal.aborted) setAnswer({ key, noPackage: null, state: 'error' }); });
    return () => ctrl.abort();
    // `key` names every input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const current = !!key && answer.key === key;
  return {
    noPackage: current ? answer.noPackage : null,
    state: !key ? 'idle' : current ? answer.state : 'loading',
  };
}

export default useOriginPackages;
