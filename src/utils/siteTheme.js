// Website colours chosen in the dashboard (CMS > Homepage > Colours). The CMS stores
// { token: '#rrggbb' }; each token sets one or more CSS variables on <html>, and an empty or
// missing token leaves the built-in colour from index.css alone. The keys must match the
// admin's list (frontend/src/screens/CMS/Layout/HomepageSettings/themeColors.js).

const HEX = /^#[0-9a-fA-F]{6}$/;
const STORAGE_KEY = 'sunsky.siteTheme';

const mix = (hex, pct, other) => `color-mix(in srgb, ${hex} ${pct}%, ${other})`;

// Every CSS variable a theme can set, so clearing a token takes its colour away again.
export const THEME_VARS = [
  '--cta-grad', '--cta-ink', '--blue-deep', '--blue-mid', '--sun-orange',
  '--strip-bg', '--strip-ink', '--nav-bg', '--nav-ink', '--text', '--text-sec',
  '--dark', '--dark2', '--footer-bg', '--footer-ink', '--page-bg',
];

/** The CSS variables a stored theme sets. Pure, so it can be tested without a DOM. */
export function themeVariables(theme) {
  const t = {};
  for (const [k, v] of Object.entries(theme && typeof theme === 'object' ? theme : {})) {
    if (typeof v === 'string' && HEX.test(v)) t[k] = v;
  }
  const vars = {};
  // Buttons: the orange gradient. One colour picked keeps a gentle ramp from it.
  if (t.buttonFrom || t.buttonTo) {
    const from = t.buttonFrom || mix(t.buttonTo, 80, '#000');
    const to = t.buttonTo || mix(t.buttonFrom, 80, '#fff');
    vars['--cta-grad'] = `linear-gradient(135deg, ${from}, ${to})`;
  }
  if (t.buttonText) vars['--cta-ink'] = t.buttonText;
  if (t.primary) {
    vars['--blue-deep'] = t.primary;
    vars['--blue-mid'] = mix(t.primary, 85, '#fff');
  }
  if (t.accent) vars['--sun-orange'] = t.accent;
  if (t.stripBg) vars['--strip-bg'] = t.stripBg;
  if (t.stripText) vars['--strip-ink'] = t.stripText;
  if (t.navBg) vars['--nav-bg'] = mix(t.navBg, 92, 'transparent');
  if (t.navText) vars['--nav-ink'] = t.navText;
  if (t.headingText) vars['--text'] = t.headingText;
  if (t.bodyText) vars['--text-sec'] = t.bodyText;
  if (t.darkBg) {
    vars['--dark'] = t.darkBg;
    vars['--dark2'] = mix(t.darkBg, 88, '#fff');
  }
  if (t.footerBg) vars['--footer-bg'] = t.footerBg;
  if (t.footerText) vars['--footer-ink'] = t.footerText;
  if (t.pageBg) vars['--page-bg'] = t.pageBg;
  return vars;
}

/** Puts a theme on <html>, removing whatever a previous theme set and this one does not. */
export function applySiteTheme(theme, root = typeof document !== 'undefined' ? document.documentElement : null) {
  if (!root) return;
  const vars = themeVariables(theme);
  for (const name of THEME_VARS) {
    if (vars[name]) root.style.setProperty(name, vars[name]);
    else root.style.removeProperty(name);
  }
}

// The last theme seen, so the next visit paints in the right colours before the CMS answers.
export function rememberSiteTheme(theme) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(theme || {})); } catch { /* storage off */ }
}

export function storedSiteTheme() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; }
}
