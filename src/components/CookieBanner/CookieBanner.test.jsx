import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import CookieBanner from './CookieBanner';
import { ConsentProvider } from '../../context/ConsentContext';
import {
  CONSENT_COOKIE,
  parseConsent,
  buildRecord,
  serializeConsent,
  allCategories,
} from '../../utils/consentStore';

/* The notice is a legal control, not UI decoration. Most of these exist to catch a
   well-meaning redesign: making "weigeren" quieter than "accepteren", adding an X that
   silently records agreement, pre-ticking a toggle, or showing a category the site does not
   actually use. Every one of those is named in SUNSKY's cookie specification and in the APD
   checklist behind it.

   The visitor-facing text is Dutch and is prescribed word for word by that specification, so
   these assert the Dutch strings deliberately. */

let footerConfig = null;
vi.mock('../../api', () => ({
  useFooterConfig: () => ({ data: footerConfig, loading: false, error: null }),
}));

const clearCookies = () => {
  for (const c of document.cookie.split(';')) {
    document.cookie = `${c.split('=')[0].trim()}=; Path=/; Max-Age=0`;
  }
};

const readRecord = () => parseConsent(document.cookie);

/** Put a previously stored decision in place, the way a returning visitor arrives. */
const storeDecision = (categories) => {
  const rec = buildRecord('accept_all', categories);
  document.cookie = `${CONSENT_COOKIE}=${serializeConsent(rec)}; Path=/`;
};

const renderBanner = () =>
  render(
    <MemoryRouter>
      <ConsentProvider><CookieBanner /></ConsentProvider>
    </MemoryRouter>,
  );

const banner = () => screen.queryByRole('region', { name: /cookie-instellingen/i });
const btn = (name) => screen.getByRole('button', { name });

beforeEach(() => {
  clearCookies();
  footerConfig = null;
});

describe('a visitor who has not decided yet', () => {
  it('is shown the notice', () => {
    renderBanner();
    expect(banner()).toBeInTheDocument();
  });

  it('is shown the prescribed Dutch first layer', () => {
    renderBanner();
    expect(screen.getByRole('heading', { name: 'Jouw cookievoorkeuren' })).toBeInTheDocument();
    expect(banner().textContent).toMatch(
      /SUNSKY gebruikt noodzakelijke cookies om de website goed en veilig te laten werken/,
    );
    expect(banner().textContent).toMatch(/Cookie-instellingen onderaan de website/);
  });

  it('can read the Cookiebeleid without deciding anything first', () => {
    renderBanner();
    expect(screen.getByRole('link', { name: /cookiebeleid/i })).toBeInTheDocument();
    expect(readRecord()).toBeNull();
  });

  /* "Closing the banner or continuing to browse is not consent." */
  it('records nothing until a button is pressed', async () => {
    renderBanner();
    await userEvent.click(screen.getByRole('heading', { name: 'Jouw cookievoorkeuren' }));
    expect(readRecord()).toBeNull();
  });
});

describe('the first layer', () => {
  it('offers exactly the three prescribed buttons', () => {
    renderBanner();
    const labels = within(banner()).getAllByRole('button').map((b) => b.textContent.trim());
    expect(labels).toEqual(['Alles weigeren', 'Voorkeuren instellen', 'Alles accepteren']);
  });

  /* Weighting one consent choice over the other is the nudge the rules forbid. The two are
     the same class; the middle button decides nothing so it is allowed to differ. */
  it('gives weigeren exactly the same weight as accepteren', () => {
    renderBanner();
    expect(btn('Alles weigeren').className).toBe(btn('Alles accepteren').className);
    expect(btn('Voorkeuren instellen').className).not.toBe(btn('Alles weigeren').className);
  });

  it('reaches weigeren first in reading and tab order', () => {
    renderBanner();
    const order = within(banner()).getAllByRole('button');
    expect(order[0]).toHaveTextContent('Alles weigeren');
  });

  it('takes one click to refuse, never a detour through settings', async () => {
    renderBanner();
    await userEvent.click(btn('Alles weigeren'));
    const rec = readRecord();
    expect(rec).not.toBeNull();
    expect(Object.values(rec.cat).every((v) => v === false)).toBe(true);
  });

  it('takes one click to accept', async () => {
    renderBanner();
    await userEvent.click(btn('Alles accepteren'));
    expect(readRecord().cat).toEqual(allCategories());
  });
});

