import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '../../i18n';

let consentOpen = false;
vi.mock('../../context/ConsentContext', () => ({ useConsent: () => ({ open: consentOpen }) }));

const { default: SiteSwitch } = await import('./SiteSwitch');
const { siteToOffer, siteOfHost } = await import('./siteSwitchRules');

const setHost = (hostname) => {
  Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, hostname, assign: vi.fn() } });
};
const answer = (country) => { globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ country }) })); };
const renderAt = (path = '/hotel/123?checkIn=2027-05-01') => render(<MemoryRouter initialEntries={[path]}><SiteSwitch /></MemoryRouter>);

beforeEach(() => { consentOpen = false; window.localStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('which site to offer', () => {
  it('the other country only', () => {
    expect(siteToOffer('NL', 'BE')).toBe('BE');
    expect(siteToOffer('BE', 'NL')).toBe('NL');
    expect(siteToOffer('BE', 'BE')).toBeNull();
    expect(siteToOffer('BE', 'DE')).toBeNull();
    expect(siteToOffer('BE', null)).toBeNull();
    expect(siteToOffer(null, 'NL')).toBeNull();
    expect(siteOfHost('www.sunsky.nl')).toBe('NL');
    expect(siteOfHost('holidaybooking.be')).toBeNull();
  });
});

describe('the question (Levent, 24 Nov 2026)', () => {
  it('a Belgian visitor on sunsky.nl is offered sunsky.be, on the same page', async () => {
    setHost('www.sunsky.nl');
    answer('BE');
    const user = userEvent.setup();
    renderAt();
    await user.click(await screen.findByRole('button', { name: /sunsky\.be/i }));
    expect(window.location.assign).toHaveBeenCalledWith('https://www.sunsky.be/hotel/123?checkIn=2027-05-01');
  });

  it('staying is remembered: not asked again', async () => {
    setHost('www.sunsky.be');
    answer('NL');
    const user = userEvent.setup();
    const { unmount } = renderAt('/');
    await user.click(await screen.findByRole('button', { name: /sunsky\.be/i }));   // "Stay on sunsky.be"
    expect(screen.queryByRole('dialog')).toBeNull();
    unmount();
    globalThis.fetch.mockClear();
    renderAt('/');
    await new Promise((r) => setTimeout(r, 50));
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('never in checkout, never while the cookie notice is open, never for its own country', async () => {
    setHost('www.sunsky.nl');
    answer('BE');
    renderAt('/checkout');
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('dialog')).toBeNull();

    consentOpen = true;
    renderAt('/');
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('dialog')).toBeNull();

    consentOpen = false;
    answer('NL');
    renderAt('/');
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('not on any other host (holidaybooking.be, localhost): nothing is even asked', async () => {
    setHost('holidaybooking.be');
    answer('NL');
    renderAt('/');
    await new Promise((r) => setTimeout(r, 50));
    expect(globalThis.fetch).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
