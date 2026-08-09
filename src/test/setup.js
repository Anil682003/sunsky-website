import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// `waitFor` and `findBy*` carry their OWN one-second budget, which vitest's testTimeout does
// not raise. These suites mount whole pages and wait on a fetch → state → render round trip;
// on a loaded machine that passes a second and the failure reads "unable to find role=button"
// — a missing element, not the slow clock that actually caused it. Five seconds is still
// short enough that a genuinely absent element fails fast.
configure({ asyncUtilTimeout: 5000 });

// jsdom implements neither of these, and Results uses both:
// IntersectionObserver drives infinite scroll, scrollIntoView is called on nav.
class MockIntersectionObserver {
  constructor(cb) { this.cb = cb; MockIntersectionObserver.instances.push(this); }
  observe(el) { this.el = el; }
  disconnect() {}
  unobserve() {}
  // Test hook: pretend the sentinel scrolled into view.
  static trigger() {
    for (const i of MockIntersectionObserver.instances) {
      if (i.el) i.cb([{ isIntersecting: true, target: i.el }]);
    }
  }
}
MockIntersectionObserver.instances = [];
globalThis.IntersectionObserver = MockIntersectionObserver;
globalThis.__IO__ = MockIntersectionObserver;

Element.prototype.scrollIntoView = vi.fn();

// Also absent from jsdom. ShareSheet reads it during render (not in an effect), so any test
// that mounts a page containing it throws before a single assertion runs. Reports desktop.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  });
}

afterEach(() => {
  cleanup();
  MockIntersectionObserver.instances = [];
  vi.clearAllMocks();
});
