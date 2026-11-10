// =============================================================================
// errorReporter.js — website errors sent to our backend (go-live, 1 Nov 2026).
//
// Until now a crash in the browser was invisible unless the customer told us. Every uncaught
// error, unhandled promise rejection and React render crash is POSTed to /api/client-errors,
// which writes one log line on the server. Short technical facts only: message, stack, page
// (without query string), checkout step and booking reference. Never form values or personal
// data. At most 10 reports per page load, each distinct message once.
// =============================================================================

import { BASE_URL } from './ip';

const API = (import.meta.env.VITE_API_URL || BASE_URL).replace(/\/+$/, '');
const MAX_PER_LOAD = 10;
const sent = new Set();
let count = 0;
let context = {};

/** What the page is doing right now (e.g. { step: 'checkout/payment', ref: 'SKY-123' }). */
export function setErrorContext(next) {
  context = { ...context, ...next };
}

export function reportError(error, extra = {}) {
  try {
    // A failed API call names its request (method + path, never the query string, which can
    // carry search details), so "Request failed with status code 500" can be traced.
    const req = error?.config?.url
      ? ` [${String(error.config.method || 'get').toUpperCase()} ${String(error.config.url).split('?')[0]}]`
      : '';
    const message = `${String(error?.message || error || '')}${req}`.slice(0, 300);
    if (!message || count >= MAX_PER_LOAD) return;
    const key = `${extra.kind || ''}|${message}`;
    if (sent.has(key)) return;
    sent.add(key);
    count += 1;
    const body = JSON.stringify({
      message,
      stack: String(error?.stack || '').split('\n').slice(0, 4).join(' | ').slice(0, 400),
      page: window.location.pathname,
      step: extra.step || context.step || '',
      ref: extra.ref || context.ref || '',
      kind: extra.kind || 'error',
    });
    fetch(`${API}/client-errors`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
  } catch { /* reporting must never break the page */ }
}

let installed = false;
export function installErrorReporting() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (e) => reportError(e.error || e.message, { kind: 'error' }));
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason, { kind: 'promise' }));
}
