/**
 * Cookie-consent record: reading it, writing it, and deciding when it has gone stale.
 *
 * PURE. No DOM, no `import.meta.env`, no Vite-only imports — it takes a cookie string in and
 * hands cookie strings back. That keeps it unit-testable without jsdom, and keeps it safe to
 * import from `server/index.js` if the OG server ever needs to read consent (the same rule
 * `utils/hotelImage.js` already lives by).
 *
 * WHY A COOKIE AND NOT localStorage. Two reasons specific to this site. The browser enforces a
 * cookie's expiry itself, so a date-comparison bug cannot leave a stale decision sitting there
 * invisibly; and only a cookie reaches the server, which matters because `server/index.js`
 * rewrites <head> before React ever runs.
 *
 * WHAT THE LAW BEHIND THIS IS. Belgium moved the cookie rule to Article 10/2 of the Act of 30
 * July 2018, which is what makes the APD competent; the operative design guidance is the APD's
 * Cookie Checklist of 20 October 2023, which is guidance and says so itself. There is no
 * standing Belgian banner decision at the time of writing — the two that are usually cited
 * (Mediahuis 113/2024, RTL 131/2024) were annulled and withdrawn respectively.
 */

export const CONSENT_COOKIE = 'sunsky_consent';

/** Shape of the stored record. Bump only when the fields themselves change. */
export const SCHEMA_VERSION = 1;

/**
 * Bump when the cookie policy changes materially — a new vendor, a new purpose, a changed
 * retention. Every visitor is then asked again, because a decision given against the old
 * description is not a decision about the new one.
 */
export const POLICY_VERSION = 2;

/**
 * 180 days. The APD calls six months "redelijk in beginsel" (reasonable in principle). It is
 * not a statutory cap and a longer term is not unlawful; this follows their guidance.
 */
export const MAX_AGE_DAYS = 180;
export const MAX_AGE_MS = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
const MAX_AGE_SECONDS = MAX_AGE_DAYS * 24 * 60 * 60;

/**
 * Every category the site can have, in the order the visitor sees them.
 *
 * The five are the ones named in SUNSKY's cookie specification. `inUse` is the important
 * field: the spec says twice to show only categories that are actually present and never to
 * display an empty one, so a category sits here dormant until the site really uses it. That
 * keeps the registry honest AND makes turning one on a one-line change rather than a UI job.
 *
 * TODAY exactly one optional category is in use: `external_media`, which is the Trustpilot
 * review widget. Its iframe writes a `TrustboxSplitTest_*` cookie and tells Trustpilot which
 * page you are on, which is precisely "an embed that sends data to another party". There is no
 * analytics, no tag manager and no marketing pixel anywhere in this codebase, so those three
 * categories would be empty boxes and are not shown.
 *
 * `necessary` is registered so the record is complete and auditable; it has no toggle, and
 * `has()` short-circuits it to true.
 *
 * Labels and descriptions are Dutch because the site is Dutch-only.
 */
export const PURPOSES = Object.freeze([
  Object.freeze({
    key: 'necessary',
    optional: false,
    inUse: true,
    label: 'Noodzakelijke cookies',
    description:
      'Beveiliging, sessie, boekingsstappen, inloggen, gevraagde betaalfuncties en het bewaren van je cookiekeuze.',
  }),
  Object.freeze({
    key: 'functional',
    optional: true,
    inUse: false,
    label: 'Functionele cookies',
    description:
      'Optionele voorkeuren of gemaksfuncties die niet strikt noodzakelijk zijn.',
  }),
  Object.freeze({
    key: 'analytics',
    optional: true,
    inUse: false,
    label: 'Analytische cookies',
    description: 'Bezoekersstatistieken, prestatiemeting en foutanalyse.',
  }),
  Object.freeze({
    key: 'marketing',
    optional: true,
    inUse: false,
    label: 'Marketingcookies',
    description: 'Advertenties, remarketing, profilering of marketingmeting.',
  }),
  Object.freeze({
    key: 'external_media',
    optional: true,
    inUse: true,
    label: 'Externe media',
    description:
      'Externe video’s, kaarten, social plugins of andere embeds die gegevens naar een andere partij sturen. Bij ons is dit de Trustpilot-reviewwidget.',
  }),
]);