describe('the settings screen', () => {
  const openSettings = async () => {
    renderBanner();
    await userEvent.click(btn('Voorkeuren instellen'));
  };

  it('opens without activating anything', async () => {
    await openSettings();
    expect(screen.getByRole('heading', { name: 'Cookie-instellingen' })).toBeInTheDocument();
    // Opening the screen is not a decision.
    expect(readRecord()).toBeNull();
  });

  it('shows the prescribed Dutch text and the three save buttons', async () => {
    await openSettings();
    expect(banner().textContent).toMatch(
      /Kies welke niet-noodzakelijke cookies SUNSKY mag gebruiken/,
    );
    const labels = within(banner()).getAllByRole('button').map((b) => b.textContent.trim());
    expect(labels).toEqual(['Alles weigeren', 'Selectie opslaan', 'Alles accepteren']);
  });

  it('locks Noodzakelijke on with Altijd actief and no toggle', async () => {
    await openSettings();
    expect(screen.getByText('Noodzakelijke cookies')).toBeInTheDocument();
    expect(screen.getByText('Altijd actief')).toBeInTheDocument();
    // One toggle per OPTIONAL category in use (analytics, marketing, external media) and
    // none for the necessary one, which is not a choice.
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
  });

  it('starts every optional category off', async () => {
    await openSettings();
    for (const box of screen.getAllByRole('checkbox')) expect(box).not.toBeChecked();
  });

  /* "Do not display an empty category." The site has no analytics, tag manager or marketing
     pixel, so those three categories must not be shown to anybody. */
  /**
   * Analytics and marketing joined the list when the GTM container went live. `functional`
   * is still dormant, and that is the assertion that keeps this test honest: the screen
   * shows what the site USES, not every category that exists in the registry.
   */
  it('shows only the categories the site actually uses', async () => {
    await openSettings();
    expect(screen.getByText('Externe media')).toBeInTheDocument();
    expect(screen.getByText('Analytische cookies')).toBeInTheDocument();
    expect(screen.getByText('Marketingcookies')).toBeInTheDocument();
    expect(screen.queryByText('Functionele cookies')).not.toBeInTheDocument();
  });

  it('lists what is stored, by whom and for how long', async () => {
    await openSettings();
    expect(banner().textContent).toMatch(/TrustboxSplitTest/);
    expect(banner().textContent).toMatch(/Trustpilot/);
    expect(banner().textContent).toMatch(/sunsky_consent/);
    expect(banner().textContent).toMatch(/180 dagen/);
  });

  it('changes nothing until Selectie opslaan is pressed', async () => {
    await openSettings();
    // The toggles follow the registry order: analytics, marketing, external media.
    const [analytics] = screen.getAllByRole('checkbox');
    await userEvent.click(analytics);
    expect(readRecord()).toBeNull();

    await userEvent.click(btn('Selectie opslaan'));
    expect(readRecord().cat.analytics).toBe(true);
  });

  /**
   * The point of a granular screen: accepting measurement must not quietly accept
   * advertising too. Ticking analytics alone saves analytics alone.
   */
  it('saves only what was selected', async () => {
    await openSettings();
    const [analytics] = screen.getAllByRole('checkbox');
    await userEvent.click(analytics);
    await userEvent.click(btn('Selectie opslaan'));

    const { cat } = readRecord();
    expect(cat.analytics).toBe(true);
    expect(cat.marketing).toBe(false);
    expect(cat.external_media).toBe(false);
  });

  it('saves a refusal when nothing is ticked', async () => {
    await openSettings();
    await userEvent.click(btn('Selectie opslaan'));
    const { cat } = readRecord();
    expect(cat.analytics).toBe(false);
    expect(cat.marketing).toBe(false);
    expect(cat.external_media).toBe(false);
  });
});

describe('a visitor who already decided', () => {
  it('is not asked again', () => {
    storeDecision(allCategories());
    renderBanner();
    expect(banner()).not.toBeInTheDocument();
  });

  it('is asked again once the stored decision no longer matches what we do', () => {
    const stale = buildRecord('accept_all', allCategories());
    stale.ph = 'stale00';
    document.cookie = `${CONSENT_COOKIE}=${serializeConsent(stale)}; Path=/`;
    renderBanner();
    expect(banner()).toBeInTheDocument();
  });
});

describe('the shape of the notice', () => {
  it('does not trap the visitor in a dialog', () => {
    renderBanner();
    expect(banner()).not.toHaveAttribute('aria-modal');
  });

  it('is a named landmark, so it can be reached and skipped', () => {
    renderBanner();
    expect(banner()).toBeInTheDocument();
  });

  it('offers no way to dismiss it without deciding', () => {
    renderBanner();
    const labels = within(banner()).getAllByRole('button').map((b) => b.textContent.trim());
    expect(labels).not.toContain('Huidige keuze behouden');
    expect(labels.join(' ')).not.toMatch(/sluiten|close|×/i);
  });
});
