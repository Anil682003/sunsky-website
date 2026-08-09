/**
 * Filling in the checkout, for tests that are about something else.
 *
 * Every checkout test needs a complete step-1 form before it can reach the behaviour it
 * actually asserts. Doing that by field POSITION made every one of them break the moment a
 * field moved — which is exactly what happened when the Private/Professional tabs became a
 * single form. These helpers find fields by their LABEL, so a reordered or renamed section
 * costs one line here instead of six test files.
 *
 * Values are set through the native setter React reads, not typed character by character:
 * typing is not what any of these tests is checking, and across a dozen fields it was most of
 * their wall clock. Clicks stay as real user events in the tests themselves.
 */

const setValue = (el, value) => {
  if (!el) return;
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
};

// Two field shapes on step 1: the contact card's boxed fields (label inside the frame) and
// the traveller cards' label-above fields. Both are found the same way — by their label.
const labelOf = (field) => (field.querySelector('.ck-label, .ck-tvf-label')?.textContent || '')
  .replace(/\*/g, '').trim().toLowerCase();

/** The field whose label starts with `label`, searched inside `root`. */
export const fieldByLabel = (label, root = document) => {
  const want = label.toLowerCase();
  return [...root.querySelectorAll('.ck-field, .ck-tvf')].find((f) => labelOf(f).startsWith(want));
};

/** Set one field by label. Selects take the first real option when given `true`. */
export const fill = (label, value, root = document) => {
  const el = fieldByLabel(label, root)?.querySelector('input, select, textarea');
  if (!el) throw new Error(`no checkout field labelled "${label}"`);
  if (el.tagName === 'SELECT' && value === true) {
    setValue(el, el.options[1]?.value ?? '');
    return el;
  }
  setValue(el, value);
  return el;
};

/** The customer card — the person we contact about the booking. */
export const fillContact = ({
  firstName = 'Ali', lastName = 'Benli', email = 'ali@example.com',
  phone = '+32475123456', country = true, nationality = true,
} = {}) => {
  const card = document.querySelector('.ck-boxed') || document;
  fill('first name', firstName, card);
  fill('last name', lastName, card);
  fill('email', email, card);
  fill('phone', phone, card);
  fill('nationality', nationality, card);
  fill('country', country, card);
};

/** Company details, once "I am a business customer" is ticked. */
export const fillCompany = ({ name = 'SunSky Travel BV', vat = 'BE0123456789' } = {}) => {
  const card = document.querySelector('.ck-boxed') || document;
  fill('company name', name, card);
  fill('vat number', vat, card);
};

/** One traveller card, by index. `dob` is skipped when the row arrived locked from the search. */
export const fillTraveller = (index, { firstName = 'Ali', lastName = 'Benli', dob = '1990-01-01', gender = 'MALE' } = {}) => {
  const card = [...document.querySelectorAll('.ck-trav')][index];
  if (!card) throw new Error(`no traveller card at index ${index}`);
  fill('first name', firstName, card);
  fill('last name', lastName, card);
  fill('nationality', true, card);
  // Gender is a pair of radios — a real click, because that is what drives the change.
  const radios = [...card.querySelectorAll('.ck-radio input[type="radio"]')];
  (gender === 'FEMALE' ? radios[1] : radios[0])?.click();
  // A child whose date of birth came from the search has no editable field until it is
  // unlocked — leave that one alone.
  if (dob) setDob(card, dob);
};

/** The day / month / year selects. Order matters: a date is emitted only once all three are set. */
export const setDob = (root, iso) => {
  const [y, m, d] = String(iso).split('-');
  const selects = [...(root.querySelector('.ck-dob3')?.querySelectorAll('select') || [])];
  if (selects.length !== 3) return false;
  setValue(selects[0], d);
  setValue(selects[1], m);
  setValue(selects[2], y);
  return true;
};

/** Contact + every traveller card on screen. */
export const fillStepOne = (opts = {}) => {
  fillContact(opts.contact);
  [...document.querySelectorAll('.ck-trav')].forEach((_, i) => {
    fillTraveller(i, (opts.travellers && opts.travellers[i]) || {});
  });
};

export default { fill, fieldByLabel, fillContact, fillCompany, fillTraveller, fillStepOne, setDob };
