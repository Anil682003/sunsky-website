import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import nlCommon from './locales/nl/common.json';
import nlFaq from './locales/nl/faq.json';
import nlHome from './locales/nl/home.json';
import nlResults from './locales/nl/results.json';
import enCommon from './locales/en/common.json';
import enFaq from './locales/en/faq.json';
import enHome from './locales/en/home.json';
import enResults from './locales/en/results.json';

/* ═══════════════════════════════════════════════════════════════════════════
   Site language.

   SUNSKY is a Belgian agency selling to a Dutch-speaking market, so Dutch is the
   site's language and English is the alternative a visitor can choose. That is a
   different thing from "two equal languages": nothing detects, negotiates or
   guesses, and a first visit is always Dutch.

   ── why no browser detection ──
   Detection would hand an English-configured browser an English site by default,
   which is precisely the opposite of what was asked for. A Dutch site that can be
   switched is the brief; the switch is an explicit act, and it is remembered.

   ── how to convert a string ──
   Always pass the English text as the default:

       t('faq:title', 'Frequently Asked Questions')

   A key with no translation yet then renders that rather than a raw `faq.title`,
   so a half-converted page stays readable. That is what makes the rest of the
   site safe to convert page by page instead of in one enormous change.
   ═══════════════════════════════════════════════════════════════════════════ */

export const DEFAULT_LANGUAGE = 'nl';

/** Every language the site serves, in the order the switcher shows them. */
export const SUPPORTED_LANGUAGES = ['nl', 'en'];

/** What goes in <html lang> and og:locale. */
export const HTML_LANG = { nl: 'nl', en: 'en' };
export const OG_LOCALE = { nl: 'nl_BE', en: 'en_GB' };

/**
 * Where the visitor's choice is remembered.
 *
 * localStorage, not a cookie, and no consent gate. Choosing a language is a
 * feature the visitor explicitly asked for, which is the one case the cookie
 * specification allows to be treated as strictly necessary; it is listed as such
 * in the cookie inventory in utils/consentStore.js. It holds a two-letter code
 * and nothing else.
 */
const STORAGE_KEY = 'sunsky.lang';

/** The stored choice, or null. Never throws: private mode makes this inaccessible. */
export function readStoredLanguage() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return SUPPORTED_LANGUAGES.includes(v) ? v : null;
  } catch {
    return null;
  }
}

function storeLanguage(lng) {
  try {
    localStorage.setItem(STORAGE_KEY, lng);
  } catch {
    // A visitor who blocks storage simply gets Dutch again next time, which is
    // the site's language anyway. Not worth surfacing.
  }
}

/* Bundled rather than fetched. Two languages of UI copy is a few kilobytes, and a
   translation that arrives after the first paint flashes the other language at
   the reader. Revisit if a third language makes splitting worth it. */
const resources = {
  nl: { common: nlCommon, faq: nlFaq, home: nlHome, results: nlResults },
  en: { common: enCommon, faq: enFaq, home: enHome, results: enResults },
};

i18n.use(initReactI18next).init({
  resources,
  lng: readStoredLanguage() || DEFAULT_LANGUAGE,
  // Falls back to Dutch, not to English: a key missing from the English file
  // should show the site's own language rather than nothing.
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: SUPPORTED_LANGUAGES,
  defaultNS: 'common',
  ns: ['common', 'faq', 'home', 'results'],

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

/**
 * Keep the document honest about which language it is in.
 *
 * `<html lang>` is what a screen reader picks a voice from and what Google reads,
 * so it has to follow the switch rather than being set once at build time.
 */
export function applyDocumentLanguage(lng = i18n.language) {
  if (typeof document === 'undefined') return;
  const base = HTML_LANG[lng] || lng;
  document.documentElement.lang = base;
  const og = document.querySelector('meta[property="og:locale"]');
  if (og) og.setAttribute('content', OG_LOCALE[lng] || OG_LOCALE[DEFAULT_LANGUAGE]);
}

/** Switch language and remember it. Returns a promise resolving when applied. */
export function setLanguage(lng) {
  if (!SUPPORTED_LANGUAGES.includes(lng) || lng === i18n.language) return Promise.resolve();
  storeLanguage(lng);
  return i18n.changeLanguage(lng);
}

applyDocumentLanguage();
i18n.on('languageChanged', applyDocumentLanguage);

export default i18n;
