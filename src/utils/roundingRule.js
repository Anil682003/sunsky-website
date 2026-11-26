// =============================================================================
// roundingRule.js — HOW A SUNSKY SELLING PRICE IS ROUNDED (Pricing Rules → Pricing Logic).
//
// PURE and dependency-free on purpose: this exact file is copied VERBATIM into SunSkyCache
// (apps/external-ingestor/src/utils/roundingRule.js) and the website (src/utils/roundingRule.js),
// so a card price, the hotel page, the checkout's server check and the amount charged all round
// the same way. Change all three copies together (the tests in each repo pin the same table).
//
// A rule is { strategy, decimals }:
//   strategy  'ceil' (Always Round Up) | 'round' (Standard Round, .5 up) | 'floor' (Always Round
//             Down) | 'banker' (Banker's Rounding, .5 to even)
//   decimals  0 (whole euros) | 1 | 2 (cents)
//
// The amount is first settled TO THE CENT (float noise: 646.99999999 is € 647,00, never € 646,99
// or € 648), then rounded to the rule's unit. So with 2 decimals every strategy gives the cent
// itself, and LEGACY_RULE ({ ceil, 0 }) is exactly the whole-euro rounding-up SUNSKY used before
// Pricing Logic was connected (26 Nov 2026): Math.ceil(Math.round(x * 100) / 100).
// =============================================================================

export const STRATEGIES = Object.freeze(['ceil', 'round', 'floor', 'banker']);

/** What every price used before the menu was connected, and what an unreadable rule falls back to. */
export const LEGACY_RULE = Object.freeze({ strategy: 'ceil', decimals: 0 });

/** The rule names the Pricing Logic menu stores (rounding_rules.rule_name) → strategy. */
export const STRATEGY_OF_RULE_NAME = Object.freeze({
  'Standard Round': 'round',
  'Always Round Up': 'ceil',
  'Always Round Down': 'floor',
  "Banker's Rounding": 'banker',
});

/** PURE. A usable rule from anything (a stored row, an API answer); LEGACY for what is not one. */
export function normalizeRule(r) {
  const strategy = STRATEGIES.includes(r?.strategy) ? r.strategy : LEGACY_RULE.strategy;
  const d = Number(r?.decimals);
  const decimals = Number.isInteger(d) && d >= 0 && d <= 2 ? d : LEGACY_RULE.decimals;
  return { strategy, decimals };
}

/**
 * PURE. A selling price rounded under a rule. A missing or non-numeric amount comes back as it
 * was (never 0: a missing price must not become a free one).
 */
export function roundPrice(amount, rule = LEGACY_RULE) {
  if (amount == null || amount === '') return amount;
  const n = Number(amount);
  if (!Number.isFinite(n)) return amount;
  const { strategy, decimals } = normalizeRule(rule);
  if (n < 0) return -roundPrice(-n, { strategy: strategy === 'ceil' ? 'floor' : strategy === 'floor' ? 'ceil' : strategy, decimals });
  const cents = Math.round(n * 100);          // settled to the cent first
  const unit = 10 ** (2 - decimals);           // in cents: 100 (euros), 10, 1 (cents)
  const rest = cents % unit;
  const base = (cents - rest) / unit;
  let units;
  if (rest === 0) units = base;
  else if (strategy === 'ceil') units = base + 1;
  else if (strategy === 'floor') units = base;
  else if (strategy === 'round') units = 2 * rest >= unit ? base + 1 : base;
  else units = 2 * rest > unit ? base + 1 : 2 * rest < unit ? base : (base % 2 === 0 ? base : base + 1);
  return (units * unit) / 100;
}

export default { STRATEGIES, LEGACY_RULE, STRATEGY_OF_RULE_NAME, normalizeRule, roundPrice };
