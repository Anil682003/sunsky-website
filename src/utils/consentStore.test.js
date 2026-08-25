import { describe, it, expect } from 'vitest';
import {
  CONSENT_COOKIE,
  SCHEMA_VERSION,
  POLICY_VERSION,
  MAX_AGE_DAYS,
  OPTIONAL_PURPOSES,
  purposeHash,
  parseConsent,
  buildRecord,
  serializeConsent,
  consentCookie,
  clearedConsentCookie,
  emptyCategories,
  allCategories,
} from './consentStore';

// The consent record is the evidence that a visitor agreed to something. Every test here is
// about one of two failure modes: acting on consent nobody gave, or treating a refusal as
// worth less than an acceptance.

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-08-25T12:00:00.000Z');

const cookieOf = (rec) => `${CONSENT_COOKIE}=${serializeConsent(rec)}`;

describe('reading a stored decision', () => {
  it('round-trips a record it wrote itself', () => {
    const rec = buildRecord('accept_all', allCategories(), NOW);
    expect(parseConsent(cookieOf(rec), NOW)).toEqual(rec);
  });

  it('finds its own cookie among others', () => {
    const rec = buildRecord('reject_all', emptyCategories(), NOW);
    const jar = `foo=1; ${cookieOf(rec)}; accessToken=abc`;
    expect(parseConsent(jar, NOW).src).toBe('reject_all');
  });

  it('asks again when there is no cookie at all', () => {
    expect(parseConsent('', NOW)).toBeNull();
    expect(parseConsent('other=1', NOW)).toBeNull();
  });

  it('asks again rather than throwing on a malformed value', () => {
    expect(parseConsent(`${CONSENT_COOKIE}=not-json`, NOW)).toBeNull();
    expect(parseConsent(`${CONSENT_COOKIE}=%7Bbroken`, NOW)).toBeNull();
  });
});

// Every one of these fails toward showing the banner again. Over-asking is an annoyance;
// under-asking means acting on permission that was never given for this thing.
describe('a decision that no longer covers what we do', () => {
  it('is ignored when the record shape has changed', () => {
    const rec = { ...buildRecord('accept_all', allCategories(), NOW), v: SCHEMA_VERSION + 1 };
    expect(parseConsent(cookieOf(rec), NOW)).toBeNull();
  });

  it('is ignored when the cookie policy has moved on', () => {
    const rec = { ...buildRecord('accept_all', allCategories(), NOW), pv: POLICY_VERSION - 1 };
    expect(parseConsent(cookieOf(rec), NOW)).toBeNull();
  });

  // The safety net for the mistake everyone makes: adding a vendor and forgetting to bump the
  // policy version. The hash changes on its own, so everyone is re-asked anyway.
  it('is ignored when the list of purposes has changed underneath it', () => {
    const rec = { ...buildRecord('accept_all', allCategories(), NOW), ph: 'deadbe' };
    expect(parseConsent(cookieOf(rec), NOW)).toBeNull();
  });

  it('is ignored once it is older than the retention period', () => {
    const rec = buildRecord('accept_all', allCategories(), NOW);
    const justInside = NOW + (MAX_AGE_DAYS - 1) * DAY;
    const justOutside = NOW + (MAX_AGE_DAYS + 1) * DAY;
    expect(parseConsent(cookieOf(rec), justInside)).not.toBeNull();
    expect(parseConsent(cookieOf(rec), justOutside)).toBeNull();
  });

  it('is ignored when it carries no timestamp to age', () => {
    const rec = { ...buildRecord('accept_all', allCategories(), NOW), ts: 'whenever' };
    expect(parseConsent(cookieOf(rec), NOW)).toBeNull();
  });
});

describe('what a decision records', () => {
  it('never stores an optional purpose as true unless it was chosen', () => {
    const rec = buildRecord('reject_all', emptyCategories(), NOW);
    for (const p of OPTIONAL_PURPOSES) expect(rec.cat[p.key]).toBe(false);
  });

  it('ignores keys that are not registered purposes', () => {
    const rec = buildRecord('granular', { reviews: true, nonsense: true }, NOW);
    expect(rec.cat.reviews).toBe(true);
    expect(rec.cat.nonsense).toBeUndefined();
  });

  it('does not store the non-optional purpose as a choice', () => {
    expect(buildRecord('accept_all', allCategories(), NOW).cat.necessary).toBeUndefined();
  });

  it('says how the decision was made, not merely that it was', () => {
    expect(buildRecord('withdrawn', emptyCategories(), NOW).src).toBe('withdrawn');
  });
});

describe('the cookie itself', () => {
  it('is scoped to the whole site and not sent cross-site', () => {
    const c = consentCookie(buildRecord('accept_all', allCategories(), NOW));
    expect(c).toContain('Path=/');
    expect(c).toContain('SameSite=Lax');
  });

  it('is only marked Secure where the browser would accept it', () => {
    const rec = buildRecord('accept_all', allCategories(), NOW);
    expect(consentCookie(rec, { secure: true })).toContain('Secure');
    expect(consentCookie(rec, { secure: false })).not.toContain('Secure');
  });

  // Remembering "yes" for six months and "no" until the next page load is a nagging pattern,
  // and it is visible from outside in about thirty seconds. If anyone ever tunes one of these
  // paths, this is the test that stops them.
  it('remembers a refusal for exactly as long as an acceptance', () => {
    const yes = consentCookie(buildRecord('accept_all', allCategories(), NOW));
    const no = consentCookie(buildRecord('reject_all', emptyCategories(), NOW));
    const maxAge = (s) => /Max-Age=(\d+)/.exec(s)[1];
    expect(maxAge(no)).toBe(maxAge(yes));
    expect(Number(maxAge(yes))).toBe(MAX_AGE_DAYS * 24 * 60 * 60);
  });

  it('can be expired', () => {
    expect(clearedConsentCookie()).toContain('Max-Age=0');
  });

  it('carries nothing that identifies anyone', () => {
    const value = decodeURIComponent(serializeConsent(buildRecord('accept_all', allCategories(), NOW)));
    expect(Object.keys(JSON.parse(value)).sort()).toEqual(['cat', 'ph', 'pv', 'src', 'ts', 'v']);
  });
});

describe('the purpose registry', () => {
  it('hashes stably, so nobody is re-asked for no reason', () => {
    expect(purposeHash()).toBe(purposeHash());
  });

  // A two-button banner is only fully granular while there is exactly ONE optional purpose:
  // then "per purpose" and "all" are the same set. Add a second (analytics, ads, a chat
  // widget) and the binary control starts bundling choices that must be separable — so this
  // test fails on purpose, to force the settings layer into the same change.
  it('has exactly one optional purpose, which is what makes the binary banner lawful', () => {
    expect(OPTIONAL_PURPOSES.map((p) => p.key)).toEqual(['reviews']);
  });
});
