import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Trust from './Trust';

// "Why book with Sunsky?" — four promises the agency writes in the dashboard, plus the two
// guarantee marks it actually holds. The dashboard's trust list has six slots and the last
// two were saved blank on purpose, to hold those marks; until they did, the live homepage
// rendered two empty dashed rectangles.

const promise = (n) => ({ title: `Promise ${n}`, description: `Because ${n}.` });
const blank = () => ({ title: '', description: '' });

const cardsWith = (trustItems) => {
  render(<Trust cms={{ trustItems }} />);
  // The cards are the grid's own children. Matching on the hashed class name would also
  // catch itemTitle and itemDesc inside each one.
  return document.querySelectorAll('[class*="grid"] > div');
};

describe('with nothing configured in the dashboard', () => {
  it('falls back to the four written-in promises', () => {
    render(<Trust cms={{}} />);
    // Dutch, because the site is Dutch and these four are shipped copy rather than
    // dashboard copy.
    expect(screen.getByText('Laagsteprijsgarantie')).toBeInTheDocument();
    expect(screen.getByText('Betrouwbare partners')).toBeInTheDocument();
  });

  // The marks belong to positions 5 and 6. With only four fallback cards there is no position
  // 5, so they must not appear — a seal in the wrong slot would caption the wrong promise.
  it('shows no guarantee marks at all', () => {
    render(<Trust cms={{}} />);
    expect(screen.queryAllByRole('img')).toHaveLength(0);
  });
});

describe('the two guarantee marks', () => {
  const six = [promise(1), promise(2), promise(3), promise(4), blank(), blank()];

  it('fill the two slots the dashboard left blank for them', () => {
    cardsWith(six);
    const imgs = screen.getAllByRole('img');
    expect(imgs).toHaveLength(2);
    expect(imgs[0]).toHaveAttribute('alt', expect.stringMatching(/MSIG/));
    expect(imgs[1]).toHaveAttribute('alt', expect.stringMatching(/VVR/));
  });

  it('are described for a reader who cannot see them', () => {
    cardsWith(six);
    // Never alt="" — these are informative, and one of them carries a year.
    for (const img of screen.getAllByRole('img')) {
      expect(img.getAttribute('alt')).toBeTruthy();
    }
  });

  it('let the dashboard word the cover, because the insurer decides that wording', () => {
    cardsWith([
      promise(1), promise(2), promise(3), promise(4),
      { title: 'Financially protected', description: 'Up to the full value of your trip.' },
      blank(),
    ]);
    expect(screen.getByText('Financially protected')).toBeInTheDocument();
    expect(screen.getByText('Up to the full value of your trip.')).toBeInTheDocument();
  });

  it('states only what the mark itself states when the dashboard is silent', () => {
    cardsWith(six);
    // Read off the seal's own artwork, and no further: not what the cover is worth, not what
    // it pays out. Anything more would be the website making a financial promise of its own.
    expect(screen.getByText('Insured against insolvency')).toBeInTheDocument();
    expect(screen.getByText(/MSIG Europe for 2026/)).toBeInTheDocument();
  });
});

describe('when the dashboard list is edited', () => {
  // The seals sit at positions 5 and 6 because that is where the blanks are today. Add a
  // promise at the top and position 5 becomes a real card — stamping an insolvency-insurance
  // seal onto it would have the page assert financial cover over unrelated marketing copy.
  it('never stamps a seal onto a card that has its own words', () => {
    cardsWith([
      { title: 'Newest promise', description: 'Added today.' },
      promise(1), promise(2), promise(3), promise(4), blank(), blank(),
    ]);
    const withMarks = [...document.querySelectorAll('[class*="grid"] > div')]
      .filter((c) => c.querySelector('img'));
    for (const card of withMarks) {
      expect(card.textContent).not.toMatch(/Promise|Newest/);
    }
  });

  it('would rather show no seal at all than the wrong one', () => {
    // Every slot filled: there is nowhere blank left, so neither seal appears. Visible and
    // harmless, which is the right way for this to fail.
    cardsWith([promise(1), promise(2), promise(3), promise(4), promise(5), promise(6)]);
    expect(screen.queryAllByRole('img')).toHaveLength(0);
  });
});

describe('a slot the dashboard left empty', () => {
  // This is the bug that was live: six configured items, two of them blank, rendered as two
  // empty dashed cards in the middle of the page.
  it('is not rendered as a blank card', () => {
    // Four items, the last one blank. Position 4 is before the marks begin, so there is
    // nothing to put there and the card should simply not exist.
    const cards = cardsWith([promise(1), promise(2), promise(3), blank()]);
    expect(cards).toHaveLength(3);
  });

  it('does not shift the marks out of their slots', () => {
    // A blank in the middle must not renumber positions 5 and 6 underneath the marks.
    cardsWith([promise(1), blank(), promise(3), promise(4), blank(), blank()]);
    const imgs = screen.getAllByRole('img');
    expect(imgs).toHaveLength(2);
    expect(imgs[0]).toHaveAttribute('alt', expect.stringMatching(/MSIG/));
  });
});

describe('making a seal clickable from the dashboard', () => {
  // The agency asked for the VVR mark to reach VVR's own site. The URL lives on the same trust
  // row the seal already occupies, so whoever writes a seal's caption also sets where it goes.
  const sealsWith = (url) =>
    cardsWith([promise(1), promise(2), promise(3), promise(4), { title: '', description: '', url }, blank()]);

  it('opens an external site in a new tab, with the referrer withheld', () => {
    sealsWith('https://www.vvr.be');
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://www.vvr.be/');
    expect(link).toHaveAttribute('target', '_blank');
    // noopener: a tab opened from here can otherwise navigate this one through window.opener.
    expect(link.getAttribute('rel')).toMatch(/noopener/);
    expect(link.getAttribute('rel')).toMatch(/noreferrer/);
  });

  it('links the seal itself, not the card, so the caption stays out of the link text', () => {
    sealsWith('https://www.vvr.be');
    const link = screen.getByRole('link');
    expect(link.querySelector('img')).toBeInTheDocument();
    expect(link.textContent).toBe('');
  });

  it('leaves a seal with no URL as a plain image', () => {
    sealsWith('');
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.getAllByRole('img')).toHaveLength(2);
  });

  // The CMS write endpoints are open on production, so a hostile value is a real input here,
  // not a hypothetical one. It must render as an unlinked seal rather than as something that
  // runs when a traveller clicks the logo.
  it('refuses a javascript: URL instead of putting it in an href', () => {
    sealsWith('javascript:alert(1)');
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.getAllByRole('img')).toHaveLength(2);
  });
});
