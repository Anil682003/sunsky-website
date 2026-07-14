import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

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

afterEach(() => {
  cleanup();
  MockIntersectionObserver.instances = [];
  vi.clearAllMocks();
});
