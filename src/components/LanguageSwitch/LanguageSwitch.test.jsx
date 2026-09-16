import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LanguageSwitch from './LanguageSwitch';
import i18n, { DEFAULT_LANGUAGE, setLanguage, readStoredLanguage } from '../../i18n';

/* Dutch is the site's language and English is the alternative a visitor can
   choose. The things that must hold: a first visit is always Dutch, the choice
   is remembered, and the control says which language you are currently reading
   rather than only offering the other one. */

const btn = (code) => screen.getByRole('button', { name: new RegExp(code, 'i') });
const codes = () => screen.getAllByRole('button').map((b) => b.textContent.trim());

beforeEach(async () => {
  localStorage.clear();
  await i18n.changeLanguage(DEFAULT_LANGUAGE);
});

afterEach(async () => {
  localStorage.clear();
  await i18n.changeLanguage(DEFAULT_LANGUAGE);
});

describe('the language switch', () => {
  it('offers both languages and marks the one being read', () => {
    render(<LanguageSwitch />);
    expect(codes()).toEqual(['NL', 'EN']);
    expect(btn('Nederlands')).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: /English/i })).not.toHaveAttribute('aria-current');
  });

  /* The visible label is a two-letter code, which a screen reader announces as
     two letters. The full language name goes on the accessible name instead. */
  it('names the languages properly for a screen reader', () => {
    render(<LanguageSwitch />);
    expect(screen.getByRole('button', { name: 'Nederlands' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Overschakelen naar English/ })).toBeInTheDocument();
  });

  it('switches the whole interface and remembers the choice', async () => {
    const user = userEvent.setup();
    render(<LanguageSwitch />);

    await user.click(screen.getByRole('button', { name: /Overschakelen naar English/ }));

    expect(i18n.language).toBe('en');
    expect(readStoredLanguage()).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    // The control itself is now in English.
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-current', 'true');
  });

  it('switches back', async () => {
    const user = userEvent.setup();
    render(<LanguageSwitch />);
    await user.click(screen.getByRole('button', { name: /Overschakelen naar English/ }));
    await user.click(screen.getByRole('button', { name: /Switch to Nederlands/ }));

    expect(i18n.language).toBe('nl');
    expect(document.documentElement.lang).toBe('nl');
  });

  it('keeps og:locale in step, so a shared link previews in the right language', async () => {
    const meta = document.createElement('meta');
    meta.setAttribute('property', 'og:locale');
    meta.setAttribute('content', 'nl_BE');
    document.head.appendChild(meta);

    await setLanguage('en');
    expect(meta.getAttribute('content')).toBe('en_GB');

    await setLanguage('nl');
    expect(meta.getAttribute('content')).toBe('nl_BE');
    meta.remove();
  });

  it('does not detect the browser language: a first visit is always Dutch', () => {
    // Nothing stored, so the site's own language stands regardless of what the
    // browser would prefer.
    expect(readStoredLanguage()).toBeNull();
    expect(i18n.language).toBe('nl');
  });

  it('ignores a stored language the site does not serve', () => {
    localStorage.setItem('sunsky.lang', 'fr');
    expect(readStoredLanguage()).toBeNull();
  });

  it('survives storage being unavailable', async () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error('denied'); };
    try {
      await setLanguage('en');
      // The switch still happened; only remembering it failed.
      expect(i18n.language).toBe('en');
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
