import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, act } from '@testing-library/react';

// The widget shows a real company's real reputation. The two things that must never happen
// are showing an invented rating where none exists, and loading Trustpilot's runtime before
// the visitor has agreed to it — its iframe writes a cookie and reports the page back.

const loadFromElement = vi.fn();

vi.mock('./loadTrustpilot', () => ({
  loadTrustpilot: () => Promise.resolve(true),
  unloadTrustpilot: () => {},
  __resetTrustpilotLoader: () => {},
}));

let consented = true;
let decided = true;
vi.mock('../../context/ConsentContext', () => ({
  useConsent: () => ({
    has: (k) => (k === 'necessary' ? true : consented),
    decided,
    reopen: () => {},
  }),
}));

// The config is a module of constants read from import.meta.env, so each test picks the
// configuration it needs and re-imports the component against it.
const withConfig = async (overrides) => {
  vi.resetModules();
  vi.doMock('./trustpilotConfig', () => ({
    BUSINESS_UNIT_ID: '',
    TRUSTPILOT_ENABLED: false,
    TEMPLATES: { microStar: 'tpl-micro-star', microCombo: 'tpl-combo', horizontal: 'tpl-horizontal' },
    DEFAULT_LOCALE: 'en-GB',
    REVIEW_URL: 'https://nl-be.trustpilot.com/review/holidaybooking.be',
    BOOTSTRAP_SRC: 'https://widget.trustpilot.com/bootstrap/v5/tp.widget.bootstrap.min.js',
    ...overrides,
  }));
  vi.doMock('./loadTrustpilot', () => ({
    loadTrustpilot: () => Promise.resolve(true),
    unloadTrustpilot: () => {},
    __resetTrustpilotLoader: () => {},
  }));
  vi.doMock('../../context/ConsentContext', () => ({
    useConsent: () => ({
      has: (k) => (k === 'necessary' ? true : consented),
      decided,
      reopen: () => {},
    }),
  }));
  return (await import('./Trustpilot')).default;
};

const CONFIGURED = {
  BUSINESS_UNIT_ID: '4f2c1a9b8d6e5f0a1b2c3d4e',
  TRUSTPILOT_ENABLED: true,
};

beforeEach(() => {
  consented = true;
  decided = true;
  loadFromElement.mockClear();
  window.Trustpilot = { loadFromElement };
});
afterEach(() => {
  delete window.Trustpilot;
  vi.resetModules();
});

