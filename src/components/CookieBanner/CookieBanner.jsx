import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import styles from './CookieBanner.module.css';
import { useConsent } from '../../context/ConsentContext';
import { useFooterConfig } from '../../api';
import { findLegalLink } from '../../utils/legalLinks';
import { CONTROLLER } from '../../utils/controller';
import {
  VISIBLE_PURPOSES,
  OPTIONAL_IN_USE,
  emptyCategories,
  inventoryFor,
} from '../../utils/consentStore';

/**
 * The cookie notice, in two layers.
 *
 * WHAT IT IS FOR. Nothing on this site may be stored on a visitor's device for a non-essential
 * purpose until they have said yes. Today there is exactly one such thing — the Trustpilot
 * widget, whose iframe writes a `TrustboxSplitTest_*` cookie and reports the page you are on
 * back to Trustpilot. Everything else the site stores (your session, your search, your party,
 * Stripe on the checkout) is strictly necessary and needs no permission.
 *
 * LAYER ONE is the banner: Alles weigeren, Voorkeuren instellen, Alles accepteren.
 * LAYER TWO is the settings screen: one toggle per optional category, off by default, with
 * Alles weigeren, Selectie opslaan and Alles accepteren underneath.
 *
 * WHY REJECT AND ACCEPT ARE THE SAME BUTTON. The client's first mockup had an outlined
 * "reject" beside a filled orange "accept". Colour-weighting the two choices is the nudge the
 * APD checklist names directly, and SUNSKY's own specification repeats it: the two must have
 * the same size, contrast and visual importance. "Voorkeuren instellen" sits between them and
 * is deliberately NOT one of them: it decides nothing, so it carries no consent weight.
 *
 * WHICH CATEGORIES APPEAR. Only the ones actually in use, which the specification requires
 * twice over and which `consentStore.js` drives through `inUse`. Today that is Noodzakelijke
 * plus Externe media. Adding analytics is one flag there, and its toggle appears here on its
 * own.
 *
 * WHAT IT DELIBERATELY IS NOT. Not a modal, and there is no close button on the first showing.
 * It does not trap focus and Escape does nothing. A visitor who ignores it is a visitor with no
 * consent, which is a perfectly lawful state to leave them in; an X that silently records "yes"
 * would not be.
 */
export default function CookieBanner() {
  const { open } = useConsent();
  // The card is a separate component because it calls useFooterConfig(), and hooks/useApi.js
  // does not cache: mounting it would fire a footer request on every page for the large
  // majority of visitors who decided long ago. Rendering null here costs nothing.
  if (!open) return null;
  return <CookieBannerCard />;
}

/**
 * The page's own bottom-pinned furniture, which the notice must sit ABOVE rather than on.
 * Both appear only on small screens: the hotel page's "Check price" bar and the checkout's
 * pay bar. Selectors rather than a shared variable because these are plain .css files that
 * predate this component and neither publishes its height.
 */
const BOTTOM_BAR_SELECTORS = '.mbar, .ck-mbar';

