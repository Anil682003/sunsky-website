import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from '../../../i18n';
import Marquee from './Marquee';

/**
 * The scrolling belt of promises across the top of the home page.
 *
 * It is a CMS field, but the value stored on this site is byte-for-byte the
 * English seed the code ships — nobody ever typed a marquee, the default just
 * sits in the database. Honouring that would freeze the belt in English on a
 * Dutch page, so an untouched seed is treated as "not set" and the translated
 * fallback shows instead. A marquee that says anything else is a real edit and
 * wins. These pin that distinction, because it is exactly the kind of rule that
 * looks redundant and gets "simplified" away.
 */

const ENGLISH_SEED = [
  'Best Price Guarantee',
  '10,000+ Holidays',
  'No Booking Fees',
  'Secure Payments',
  '24/7 Support',
  'Trusted by 2M+ Travelers',
  'Free Cancellation',
  'Award-Winning Service',
];

const hasText = (text) => screen.getAllByText(text).length > 0;

beforeAll(async () => {
  await i18n.changeLanguage('nl');
});

describe('the marquee', () => {
  it('shows the Dutch strip when the CMS marquee is empty', () => {
    render(<Marquee cms={{ marqueeItems: [] }} />);
    expect(hasText('Laagsteprijsgarantie')).toBe(true);
    expect(hasText('Geen boekingskosten')).toBe(true);
    // No English survives.
    expect(screen.queryByText('Best Price Guarantee')).toBeNull();
  });

  it('ignores a CMS marquee that is still the untouched English seed', () => {
    render(<Marquee cms={{ marqueeItems: ENGLISH_SEED }} />);
    // The stored English is the seed, so the reader still gets Dutch.
    expect(hasText('Laagsteprijsgarantie')).toBe(true);
    expect(screen.queryByText('Best Price Guarantee')).toBeNull();
  });

  it('honours a marquee SUNSKY has actually written', () => {
    render(<Marquee cms={{ marqueeItems: ['Onze eigen slogan', 'Nog een'] }} />);
    expect(hasText('Onze eigen slogan')).toBe(true);
    expect(hasText('Nog een')).toBe(true);
    // A real edit replaces the strip; the fallback must not bleed through.
    expect(screen.queryByText('Laagsteprijsgarantie')).toBeNull();
  });

  it('honours an edit even if it only changes one word of the seed', () => {
    const edited = [...ENGLISH_SEED];
    edited[0] = 'Best Price Promise';
    render(<Marquee cms={{ marqueeItems: edited }} />);
    // Length matches the seed but the content does not, so it is a real edit.
    expect(hasText('Best Price Promise')).toBe(true);
    expect(screen.queryByText('Laagsteprijsgarantie')).toBeNull();
  });
});