describe('before the agency has a Trustpilot account', () => {
  // The client's hard requirement, and the most important assertion in this file: with no
  // business unit id there is no rating in the world to show, so nothing at all is drawn.
  // Not a frame, not a placeholder, not a specimen star row waiting to be swapped out.
  it('renders absolutely nothing', async () => {
    const Trustpilot = await withConfig({});
    const { container } = render(<Trustpilot />);
    expect(container).toBeEmptyDOMElement();
  });

  it('does not tell the visitor they are missing reviews that do not exist', async () => {
    consented = false;
    const Trustpilot = await withConfig({});
    const { container } = render(<Trustpilot />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('before the visitor has agreed to it', () => {
  it('renders a note instead of the widget, and never a blank hole', async () => {
    consented = false;
    const Trustpilot = await withConfig(CONFIGURED);
    render(<Trustpilot />);
    expect(screen.getByText(/reviews hidden/i)).toBeInTheDocument();
    expect(document.querySelector('.trustpilot-widget')).toBeNull();
  });

  // "Not decided yet" and "said no" both leave consent false, but only one of them is
  // something the visitor did. Telling a first-time visitor they declined — while the notice
  // is still on screen asking them — is a claim about their own actions that is simply false.
  it('does not tell a visitor who has decided nothing that they declined', async () => {
    consented = false;
    decided = false;
    const Trustpilot = await withConfig(CONFIGURED);
    render(<Trustpilot />);
    expect(screen.queryByText(/you declined/i)).not.toBeInTheDocument();
    expect(screen.getByText(/once you allow optional cookies/i)).toBeInTheDocument();
  });

  it('a host with no room for a sentence can render nothing instead', async () => {
    consented = false;
    const Trustpilot = await withConfig(CONFIGURED);
    const { container } = render(<Trustpilot showPlaceholder={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('offers a way to change that decision', async () => {
    consented = false;
    const Trustpilot = await withConfig(CONFIGURED);
    render(<Trustpilot />);
    expect(screen.getByRole('button', { name: /cookie settings/i })).toBeInTheDocument();
  });

  it('puts no third-party script in the document', async () => {
    consented = false;
    const Trustpilot = await withConfig(CONFIGURED);
    render(<Trustpilot />);
    expect(document.querySelectorAll('script[src*="trustpilot"]')).toHaveLength(0);
  });

  it('never calls into the Trustpilot runtime', async () => {
    consented = false;
    const Trustpilot = await withConfig(CONFIGURED);
    render(<Trustpilot />);
    await new Promise((r) => setTimeout(r, 0));
    expect(loadFromElement).not.toHaveBeenCalled();
  });
});

describe('once it is configured and permitted', () => {
  it('carries the three attributes the TrustBox constructor demands', async () => {
    const Trustpilot = await withConfig(CONFIGURED);
    const { container } = render(<Trustpilot />);
    const box = container.querySelector('.trustpilot-widget');
    expect(box).not.toBeNull();
    // Omitting data-locale makes the constructor throw a bare string with no stack, which is
    // an unpleasant thing to debug; it reads like a nicety and is not.
    expect(box.getAttribute('data-locale')).toBe('en-GB');
    expect(box.getAttribute('data-template-id')).toBe('tpl-micro-star');
    expect(box.getAttribute('data-businessunit-id')).toBe(CONFIGURED.BUSINESS_UNIT_ID);
  });

  // Trustpilot's own re-scan skips any container with no firstChild, and their teardown
  // empties the container before inserting the iframe — so this link has to be real HTML that
  // React does not think it owns. It is also what a visitor sees if an adblocker wins.
  it('ships a working link to the real profile inside the container', async () => {
    const Trustpilot = await withConfig(CONFIGURED);
    const { container } = render(<Trustpilot />);
    const a = container.querySelector('.trustpilot-widget > a');
    expect(a).not.toBeNull();
    expect(a.getAttribute('href')).toContain('trustpilot.com/review/holidaybooking.be');
    expect(a.getAttribute('rel')).toContain('noopener');
  });

  // Setting data-group is what attaches a session id and an expiry to every impression and
  // click the widget reports. Trustpilot's own FAQ example ships it; a copy-paste from there
  // would switch session-linked tracking on silently. This one line prevents that forever.
  it('does not opt the visitor into session-linked tracking', async () => {
    const Trustpilot = await withConfig(CONFIGURED);
    const { container } = render(<Trustpilot />);
    expect(container.querySelector('.trustpilot-widget').hasAttribute('data-group')).toBe(false);
  });

  it('asks Trustpilot to rebuild the widget rather than leave a stale one', async () => {
    const Trustpilot = await withConfig(CONFIGURED);
    render(<Trustpilot />);
    await new Promise((r) => setTimeout(r, 0));
    expect(loadFromElement).toHaveBeenCalled();
    // Without the second argument an already-rendered container is a no-op.
    expect(loadFromElement.mock.calls[0][1]).toBe(true);
  });

  // The free plan has no score widget, and Trustpilot answers a request for one by serving
  // its own logo with no rating on it — which would occupy the header saying nothing, and
  // link to trustpilot.com rather than the agency's profile. An empty template is how a host
  // says "the plan has nothing for this slot", and it must render nothing at all.
  it('renders nothing when the plan has no widget for that slot', async () => {
    const Trustpilot = await withConfig(CONFIGURED);
    const { container } = render(<Trustpilot template="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('accepts a raw Trustpilot template id, not just a known name', async () => {
    const Trustpilot = await withConfig(CONFIGURED);
    const { container } = render(<Trustpilot template="56278e9abfbbba0bdcd568bc" />);
    expect(container.querySelector('.trustpilot-widget').getAttribute('data-template-id'))
      .toBe('56278e9abfbbba0bdcd568bc');
  });

  it('lets a host pick a different template without touching this component', async () => {
    const Trustpilot = await withConfig(CONFIGURED);
    const { container } = render(<Trustpilot template="horizontal" />);
    expect(container.querySelector('.trustpilot-widget').getAttribute('data-template-id'))
      .toBe('tpl-horizontal');
  });

  // React 19 compares dangerouslySetInnerHTML BY REFERENCE. Built inline, the object is new
  // on every render, so React re-sets innerHTML and wipes out the iframe Trustpilot just put
  // there — permanently, because loadFromElement has already run. This is the test that keeps
  // the fallback object hoisted.
  it('survives a re-render without having its widget wiped out', async () => {
    const Trustpilot = await withConfig(CONFIGURED);
    function Host() {
      const [n, setN] = useState(0);
      return (
        <div>
          <button type="button" onClick={() => setN(n + 1)}>bump</button>
          <Trustpilot />
        </div>
      );
    }
    const { container } = render(<Host />);
    // Stand in for what Trustpilot does to the container once its script loads.
    container.querySelector('.trustpilot-widget').innerHTML = '<iframe title="tp"></iframe>';

    await act(async () => { container.querySelector('button').click(); });

    expect(container.querySelector('.trustpilot-widget iframe')).not.toBeNull();
  });

  it('keeps the host stylesheet in charge of its own slot', async () => {
    const Trustpilot = await withConfig(CONFIGURED);
    const { container } = render(<Trustpilot className="host-slot" />);
    expect(container.querySelector('.trustpilot-widget').className).toContain('host-slot');
  });
});
