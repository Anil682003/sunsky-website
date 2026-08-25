import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TrustBar from './TrustBar';

// The guarantee bar. It shows the marks and links to the page that explains them — and it
// deliberately says nothing about them itself, because what the cover is worth is a claim
// only the agency and its insurer get to make.

let footerConfig = null;
vi.mock('../../../api', () => ({
  useFooterConfig: () => ({ data: footerConfig, loading: false, error: null }),
}));

const renderBar = () => render(<MemoryRouter><TrustBar /></MemoryRouter>);

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
    expect(screen.getByRole('link', { name: /how you are covered/i }))
      .toHaveAttribute('href', '/p/somewhere#cover');
  });

  it('still points somewhere sensible when the dashboard is unreachable', () => {
    footerConfig = null;
    renderBar();
    expect(screen.getByRole('link', { name: /how you are covered/i }))
      .toHaveAttribute('href', '/p/protection-insurance');
  });
});
