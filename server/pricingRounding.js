// The admin's rounding rule (Pricing Rules → Pricing Logic), kept current on this server and
// written into every page as <meta name="sunsky-pricing-rounding" content='{"apply":true,...}'>
// (26 Nov 2026). The browser reads it synchronously (src/utils/pricingRounding.js), so prices are
// rounded the admin's way from the first render, with no extra request.
//
// Only a rule that is switched on is written. Off, never answered, or a failed read: no tag,
// and the page keeps the legacy whole-euro rounding. A failed read keeps the last rule known.

const REFRESH_MS = 60_000;
let current = null;   // { apply: true, strategy, decimals } or null
let timer = null;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** PURE. The <meta> tag for a rule as the admin answers it, or '' when it is not switched on. */
export function roundingMetaTag(rule) {
  if (!rule || rule.apply !== true) return '';
  const content = JSON.stringify({ apply: true, strategy: rule.strategy, decimals: rule.decimals });
  return `<meta name="sunsky-pricing-rounding" content="${esc(content)}">`;
}

/** PURE. The page with the tag before </head> (unchanged when there is no tag). */
export function withRoundingMeta(html, rule = current) {
  const tag = roundingMetaTag(rule);
  return tag ? String(html).replace(/[ \t]*<\/head>/i, `  ${tag}\n  </head>`) : html;
}

async function refresh(adminApi) {
  try {
    const r = await fetch(`${adminApi}/website/pricing-rounding`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(5_000) });
    if (!r.ok) return;
    const data = (await r.json())?.data;
    if (data && typeof data.apply === 'boolean') current = data.apply ? data : null;
  } catch { /* keep the last rule known */ }
}

export function startPricingRounding(adminApi) {
  if (timer) return;
  refresh(adminApi);
  timer = setInterval(() => refresh(adminApi), REFRESH_MS);
  timer.unref?.();
}

export const currentRoundingForTest = () => current;