export const OPTIONAL_PURPOSES = Object.freeze(PURPOSES.filter((p) => p.optional));

/** What the visitor is actually shown and asked about. */
export const VISIBLE_PURPOSES = Object.freeze(PURPOSES.filter((p) => p.inUse));
export const OPTIONAL_IN_USE = Object.freeze(PURPOSES.filter((p) => p.optional && p.inUse));

/**
 * A short stable hash of the optional categories ACTUALLY IN USE.
 *
 * This is the safety net for the mistake everyone makes: a developer adds a vendor, forgets to
 * bump POLICY_VERSION, and every existing visitor keeps a consent record that never mentioned
 * it. The hash changes the moment that list does, so the record stops validating and everyone
 * is asked again — automatically, without anyone having remembered anything.
 *
 * Hashed over the IN-USE set rather than all five on purpose. A dormant category was never put
 * to the visitor, so it is not part of what they agreed to; the day `inUse` flips to true a new
 * purpose genuinely starts, the hash moves, and everyone is re-asked. That is exactly what the
 * specification requires when a new purpose is added.
 */
export function purposeHash() {
  const src = OPTIONAL_IN_USE.map((p) => p.key).sort().join('|');
  // FNV-1a, 32-bit. Not cryptographic and does not need to be: it only has to change when the
  // input changes, and to produce the same value in every browser and in Node.
  let h = 0x811c9dc5;
  for (let i = 0; i < src.length; i++) {
    h ^= src.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0').slice(0, 6);
}

/** One cookie's value out of a `document.cookie`-style string, or null. */
export function readCookie(cookieString, name) {
  const target = `${name}=`;
  for (const part of String(cookieString || '').split(';')) {
    const bit = part.trim();
    if (bit.startsWith(target)) return bit.slice(target.length);
  }
  return null;
}

/** Every optional category in use set to false — what a refusal records. */
export function emptyCategories() {
  return Object.fromEntries(OPTIONAL_IN_USE.map((p) => [p.key, false]));
}

/**
 * Every optional category in use set to true — what "Alles accepteren" records.
 *
 * In-use only, because the specification is explicit: accepting all activates only the
 * categories and services the website actually uses. Writing `true` for a dormant category
 * would record consent for something nobody was asked about and nothing runs.
 */
export function allCategories() {
  return Object.fromEntries(OPTIONAL_IN_USE.map((p) => [p.key, true]));
}

/**
 * The stored decision, or null when there isn't a valid one and the banner must be shown.
 *
 * Null on ANY of: no cookie, unparseable, wrong schema, wrong policy version, wrong purpose
 * hash, older than 180 days. Every one of those fails toward ASKING AGAIN. Over-asking is a
 * small annoyance; under-asking means acting on consent nobody gave.
 */
export function parseConsent(cookieString, now = Date.now()) {
  const raw = readCookie(cookieString, CONSENT_COOKIE);
  if (!raw) return null;
  let rec;
  try {
    rec = JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }
  if (!rec || typeof rec !== 'object') return null;
  if (rec.v !== SCHEMA_VERSION) return null;
  if (rec.pv !== POLICY_VERSION) return null;
  if (rec.ph !== purposeHash()) return null;
  const ts = Date.parse(rec.ts);
  if (!Number.isFinite(ts)) return null;
  if (now - ts > MAX_AGE_MS) return null;
  if (!rec.cat || typeof rec.cat !== 'object') return null;
  return rec;
}

/**
 * A fresh record. `source` is how the decision was made — kept because the APD expects a
 * controller to be able to show HOW consent was obtained, not merely that it was.
 *
 * Nothing identifying goes in here. It is a cookie: it travels to the server on every request
 * and it is readable by any script on the origin.
 */
export function buildRecord(source, categories, now = Date.now()) {
  const cat = emptyCategories();
  for (const p of OPTIONAL_IN_USE) {
    if (categories && categories[p.key] === true) cat[p.key] = true;
  }
  return {
    v: SCHEMA_VERSION,
    pv: POLICY_VERSION,
    ph: purposeHash(),
    ts: new Date(now).toISOString(),
    src: source,
    cat,
  };
}

/** The cookie VALUE for a record (URI-encoded JSON). */
export function serializeConsent(record) {
  return encodeURIComponent(JSON.stringify(record));
}

/**
 * The full `Set-Cookie`-style string for a record.
 *
 * A REFUSAL IS STORED FOR EXACTLY AS LONG AS AN ACCEPTANCE. Remembering "yes" for six months
 * and "no" until the next page load is a nagging pattern, it is visible from outside in about
 * thirty seconds, and it undermines the claim that consent was freely given. There is one
 * Max-Age here on purpose, and a test asserts the two paths produce the same one.
 *
 * Not HttpOnly: the page itself has to read this to decide what to load.
 */
export function consentCookie(record, { secure = true } = {}) {
  return [
    `${CONSENT_COOKIE}=${serializeConsent(record)}`,
    'Path=/',
    `Max-Age=${MAX_AGE_SECONDS}`,
    'SameSite=Lax',
    secure ? 'Secure' : null,
  ].filter(Boolean).join('; ');
}

/** Expires the cookie immediately. */
export function clearedConsentCookie() {
  return `${CONSENT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

/**
 * What SUNSKY actually stores on the visitor's device, per category.
 *
 * Section 5 of the cookie specification: name, who sets it, category, purpose, duration. This
 * is the list the settings screen and the Cookiebeleid must show, and it has to MATCH what the
 * browser really holds — a list that disagrees with the network tab is worse than no list.
 *
 * Every entry below was read out of this codebase, not copied from a template. `party` is
 * 'SUNSKY' for first-party storage we set ourselves and the vendor name otherwise.
 *
 * Trustpilot's own retention is stated by Trustpilot, not by us, so it is marked as set by
 * them; if they publish a precise term, put it in `duration` here.
 */
export const COOKIE_INVENTORY = Object.freeze([
  Object.freeze({
    category: 'necessary',
    name: CONSENT_COOKIE,
    party: 'SUNSKY',
    type: 'Cookie',
    purpose: 'Bewaart je cookiekeuze, zodat we het niet telkens opnieuw vragen.',
    duration: `${MAX_AGE_DAYS} dagen`,
  }),
  Object.freeze({
    category: 'necessary',
    name: 'accessToken, refreshToken, user',
    party: 'SUNSKY',
    type: 'Local storage',
    purpose: 'Houdt je ingelogd en haalt je boekingen op in Mijn boeking.',
    duration: 'Tot je uitlogt of je browseropslag wist',
  }),
  Object.freeze({
    category: 'necessary',
    name: 'sunsky.lastSearch, sunsky:favDestCodes',
    party: 'SUNSKY',
    type: 'Local storage',
    purpose: 'Onthoudt je laatste zoekopdracht en bestemmingen, zodat je niet opnieuw hoeft te typen.',
    duration: 'Tot je je browseropslag wist',
  }),
  Object.freeze({
    category: 'necessary',
    name: '__stripe_mid, __stripe_sid',
    party: 'Stripe',
    type: 'Cookie',
    purpose: 'Verwerkt je betaling veilig en voorkomt fraude tijdens het afrekenen.',
    duration: 'Sessie tot 1 jaar (bepaald door Stripe)',
    recipient: 'Stripe Payments Europe, Ltd.',
  }),
  Object.freeze({
    category: 'external_media',
    name: 'TrustboxSplitTest_*',
    party: 'Trustpilot',
    type: 'Cookie',
    purpose: 'Toont de Trustpilot-reviewwidget en meet welke versie van de widget je ziet.',
    duration: 'Bepaald door Trustpilot',
    recipient: 'Trustpilot A/S',
  }),
]);

/** The inventory rows for one category, in display order. */
export const inventoryFor = (key) => COOKIE_INVENTORY.filter((c) => c.category === key);
