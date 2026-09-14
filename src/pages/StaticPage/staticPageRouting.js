/* ═══════════════════════════════════════════════════════════════════════════
   How a /p/<slug> address finds its page and its section.

   Kept out of StaticPage.jsx so it can be unit tested without mounting the page,
   and so the component file exports a component and nothing else.
   ═══════════════════════════════════════════════════════════════════════════ */

// Section anchors are derived from the CMS heading, so the footer can link
// straight to "Secure Online Payments" without storing an id alongside it.
export const slugifyHeading = (s) =>
  String(s ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const lower = (s) => String(s ?? '').toLowerCase().trim();

/**
 * Which section on this page an anchor means.
 *
 * Anchors are typed into the footer CMS by hand, so they do not always match
 * the id derived from the heading exactly. Three of the live footer's links
 * were dead for nothing more than a capital letter — "#Bankgegevens" against a
 * heading that yields "bankgegevens" — and a browser's own anchor matching is
 * case-sensitive, so the page simply stayed at the top with no sign anything
 * had gone wrong.
 *
 * Matching is therefore done on the slug of both sides rather than on the raw
 * text: case, punctuation and stray separators stop mattering, and a link
 * saved as "#Wettelijke vermeldingen", "#wettelijke-vermeldingen" or
 * "#Wettelijke--Vermeldingen" all find the same section.
 *
 * What it deliberately does NOT do is guess. An anchor naming a section that
 * is not on the page — a heading since renamed, or an anchor written in a
 * different language from the heading — returns null and the page opens at the
 * top, which is the honest outcome: scrolling to a nearby section instead would
 * show the reader confident, authoritative legal text that is not the text they
 * asked for.
 *
 * @param {string} hash     `location.hash`, with or without its '#'
 * @param {Array<{id: string}>} sectionIndex the page's sections, in order
 * @returns {string|null} the id to scroll to, or null if nothing matches
 */
export const resolveAnchor = (hash, sectionIndex) => {
  const raw = String(hash ?? '').replace(/^#/, '').trim();
  if (!raw || !Array.isArray(sectionIndex) || sectionIndex.length === 0) return null;

  // An id that matches outright wins, so a de-duplicated id such as
  // "bankgegevens-2" is never re-matched onto the first section of that name.
  const exact = sectionIndex.find((s) => s.id === raw);
  if (exact) return exact.id;

  const want = slugifyHeading(decodeURIComponent(raw));
  if (!want) return null;

  const loose = sectionIndex.find((s) => slugifyHeading(s.id) === want);
  return loose ? loose.id : null;
};

/**
 * Work out which page a /p/<slug> address means, forgivingly.
 *
 * These addresses are typed by hand into the footer CMS, and the slug is not
 * offered as a choice there, so it gets guessed from the link's label. The
 * "Bijzondere Reisvoorwaarden" link alone arrived here as
 * `/p/Bijzondere-Reisvoorwaarden`, `/p/bijzondere-reisvoorwaarden` and
 * `/p/traveller-rights` on three separate edits, and each one showed the
 * visitor "we couldn't find that page" for a page that exists.
 *
 * Every step after the first two is a LAST RESORT and must match exactly one
 * page, so a genuinely wrong address still 404s rather than landing somebody on
 * a legal document that is not the one they asked for. The caller redirects to
 * whatever comes back, so the address bar corrects itself.
 *
 * @returns {{page: object, anchor: string|null}|null}
 */
export const resolveStaticPage = (pages, slug) => {
  const list = Array.isArray(pages) ? pages : [];
  const want = lower(slug);
  if (!want) return null;

  const exact = list.find((p) => p?.slug === slug);
  if (exact) return { page: exact, anchor: null };

  // Every slug the page used to answer on, which the CMS records on rename.
  const previous = list.find((p) => (p?.previousSlugs ?? []).includes(slug));
  if (previous) return { page: previous, anchor: null };

  // Right slug, wrong case. The CMS always stores slugs lowercased.
  const sameIgnoringCase = list.filter((p) => lower(p?.slug) === want);
  if (sameIgnoringCase.length === 1) return { page: sameIgnoringCase[0], anchor: null };

  // The slug names a SECTION, not a page: the author linked the heading they
  // could see rather than the page holding it. Send them to the section.
  const sections = [];
  for (const p of list) {
    for (const s of p?.sections ?? []) {
      if (s?.heading && slugifyHeading(s.heading) === want) sections.push({ page: p, anchor: want });
    }
  }
  if (sections.length === 1) return sections[0];

  // A slug one whole word-boundary piece short, e.g. "traveller-rights" for
  // "terms-traveller-rights".
  const near = list.filter((p) => {
    const s = lower(p?.slug);
    return s && (s.endsWith(`-${want}`) || s.startsWith(`${want}-`));
  });
  if (near.length === 1) return { page: near[0], anchor: null };

  return null;
};
