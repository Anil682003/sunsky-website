import { describe, it, expect } from 'vitest';
import { resolveAnchor } from './staticPageRouting';

/* Footer anchors are typed by hand into the CMS beside a link whose target ids
   are derived from CMS headings, so the two drift apart. On the live footer of
   15 Sep 2026, three links were dead for nothing but a capital letter
   ("#Bankgegevens" against the id "bankgegevens") and landed the reader at the
   top of a long legal page with no sign anything had gone wrong.

   These pin down what the matcher forgives, and what it refuses: sending a
   reader to the wrong clause of a terms page is worse than not moving at all. */

// The real section ids of /p/terms-traveller-rights and /p/about-sunsky.
const TERMS = [
  { id: 'bijzondere-reisvoorwaarden' },
  { id: 'standaardinformatie-pakketreizen' },
  { id: 'herroepingsrecht' },
];
const ABOUT = [
  { id: 'over-sunsky' },
  { id: 'wettelijke-vermeldingen' },
  { id: 'bankgegevens' },
];

describe('resolveAnchor', () => {
  it('matches an anchor that is already exact', () => {
    expect(resolveAnchor('#herroepingsrecht', TERMS)).toBe('herroepingsrecht');
    expect(resolveAnchor('herroepingsrecht', TERMS)).toBe('herroepingsrecht');
  });

  it('forgives the capital letters that broke the live footer', () => {
    expect(resolveAnchor('#Bankgegevens', ABOUT)).toBe('bankgegevens');
    expect(resolveAnchor('#Wettelijke-vermeldingen', ABOUT)).toBe('wettelijke-vermeldingen');
  });

  it('forgives spaces and stray separators in a hand-typed anchor', () => {
    expect(resolveAnchor('#Wettelijke vermeldingen', ABOUT)).toBe('wettelijke-vermeldingen');
    expect(resolveAnchor('#wettelijke--vermeldingen', ABOUT)).toBe('wettelijke-vermeldingen');
    expect(resolveAnchor('#  bankgegevens  ', ABOUT)).toBe('bankgegevens');
  });

  it('decodes an anchor the browser has percent-encoded', () => {
    expect(resolveAnchor('#Wettelijke%20vermeldingen', ABOUT)).toBe('wettelijke-vermeldingen');
  });

  it('refuses to guess when the section is not on the page', () => {
    // "#right-of-withdrawal" against a Dutch heading: nothing here can turn one
    // into the other, and scrolling to a nearby clause instead would show the
    // reader authoritative legal text that is not the text they asked for.
    expect(resolveAnchor('#right-of-withdrawal', TERMS)).toBeNull();
    expect(resolveAnchor('#Disclaimer', ABOUT)).toBeNull();
    expect(resolveAnchor('#passport-visa-and-health-requirements', TERMS)).toBeNull();
  });

  it('keeps a de-duplicated id pointing at its own section', () => {
    // Two sections sharing a heading yield "x" and "x-2"; the second must not
    // be re-matched onto the first.
    const dupes = [{ id: 'bankgegevens' }, { id: 'bankgegevens-2' }];
    expect(resolveAnchor('#bankgegevens-2', dupes)).toBe('bankgegevens-2');
    expect(resolveAnchor('#bankgegevens', dupes)).toBe('bankgegevens');
  });

  it('answers null rather than throwing on nothing to match', () => {
    expect(resolveAnchor('', TERMS)).toBeNull();
    expect(resolveAnchor('#', TERMS)).toBeNull();
    expect(resolveAnchor(undefined, TERMS)).toBeNull();
    expect(resolveAnchor('#herroepingsrecht', [])).toBeNull();
    expect(resolveAnchor('#herroepingsrecht', undefined)).toBeNull();
  });
});
