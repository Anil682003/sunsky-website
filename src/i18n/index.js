import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import nlCommon from './locales/nl/common.json';
import nlFaq from './locales/nl/faq.json';

/* ═══════════════════════════════════════════════════════════════════════════
   Site language.

   SUNSKY is a Belgian agency selling to a Dutch-speaking market, and the client
   asked for the site to be Dutch throughout. So there is ONE language here and
   no switcher: `nl` is the language, not the default.

   ── why a library at all for one language ──
   The UI copy was hardcoded English across seventy-odd files while the legal
   pages, the footer and the cookie banner were already Dutch, so a Dutch visitor
   read Dutch legal text inside an English shell. Fixing that by typing Dutch into
   the JSX would work exactly once. Putting the strings here instead costs little
   more, collects them in one place a translator can read, and means adding a
   second language later is a JSON file rather than a rewrite of every page.

   ── how to convert a string ──
   Always pass the English text as the default:

       t('faq:title', 'Frequently Asked Questions')

   A key that has no Dutch yet then renders the English rather than the raw key,
   so a half-converted page is readable rather than covered in `faq.title`. That
   is what makes this safe to do page by page instead of in one enormous change.
   ═══════════════════════════════════════════════════════════════════════════ */

export const DEFAULT_LANGUAGE = 'nl';

/** Every language the site can serve. Adding 'en' here and a folder under
 *  locales/ is the whole job, plus showing a switcher. */
export const SUPPORTED_LANGUAGES = ['nl'];

/** What goes in <html lang> and og:locale. */
export const HTML_LANG = { nl: 'nl', en: 'en' };
export const OG_LOCALE = { nl: 'nl_BE', en: 'en_GB' };

/* Bundled rather than fetched. Two reasons: a translation that arrives after the
   first paint flashes English at the reader, and lazy namespaces need a Suspense
   boundary around the whole app for no benefit at this size. Revisit if a third
   language makes the bundle worth splitting. */
const resources = {
  nl: {
    common: nlCommon,
    faq: nlFaq,
  },
};

i18n.use(initReactI18next).init({
  resources,
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: SUPPORTED_LANGUAGES,
  defaultNS: 'common',
  ns: ['common', 'faq'],

  interpolation: {
    // React escapes everything it renders; escaping again turns an apostrophe
    // into &#39; on screen.
    escapeValue: false,
  },

  // A missing key returns '' by default in some setups, which silently blanks
  // the UI. Returning the key (or the supplied default) is louder and safer.
  returnNull: false,
  returnEmptyString: false,

  react: {
    // Resources are bundled, so nothing is ever pending and a Suspense boundary
    // would only add a way for the app to blank out.
    useSuspense: false,
  },

  // Loud in development, silent in production: a console full of missing keys is
  // how the remaining untranslated strings get found, and is no use to a
  // customer.
  debug: false,
  saveMissing: import.meta.env.DEV,
  missingKeyHandler: import.meta.env.DEV
    ? (lngs, ns, key) => {
        console.warn(`[i18n] missing ${ns}:${key} for ${lngs?.join(',')}`);
      }
    : undefined,
});

/** Keep <html lang> honest, so screen readers and Google read the right language. */
export function applyDocumentLanguage(lng = i18n.language) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = HTML_LANG[lng] || lng;
}

applyDocumentLanguage();
i18n.on('languageChanged', applyDocumentLanguage);

export default i18n;
