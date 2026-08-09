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

/**
 * The field whose label starts with `label`. `root` may be an element to search inside OR an
 * already-filtered list of fields — the customer details span more than one card, so the
 * contact helpers pass a list ("every field that is not a traveller's") instead.
 */
export const fieldByLabel = (label, root = document) => {
  const want = label.toLowerCase();
  const fields = Array.isArray(root) ? root : [...root.querySelectorAll('.ck-field, .ck-tvf')];
  return fields.find((f) => labelOf(f).startsWith(want));
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

/**
 * The customer card — the person we contact about the booking.
 *
 * Scoped by what these fields are NOT — a traveller's — rather than by a layout class. The
 * customer details have been split across cards more than once, and every time they were, a
 * helper anchored on the first `.ck-boxed` silently started filling the wrong half.
 */
export const contactFields = () =>
  [...document.querySelectorAll('.ck-field, .ck-tvf')].filter((f) => !f.closest('.ck-trav'));

export const fillContact = ({
  firstName = 'Ali', lastName = 'Benli', email = 'ali@example.com',
  phone = '+32475123456', emergencyPhone = '+32476987654',
  street = 'Rue de la Loi', houseNumber = '42', postalCode = '1000', city = 'Brussels',
  country = true, nationality = true,
} = {}) => {
  // Names and nationality are SCOPED to the contact card — the traveller cards carry labels
  // with the same words. The address and the ways to reach the booker live in their own card
  // and are unique on the step, so they are found document-wide.
  const card = contactFields();
  fill('first name', firstName, card);
  fill('last name', lastName, card);
  fill('nationality', nationality, card);

  fill('street', street);
  fill('house no', houseNumber);
  fill('postal code', postalCode);
  fill('city', city);
  fill('country', country);
  fill('phone number', phone);
  fill('email', email);
  fill('emergency contact phone', emergencyPhone);
};

/** Company details, once "I am a business customer" is ticked. */
export const fillCompany = ({ name = 'SunSky Travel BV', vat = 'BE0123456789' } = {}) => {
  const card = contactFields();
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

/** The date-of-birth input inside a traveller card. False when the row arrived locked. */
export const setDob = (root, iso) => {
  const el = fieldByLabel('date of birth', root)?.querySelector('input[type="date"]');
  if (!el) return false;
  setValue(el, iso);
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
