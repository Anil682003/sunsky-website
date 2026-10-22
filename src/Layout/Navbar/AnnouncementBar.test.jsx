import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import styles from './AnnouncementBar.module.css';
import AnnouncementBar from './AnnouncementBar';
import { announcementKey } from '../../utils/siteHeader';

// The strip above the header bar. It shows only when the server says it is live, it moves the
// bar down by publishing --announce-h on <html>, and a dismissal is remembered for THIS
// announcement only.

const DISMISS_KEY = 'sunsky.announcementDismissed';

const ann = (overrides = {}) => ({
  enabled: true,
  text: { nl: 'Herfstkorting: tot 15% korting', en: 'Autumn sale: up to 15% off' },
  linkLabel: { nl: 'Bekijk deals', en: 'See deals' },
  link: '/results?entry=last_minute',
  newTab: false,
  tone: 'orange',
  dismissible: true,
  startDate: '2026-10-01',
  endDate: '2026-11-30',
  showOn: 'all',
  live: true,
  ...overrides,
});

const show = (a) =>
  render(
    <MemoryRouter>
      <AnnouncementBar announcement={a} />
    </MemoryRouter>,
  );
const strip = () => screen.queryByRole('region', { name: 'Mededeling' });
const announceH = () => document.documentElement.style.getPropertyValue('--announce-h');

const realMatchMedia = window.matchMedia;
beforeEach(() => {
  localStorage.clear();
  document.documentElement.style.removeProperty('--announce-h');
});
afterEach(() => {
  window.matchMedia = realMatchMedia;
  vi.restoreAllMocks();
});

describe('AnnouncementBar', () => {
  it('shows the live announcement in the visitor\'s language, with its link', () => {
    show(ann());
    expect(strip()).toHaveTextContent('Herfstkorting: tot 15% korting');
    const link = screen.getByRole('link', { name: /Bekijk deals/ });
    expect(link).toHaveAttribute('href', '/results?entry=last_minute');
    expect(link).not.toHaveAttribute('target');
  });

  it('draws nothing, and moves nothing, when it is not live', () => {
    show(ann({ live: false }));
    expect(strip()).toBeNull();
    expect(announceH()).toBe('');
  });

  it('wears the chosen tone', () => {
    show(ann({ tone: 'green' }));
    expect(strip()).toHaveClass(styles.green);
    expect(strip()).toHaveAttribute('data-tone', 'green');
  });

  it('opens an outside link in a new tab, safely', () => {
    show(ann({ link: 'https://partner.test/deal', newTab: true }));
    const link = screen.getByRole('link', { name: /Bekijk deals/ });
    expect(link).toHaveAttribute('href', 'https://partner.test/deal');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('makes the sentence itself the link when there is no link label', () => {
    show(ann({ linkLabel: { nl: '', en: '' } }));
    expect(screen.getByRole('link', { name: 'Herfstkorting: tot 15% korting' })).toHaveAttribute('href', '/results?entry=last_minute');
  });

  it('pushes the bar down while it shows, and gives the room back when dismissed', async () => {
    show(ann());
    expect(announceH()).toBe('36px');
    await userEvent.click(screen.getByRole('button', { name: 'Mededeling sluiten' }));
    expect(strip()).toBeNull();
    expect(announceH()).toBe('');
  });

  it('remembers the dismissal for this announcement, not for the next one', async () => {
    const first = show(ann());
    await userEvent.click(screen.getByRole('button', { name: 'Mededeling sluiten' }));
    expect(localStorage.getItem(DISMISS_KEY)).toBe(announcementKey(ann()));
    first.unmount();

    show(ann());
    expect(strip()).toBeNull();

    // New words, or a new run of dates, is a new announcement.
    show(ann({ text: { nl: 'Winterdeals', en: 'Winter deals' } }));
    expect(strip()).toHaveTextContent('Winterdeals');
  });

  it('has no close button when the dashboard wants it to stay', () => {
    show(ann({ dismissible: false }));
    expect(screen.queryByRole('button', { name: 'Mededeling sluiten' })).toBeNull();
  });

  it('still shows, and still closes, when storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    show(ann());
    expect(strip()).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Mededeling sluiten' }));
    expect(strip()).toBeNull();
  });

  it('takes no room on a phone when it is desktop-only', () => {
    window.matchMedia = (query) => ({
      matches: query === '(max-width: 900px)', media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    });
    show(ann({ showOn: 'desktop' }));
    expect(strip()).toHaveClass(styles.onlyDesktop);
    expect(announceH()).toBe('0px');
  });

  it('a mobile-only strip takes no room on a desktop', () => {
    show(ann({ showOn: 'mobile' }));
    expect(strip()).toHaveClass(styles.onlyMobile);
    expect(announceH()).toBe('0px');
  });
});
