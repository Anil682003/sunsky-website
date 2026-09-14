import { describe, it, expect } from 'vitest';
import { resolveStaticPage } from './staticPageRouting';

/* /p/<slug> addresses are typed by hand into the footer CMS and the slug is not
   offered as a choice there, so it gets guessed from the link label. One link
   arrived as three different wrong spellings on three edits, each showing the
   visitor a "page not found" for a page that exists. These pin down what the
   resolver forgives, and just as importantly what it refuses. */

const PAGES = [
  { slug: 'about-sunsky', groupKey: 'information', sections: [{ heading: 'Contact' }] },
  {
    slug: 'terms-traveller-rights',
    groupKey: 'information',
    sections: [
      { heading: 'Bijzondere Reisvoorwaarden' },
      { heading: 'Herroepingsrecht' },
    ],
  },
  { slug: 'protection-insurance', groupKey: 'information', previousSlugs: ['insurance'], sections: [] },
];

const slugOf = (r) => r?.page?.slug ?? null;

describe('resolveStaticPage', () => {
  it('resolves the exact slug', () => {
    const r = resolveStaticPage(PAGES, 'terms-traveller-rights');
    expect(slugOf(r)).toBe('terms-traveller-rights');
    expect(r.anchor).toBeNull();
  });

  it('resolves a slug the page used to have', () => {
    expect(slugOf(resolveStaticPage(PAGES, 'insurance'))).toBe('protection-insurance');
  });

  it('forgives the wrong case', () => {
    expect(slugOf(resolveStaticPage(PAGES, 'Terms-Traveller-Rights'))).toBe('terms-traveller-rights');
  });

  /* The real footer edits that caused the 404s. */
  it('resolves a slug that names a section, and carries the anchor', () => {
    const r = resolveStaticPage(PAGES, 'Bijzondere-Reisvoorwaarden');
    expect(slugOf(r)).toBe('terms-traveller-rights');
    expect(r.anchor).toBe('bijzondere-reisvoorwaarden');
  });

  it('resolves a slug that is missing a leading word', () => {
    const r = resolveStaticPage(PAGES, 'traveller-rights');
    expect(slugOf(r)).toBe('terms-traveller-rights');
    expect(r.anchor).toBeNull();
  });

  /* The refusals matter more than the rescues: landing somebody on the wrong
     legal document is worse than telling them the page is not there. */
  it('refuses an address that matches nothing', () => {
    expect(resolveStaticPage(PAGES, 'does-not-exist')).toBeNull();
  });

  it('refuses an ambiguous section name rather than guessing', () => {
    const ambiguous = [
      { slug: 'page-a', sections: [{ heading: 'Contact' }] },
      { slug: 'page-b', sections: [{ heading: 'Contact' }] },
    ];
    expect(resolveStaticPage(ambiguous, 'contact')).toBeNull();
  });

  it('refuses an ambiguous near-miss rather than guessing', () => {
    const ambiguous = [
      { slug: 'terms-traveller-rights', sections: [] },
      { slug: 'general-traveller-rights', sections: [] },
    ];
    expect(resolveStaticPage(ambiguous, 'traveller-rights')).toBeNull();
  });

  it('prefers an exact match over a section of another page', () => {
    const pages = [
      { slug: 'contact', sections: [] },
      { slug: 'about', sections: [{ heading: 'Contact' }] },
    ];
    expect(slugOf(resolveStaticPage(pages, 'contact'))).toBe('contact');
  });

  it('handles an empty or missing slug and a missing page list', () => {
    expect(resolveStaticPage(PAGES, '')).toBeNull();
    expect(resolveStaticPage(PAGES, undefined)).toBeNull();
    expect(resolveStaticPage(null, 'about-sunsky')).toBeNull();
  });
});