function CookieBannerCard() {
  const cardRef = useRef(null);
  // The notice outlives any one page — it stays until a decision is made — so the bar it has
  // to clear can appear on a page the traveller reaches LATER. Re-measuring per route is what
  // makes that work; measuring once at mount would only ever see the first page's furniture.
  const { pathname } = useLocation();

  // Measure whatever bar is showing and publish it, so the notice clears it instead of
  // covering the one button the page exists for. Layout effect, so the notice is never
  // painted in the wrong place first.
  useLayoutEffect(() => {
    const root = document.documentElement;
    const measure = () => {
      let lift = 0;
      for (const el of document.querySelectorAll(BOTTOM_BAR_SELECTORS)) {
        if (getComputedStyle(el).display === 'none') continue;
        lift = Math.max(lift, Math.round(el.getBoundingClientRect().height));
      }
      root.style.setProperty('--cookie-notice-lift', `${lift}px`);
    };
    measure();
    // The bars appear and disappear with the breakpoint, and grow when their content wraps.
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    if (ro) for (const el of document.querySelectorAll(BOTTOM_BAR_SELECTORS)) ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
      root.style.removeProperty('--cookie-notice-lift');
    };
  }, [pathname]);

  const { acceptAll, rejectAll, setCategories, reopened, decided, record, close } = useConsent();
  const { data: footer } = useFooterConfig();

  /* Reopened from the footer, the visitor pressed a control labelled "Cookie-instellingen", so
     that is what they get: the settings screen, showing the choices they made last time. On a
     first visit they get the banner. */
  const [showSettings, setShowSettings] = useState(() => reopened && decided);

  /* The draft the toggles edit. Nothing is committed until a button is pressed, which the
     specification states outright: everything stays unchanged until save, accept or reject. */
  const [draft, setDraft] = useState(() => draftFrom(record));

  // The real cookie-policy page out of the CMS, by label keyword — the same resolution the
  // checkout uses, so renaming that page in the dashboard never leaves a dead link here.
  const policyUrl = findLegalLink(footer, ['cookie'], '/p/privacy-legal#cookiebeleid');
  const internal = typeof policyUrl === 'string' && policyUrl.startsWith('/');

  // Reopened from the footer, the notice appears at the other end of the document — roughly
  // forty tab stops from where the traveller just pressed. A keyboard or screen-reader user
  // would have no idea anything happened. Focus follows the control they activated, but only
  // when they asked for it: stealing focus from someone who is reading the page on first load
  // would be its own kind of rude.
  useEffect(() => {
    if (reopened) cardRef.current?.focus();
  }, [reopened]);

  const policyLink = internal
    ? <Link className={styles.policy} to={policyUrl}>Cookiebeleid</Link>
    : <a className={styles.policy} href={policyUrl} target="_blank" rel="noreferrer">Cookiebeleid</a>;

  const toggle = (key) => setDraft((d) => ({ ...d, [key]: !d[key] }));

  return (
    <div className={styles.wrap} role="region" aria-label="Cookie-instellingen">
      {/* tabIndex -1 so it can take focus programmatically without joining the tab order. */}
      <div
        className={`${styles.card} ${showSettings ? styles.cardWide : ''}`}
        ref={cardRef}
        tabIndex={-1}
      >
        <div className={styles.head}>
          <span className={styles.glyph} aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5z" />
              <circle cx="9" cy="10" r="1.1" fill="currentColor" stroke="none" />
              <circle cx="14" cy="14.5" r="1.1" fill="currentColor" stroke="none" />
              <circle cx="8.5" cy="15.5" r="1" fill="currentColor" stroke="none" />
            </svg>
          </span>
          <h2 className={styles.title}>
            {showSettings ? 'Cookie-instellingen' : 'Jouw cookievoorkeuren'}
          </h2>
        </div>

        {showSettings ? (
          <>
            <div className={styles.body}>
              <p>
                Kies welke niet-noodzakelijke cookies SUNSKY mag gebruiken. Noodzakelijke
                cookies zijn altijd actief omdat de website of een door jou gevraagde functie
                anders niet correct werkt. Je kunt je keuze later altijd opnieuw wijzigen.
              </p>
            </div>

            <ul className={styles.cats}>
              {VISIBLE_PURPOSES.map((p) => (
                <li key={p.key} className={styles.cat}>
                  <div className={styles.catHead}>
                    <span className={styles.catLabel}>{p.label}</span>
                    {p.optional ? (
                      <label className={styles.switch}>
                        <input
                          type="checkbox"
                          checked={draft[p.key] === true}
                          onChange={() => toggle(p.key)}
                          aria-describedby={`cat-desc-${p.key}`}
                        />
                        <span className={styles.slider} aria-hidden="true" />
                        <span className={styles.srOnly}>{p.label} toestaan</span>
                      </label>
                    ) : (
                      <span className={styles.always}>Altijd actief</span>
                    )}
                  </div>
                  <p id={`cat-desc-${p.key}`} className={styles.catDesc}>{p.description}</p>

                  {/* The cookie list the specification asks for, per category: what is stored,
                      by whom, what for and for how long. */}
                  <ul className={styles.items}>
                    {inventoryFor(p.key).map((c) => (
                      <li key={c.name}>
                        <span className={styles.itemName}>{c.name}</span>
                        <span className={styles.itemMeta}>
                          {c.party} · {c.type} · {c.duration}
                        </span>
                        <span className={styles.itemPurpose}>{c.purpose}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>

            <div className={styles.links}>{policyLink}</div>

            <div className={styles.actions}>
              <button type="button" className={styles.btn} onClick={rejectAll}>
                Alles weigeren
              </button>
              <button
                type="button"
                className={styles.btnNeutral}
                onClick={() => setCategories(draft)}
              >
                Selectie opslaan
              </button>
              <button type="button" className={styles.btn} onClick={acceptAll}>
                Alles accepteren
              </button>
            </div>
          </>
        ) : (
          <>
            <div className={styles.body}>
              <p>
                SUNSKY gebruikt noodzakelijke cookies om de website goed en veilig te laten
                werken. Met jouw toestemming gebruiken we ook functionele en analytische
                cookies, marketingcookies en cookies voor externe media. Je kunt alles
                accepteren, alle niet-noodzakelijke cookies weigeren of zelf je voorkeuren
                instellen. Je kunt je keuze later altijd wijzigen via Cookie-instellingen
                onderaan de website.
              </p>
            </div>

            {/* Named controller, as the APD asks for in the first layer. Rendered only when the
                agency has actually told us who it is — a placeholder in this line would be
                worse than the line being absent. */}
            {CONTROLLER.name && (
              <p className={styles.controller}>
                Cookies worden geplaatst door {CONTROLLER.name}
                {CONTROLLER.enterpriseNumber ? ` (${CONTROLLER.enterpriseNumber})` : ''}, de
                uitbater van holidaybooking.be. In het Cookiebeleid staat elke dienst die de
                website gebruikt.
              </p>
            )}

            <div className={styles.links}>
              {policyLink}
              {/* Reopened over an existing decision, there has to be a way back out that
                  changes nothing. It needs `decided` as well as `reopened`: with no decision
                  stored the notice reopens itself the instant it closes, so the control would
                  do nothing at all. On the first showing there is deliberately no way out. */}
              {reopened && decided && (
                <button type="button" className={styles.cancel} onClick={close}>
                  Huidige keuze behouden
                </button>
              )}
            </div>

            {/* Weigeren first: reading order reaches it first, which can never be read as
                privileging acceptance. It and Alles accepteren are the same button in two
                places; the middle one decides nothing and is styled apart for that reason. */}
            <div className={styles.actions}>
              <button type="button" className={styles.btn} onClick={rejectAll}>
                Alles weigeren
              </button>
              <button
                type="button"
                className={styles.btnNeutral}
                onClick={() => {
                  // Opening the settings screen must not activate anything.
                  setDraft(draftFrom(record));
                  setShowSettings(true);
                }}
              >
                Voorkeuren instellen
              </button>
              <button type="button" className={styles.btn} onClick={acceptAll}>
                Alles accepteren
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** The draft the toggles start from: the visitor's stored choices, or everything off. */
function draftFrom(record) {
  const base = emptyCategories();
  for (const p of OPTIONAL_IN_USE) {
    if (record?.cat?.[p.key] === true) base[p.key] = true;
  }
  return base;
}
