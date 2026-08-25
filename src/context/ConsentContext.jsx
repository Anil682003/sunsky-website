import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import {
  parseConsent,
  buildRecord,
  consentCookie,
  allCategories,
  emptyCategories,
  OPTIONAL_PURPOSES,
} from '../utils/consentStore';

const ConsentContext = createContext(null);

/** Only send `Secure` where the browser will accept it, so localhost still works. */
const isSecure = () =>
  typeof window !== 'undefined' && window.location?.protocol === 'https:';

const readNow = () =>
  (typeof document === 'undefined' ? null : parseConsent(document.cookie));

/**
 * Who has agreed to what, for the whole app.
 *
 * READ SYNCHRONOUSLY, ON THE FIRST RENDER. `document.cookie` is synchronous, so the stored
 * decision is resolved inside the `useState` initialiser rather than in an effect. If it were
 * read in an effect there would be one render where consent looks absent — long enough to
 * flash the banner at somebody who decided months ago, and long enough for a gated component
 * to mount, unmount and mount again.
 */
export function ConsentProvider({ children }) {
  const [record, setRecord] = useState(readNow);
  // Shown when nothing valid is stored, or when the traveller reopens it from the footer.
  const [reopened, setReopened] = useState(false);

  const commit = useCallback((source, categories) => {
    const next = buildRecord(source, categories);
    if (typeof document !== 'undefined') {
      document.cookie = consentCookie(next, { secure: isSecure() });
    }

    // Anything that was ON and is now OFF has to actually stop, and a third party already
    // running in this tab cannot be called back — its script, its iframe and its cookies on
    // ITS domain are beyond our reach. A reload is the only honest way to make withdrawal
    // mean what it says. Consent that is merely "not renewed" is not withdrawn.
    const revoked = OPTIONAL_PURPOSES.some(
      (p) => record?.cat?.[p.key] === true && next.cat[p.key] !== true,
    );

    setRecord(next);
    setReopened(false);

    if (revoked && typeof window !== 'undefined') window.location.reload();
  }, [record]);

  const acceptAll = useCallback(() => commit('accept_all', allCategories()), [commit]);
  const rejectAll = useCallback(() => commit('reject_all', emptyCategories()), [commit]);
  const setCategories = useCallback((cats) => commit('granular', cats), [commit]);
  const withdraw = useCallback(() => commit('withdrawn', emptyCategories()), [commit]);
  const reopen = useCallback(() => setReopened(true), []);
  const close = useCallback(() => setReopened(false), []);

  const value = useMemo(() => ({
    // Kept in the API although it is always true today, so that moving this to a
    // server-rendered decision later does not change every call site.
    ready: true,
    decided: record !== null,
    record,
    // `necessary` is not a choice and is not stored; it is simply always on.
    has: (key) => (key === 'necessary' ? true : record?.cat?.[key] === true),
    open: record === null || reopened,
    reopened,
    acceptAll,
    rejectAll,
    setCategories,
    withdraw,
    reopen,
    close,
  }), [record, reopened, acceptAll, rejectAll, setCategories, withdraw, reopen, close]);

  return <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>;
}

export function useConsent() {
  const ctx = useContext(ConsentContext);
  if (!ctx) {
    throw new Error('useConsent must be used within ConsentProvider');
  }
  return ctx;
}
