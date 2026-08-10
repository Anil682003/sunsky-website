/**
 * Resolve the legal pages the checkout links to out of the CMS footer configuration.
 *
 * The checkout used to point at invented slugs — /p/terms-and-conditions,
 * /p/cancellation-costs — which were never CMS pages, so every "read the conditions" link on
 * the payment step was a dead end. The real pages already exist and the footer already links
 * to them; this finds them there, so the day someone renames or moves a policy in the
 * dashboard the checkout follows without a release.
 *
 * Matching is on the link LABEL, by keywords that all have to appear. Labels are editorial
 * text, so the fallback matters: if nothing matches, the caller's default is returned and the
 * link still goes somewhere sensible rather than nowhere.
 */

/** Every active link across the footer's navigation sections, flattened. */
function allLinks(footer) {
  const sections = footer?.navigationSections ?? footer?.sections ?? [];
  return sections
    .flatMap((s) => s?.links ?? [])
    .filter((l) => l && l.active !== false && l.label && l.url);
}

/**
 * First link whose label contains every keyword (case-insensitive), else `fallback`.
 * @param {object} footer  the CMS footer config
 * @param {string[]} keywords  all must appear in the label
 * @param {string} fallback  used when the CMS has no matching page
 */
export function findLegalLink(footer, keywords, fallback) {
  const wanted = keywords.map((k) => k.toLowerCase());
  const hit = allLinks(footer).find((l) => {
    const label = String(l.label).toLowerCase();
    return wanted.every((k) => label.includes(k));
  });
  return hit?.url || fallback;
}

/**
 * The four policies the payment step asks a traveller to accept, resolved against the CMS.
 * Keywords are chosen to match the labels the client actually uses in the dashboard today
 * ("General Travel Conditions", "Package Travel and Traveller Rights", …) while staying loose
 * enough to survive small edits.
 */
export function checkoutLegalLinks(footer) {
  return {
    terms:        findLegalLink(footer, ['general', 'travel', 'conditions'], '/p/terms-traveller-rights'),
    packageInfo:  findLegalLink(footer, ['package', 'travel'],               '/p/terms-traveller-rights'),
    insurance:    findLegalLink(footer, ['insurance'],                       '/p/protection-insurance'),
    cancellation: findLegalLink(footer, ['withdrawal'],                      '/p/terms-traveller-rights'),
  };
}
