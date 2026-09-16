import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TrustBar from './TrustBar';

// The guarantee bar. It shows the marks and links to the page that explains them — and it
// deliberately says nothing about them itself, because what the cover is worth is a claim
// only the agency and its insurer get to make.

let footerConfig = null;
let homepageConfig = null;
vi.mock('../../../api', () => ({
  useFooterConfig: () => ({ data: footerConfig, loading: false, error: null }),
  useHomepageConfig: () => ({ data: homepageConfig, loading: false, error: null }),
}));

// The marks' own links live on the dashboard's trust rows, at the offset the seals occupy.
const trustRows = (...marks) => ({
  trustItems: [{}, {}, {}, {}, ...marks],
});

const renderBar = () => render(<MemoryRouter><TrustBar /></MemoryRouter>);

beforeEach(() => { footerConfig = null; homepageConfig = null; });

describe('the guarantee bar', () => {
  it('shows both marks', () => {
    footerConfig = null;
    renderBar();
    expect(screen.getAllByRole('img')).toHaveLength(2);
  });

  it('names each mark for a reader who cannot see it', () => {
    footerConfig = null;
    renderBar();
    const alts = screen.getAllByRole('img').map((i) => i.getAttribute('alt'));
    expect(alts[0]).toMatch(/MSIG/);
    // Read as "WR" at a glance; it is VVR, the Flemish travel agents' association. Getting a
    // trade body's name wrong on a trust badge is the sort of error nobody catches later.
    expect(alts[1]).toMatch(/VVR/);
  });

  it('makes no claim of its own about what the cover pays', () => {
    footerConfig = null;
    const { container } = renderBar();
    expect(container.textContent).not.toMatch(/guaranteed|refund|compensat|100%|fully covered/i);
  });

  it('follows the dashboard to whichever page explains the cover', () => {
    footerConfig = {
      navigationSections: [
        // The agency's real label. Note it contains no "insurance" — keying on that word
        // would land on their travel-insurance page, which is a different thing entirely.
        { title: 'Protection & Insurance', links: [
          { label: 'Financial Protection and VVR Membership', url: '/p/somewhere#cover', active: true },
          { label: 'Travel and Cancellation Insurance', url: '/p/wrong-page', active: true },
        ] },
      ],
    };
    renderBar();
    expect(screen.getByRole('link', { name: /hoe je gedekt bent/i }))
      .toHaveAttribute('href', '/p/somewhere#cover');
  });

  it('still points somewhere sensible when the dashboard is unreachable', () => {
    footerConfig = null;
    renderBar();
    expect(screen.getByRole('link', { name: /hoe je gedekt bent/i }))
      .toHaveAttribute('href', '/p/protection-insurance');
  });
});

describe('the marks as links to the bodies they stand for', () => {
  // Set on the dashboard's trust rows, so the guarantee bar and the Trust section down the
  // page cannot disagree about where a seal goes.
  it('sends each mark to its own site, in a new tab', () => {
    homepageConfig = trustRows(
      { title: '', description: '', url: 'https://www.msig.example' },
      { title: '', description: '', url: 'https://www.vvr.be' },
    );
    renderBar();
    const marks = screen.getAllByRole('link').filter((a) => a.querySelector('img'));
    expect(marks).toHaveLength(2);
    expect(marks[1]).toHaveAttribute('href', 'https://www.vvr.be/');
    expect(marks[1]).toHaveAttribute('target', '_blank');
    expect(marks[1].getAttribute('rel')).toMatch(/noopener/);
  });

  // The agency has a site for VVR and may never get one for the insurer. A half-filled list
  // is the normal case, not an edge case.
  it('links only the marks that were given a URL', () => {
    homepageConfig = trustRows({}, { url: 'https://www.vvr.be' });
    renderBar();
    const marks = screen.getAllByRole('link').filter((a) => a.querySelector('img'));
    expect(marks).toHaveLength(1);
    expect(screen.getAllByRole('img')).toHaveLength(2);
  });

  it('leaves both marks unlinked when the dashboard is unreachable', () => {
    renderBar();
    expect(screen.getAllByRole('link').filter((a) => a.querySelector('img'))).toHaveLength(0);
    expect(screen.getAllByRole('img')).toHaveLength(2);
  });

  it('refuses a javascript: URL rather than putting it on a logo', () => {
    homepageConfig = trustRows({}, { url: 'javascript:alert(1)' });
    renderBar();
    expect(screen.getAllByRole('link').filter((a) => a.querySelector('img'))).toHaveLength(0);
  });

  // A trust row pointing at one of the agency's own pages should stay inside the app.
  it('keeps an internal path on the router instead of reloading the site', () => {
    homepageConfig = trustRows({}, { url: '/p/protection-insurance' });
    renderBar();
    const mark = screen.getAllByRole('link').find((a) => a.querySelector('img'));
    expect(mark).toHaveAttribute('href', '/p/protection-insurance');
    expect(mark).not.toHaveAttribute('target');
  });
});

/* The seals were files in the build until the dashboard could carry them, which made a renewed
   certificate or a rebranded association a developer job. These pin the upload path — and, more
   importantly, pin what must NOT happen: a new logo inheriting the words of the seal it
   replaced would tell a screen-reader user the site is insured by a company whose mark is no
   longer on the page. */
describe('a logo uploaded in the dashboard', () => {
  it('replaces the bundled seal on that row only', () => {
    homepageConfig = trustRows(
      { imageUrl: 'https://cdn.example/new-seal.png', imageAlt: 'Verzekerd 2027' },
      {},
    );
    renderBar();
    const imgs = screen.getAllByRole('img');
    expect(imgs[0]).toHaveAttribute('src', 'https://cdn.example/new-seal.png');
    expect(imgs[0]).toHaveAttribute('alt', 'Verzekerd 2027');
    // The untouched row still shows its bundled artwork.
    expect(imgs[1].getAttribute('alt')).toMatch(/VVR/);
  });

  it('never inherits the description of the seal it replaced', () => {
    homepageConfig = trustRows({ imageUrl: 'https://cdn.example/other.png' }, {});
    renderBar();
    expect(screen.getAllByRole('img')[0].getAttribute('alt')).not.toMatch(/MSIG/);
  });

  it('falls back to the row title when no description was written', () => {
    homepageConfig = trustRows(
      { imageUrl: 'https://cdn.example/other.png', title: 'Insolvency cover' },
      {},
    );
    renderBar();
    expect(screen.getAllByRole('img')[0]).toHaveAttribute('alt', 'Insolvency cover');
  });

  it('can be linked anywhere, the same as a bundled seal', () => {
    homepageConfig = trustRows(
      { imageUrl: 'https://cdn.example/other.png', imageAlt: 'Our insurer', url: 'https://insurer.example' },
      {},
    );
    renderBar();
    const mark = screen.getAllByRole('link').find((a) => a.querySelector('img'));
    expect(mark).toHaveAttribute('href', 'https://insurer.example/');
    expect(mark).toHaveAttribute('target', '_blank');
  });

  // The bar carries financial-protection marks; an empty one reads as "not covered".
  it('still shows both marks when the dashboard has uploaded nothing', () => {
    homepageConfig = trustRows({}, {});
    renderBar();
    expect(screen.getAllByRole('img')).toHaveLength(2);
  });
});
