import msigSeal from '../assets/insurance-msig-insolvency-2026.png';
import vvrMark from '../assets/insurance-vvr.png';

/**
 * The guarantee marks SUNSKY carries, as supplied by the agency.
 *
 * WHAT THEY ARE. Belgian package-travel law requires a travel business to hold insolvency
 * insurance, and VVR (Vereniging Vlaamse Reisbureaus, the Flemish travel agents' association)
 * arranges that cover for its members collectively through MSIG Europe SE. The two marks are
 * therefore one story: the association SUNSKY belongs to, and the insurer standing behind the
 * cover that membership brings. That is also how the agency's own footer already words it —
 * "Financial Protection and VVR Membership", on /p/protection-insurance.
 *
 * The second mark reads "WR" at a glance because the two V's are drawn as bare diagonals; it
 * is VVR. Checked against the association's own logo before it was labelled, because naming
 * the wrong trade body on a trust badge is exactly the sort of error nobody catches later.
 *
 * WHAT THEY MAY SAY. These are FINANCIAL PROTECTION claims, so nothing here says more than the
 * artwork itself does. The MSIG seal reads "Verzekerd tegen Insolventie · MSIG EUROPE · 2026",
 * so its caption says that and no more — not what the cover is worth, not what it pays out,
 * not when it applies. The dashboard's own trust-item text overrides everything here (see
 * Trust.jsx), which is where the agency writes the wording their insurer requires.
 *
 * `offset` is the position in the homepage trust grid where the marks begin. The dashboard's
 * trust list holds six entries and the last two were saved blank to hold these, so the marks
 * are positions 5 and 6 — indices 4 and 5.
 */
export const INSURANCE_MARKS = [
  {
    key: 'msig',
    img: msigSeal,
    // The seal's own words, for a reader who cannot see it.
    alt: 'Verzekerd tegen Insolventie — MSIG Europe, 2026',
    title: 'Insured against insolvency',
    desc: 'Covered with MSIG Europe for 2026.',
  },
  {
    key: 'vvr',
    img: vvrMark,
    alt: 'VVR — Vereniging Vlaamse Reisbureaus',
    title: 'VVR member',
    // Membership is a fact about the agency, not a promise about anyone's money, so it is the
    // one thing this mark can state on its own. What the membership protects is on the
    // agency's own protection page, which the trust bar links to.
    desc: 'Member of the Flemish travel agents’ association.',
  },
];

// Where in the trust grid the marks start (0-based).
INSURANCE_MARKS.offset = 4;

/** The marks as a plain list, for the trust bar — which shows them without captions. */
export const INSURANCE_MARK_LIST = INSURANCE_MARKS.slice();
