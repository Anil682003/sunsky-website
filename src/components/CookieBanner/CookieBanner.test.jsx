import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import CookieBanner from './CookieBanner';
import { ConsentProvider } from '../../context/ConsentContext';
import { CONSENT_COOKIE, parseConsent } from '../../utils/consentStore';

// The notice is a legal control, not a piece of UI decoration. Most of these tests exist to
// catch a well-meaning redesign: making "reject" quieter than "accept", adding an X that
// silently records agreement, or turning a one-click refusal into a trip through a settings
// pane. Every one of those is a pattern the APD's cookie checklist names.

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

const renderBanner = () =>
  render(
    <MemoryRouter>
      <ConsentProvider><CookieBanner /></ConsentProvider>
    </MemoryRouter>,
  );

const banner = () => screen.queryByRole('region', { name: /cookie consent/i });

beforeEach(() => {
  clearCookies();
  footerConfig = null;
});

describe('a visitor who has not decided yet', () => {
  it('is shown the notice', () => {
    renderBanner();
    expect(banner()).toBeInTheDocument();
  });

  it('is told what is optional, and what happens if they say no', () => {
    renderBanner();
    expect(screen.getByRole('heading', { name: /cookies on holidaybooking\.be/i })).toBeInTheDocument();
    // Named, not "to improve your experience" — vague purposes are exactly what gets picked up.
    expect(banner().textContent).toMatch(/Trustpilot/);
    expect(banner().textContent).toMatch(/everything on the site keeps working/i);
  });

  it('can read the cookie policy without deciding anything first', () => {
    renderBanner();
    expect(screen.getByRole('link', { name: /cookie policy/i })).toBeInTheDocument();
    expect(readRecord()).toBeNull();
  });
});

describe('the two choices', () => {
  it('offers refusing and accepting, and nothing else', () => {
    renderBanner();
    const names = within(banner()).getAllByRole('button').map((b) => b.textContent.trim());
    // No X, no "manage", no "continue". An X that records acceptance is unlawful; one that
    // records nothing re-prompts on every page, which is its own kind of pressure.
    expect(names).toEqual(['Reject optional cookies', 'Accept all cookies']);
  });

  // The whole reason both buttons share one CSS class. Weighting accept with fill or colour
  // is the nudge the checklist calls out, and it is the first thing a redesign reaches for.
  it('gives refusing exactly the same weight as accepting', () => {
    renderBanner();
    const [reject, accept] = within(banner()).getAllByRole('button');
    expect(reject.className).toBe(accept.className);
  });

  it('reaches refusing first in reading and tab order', () => {
    renderBanner();
    const [first] = within(banner()).getAllByRole('button');
    expect(first).toHaveTextContent(/reject/i);
  });

  it('takes one click to refuse — never a detour through settings', async () => {
    const user = userEvent.setup();
    renderBanner();
    await user.click(screen.getByRole('button', { name: /reject optional cookies/i }));
    expect(banner()).not.toBeInTheDocument();
    expect(readRecord()).toMatchObject({ src: 'reject_all', cat: { reviews: false } });
  });

  it('takes one click to accept', async () => {
    const user = userEvent.setup();
    renderBanner();
    await user.click(screen.getByRole('button', { name: /accept all cookies/i }));
    expect(banner()).not.toBeInTheDocument();
    expect(readRecord()).toMatchObject({ src: 'accept_all', cat: { reviews: true } });
  });
});

describe('a visitor who already decided', () => {
  it('is not asked again', async () => {
    const user = userEvent.setup();
    const { unmount } = renderBanner();
    await user.click(screen.getByRole('button', { name: /reject optional cookies/i }));
    unmount();

    renderBanner();
    expect(banner()).not.toBeInTheDocument();
  });

  it('is asked again once the stored decision no longer matches what we do', () => {
    document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify({
      v: 1, pv: 1, ph: 'stale0', ts: new Date().toISOString(), src: 'accept_all', cat: { reviews: true },
    }))}; Path=/`;
    renderBanner();
    expect(banner()).toBeInTheDocument();
  });
});

describe('the shape of the notice', () => {
  // Deliberately not a modal: there is no obligation to block the page, and a blocking notice
  // that only offers "accept" is a cookie wall. A visitor who ignores it simply has no
  // consent, which is a lawful place to leave them.
  it('does not trap the visitor in a dialog', () => {
    renderBanner();
    expect(banner()).not.toHaveAttribute('aria-modal');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('is a named landmark, so it can be reached and skipped', () => {
    renderBanner();
    expect(banner().getAttribute('role')).toBe('region');
  });
});

describe('the cookie policy link', () => {
  it('follows the page the dashboard actually publishes', () => {
    footerConfig = {
      navigationSections: [
        { title: 'Privacy & Legal', links: [{ label: 'Cookie Policy', url: '/p/somewhere-else#cookies', active: true }] },
      ],
    };
    renderBanner();
    expect(screen.getByRole('link', { name: /cookie policy/i }))
      .toHaveAttribute('href', '/p/somewhere-else#cookies');
  });

  it('still goes somewhere sensible when the dashboard is unreachable', () => {
    renderBanner();
    expect(screen.getByRole('link', { name: /cookie policy/i }))
      .toHaveAttribute('href', '/p/privacy-legal#cookie-policy');
  });
});
