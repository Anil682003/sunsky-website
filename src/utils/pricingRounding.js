// The rounding rule SUNSKY prices are rounded with on this page (Pricing Rules → Pricing Logic,
// 26 Nov 2026). The admin decides it (GET /api/website/pricing-rounding, PRICING_ROUNDING_APPLY);
// this site's own server re-reads it every minute and writes it into the page it sends as
// <meta name="sunsky-pricing-rounding">, so the very first render already rounds like the admin
// does when it re-checks and charges the price (server/pricingRounding.js).
//
// No tag (switch off, admin unreachable, tests): LEGACY_RULE, the whole-euro rounding up every
// price used before, to the last digit. The rule itself is roundingRule.js, a VERBATIM copy of
// the admin's services/pricing/roundingRule.js.
import { LEGACY_RULE, normalizeRule, roundPrice } from './roundingRule';

export const META_NAME = 'sunsky-pricing-rounding';

/** PURE. The rule a page's <meta> content names, or null (then: legacy). */
export function ruleFromMeta(content) {
  try {
    const v = JSON.parse(String(content || ''));
    return v && v.apply === true ? normalizeRule(v) : null;
  } catch {
    return null;
  }
}

const fromPage = () => {
  if (typeof document === 'undefined') return null;
  return ruleFromMeta(document.querySelector(`meta[name="${META_NAME}"]`)?.getAttribute('content'));
};

let state = (() => {
  const r = fromPage();
  return r ? { apply: true, rule: r } : { apply: false, rule: LEGACY_RULE };
})();

/** The rule every price on this page is rounded with. */
export const currentRoundingRule = () => state.rule;
export const roundingApplies = () => state.apply;

/** A SUNSKY selling price under the rule in force (legacy: up to a whole euro). */
export const roundSelling = (amount) => roundPrice(amount, state.rule);

/** Tests only. */
export const setRoundingRuleForTest = (rule) => { state = rule ? { apply: true, rule: normalizeRule(rule) } : { apply: false, rule: LEGACY_RULE }; };
