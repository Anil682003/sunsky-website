import { useState, useRef, useEffect, useId } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation, Trans } from 'react-i18next';
import {
  ArrowLeft, ArrowRight, Box, BriefcaseBusiness, Building2, Calendar, ChevronDown, Eye, EyeOff,
  Globe, House, Languages, Lock, Mail, MapPin, Phone, ReceiptText, Shield, Tag, Users,
} from 'lucide-react';
import { useBrandLogo } from '../../hooks/useBrandLogo';
import styles from './Register.module.css';
import LanguageMenu from './LanguageMenu';
import { useRegister, sendRegistrationCode } from '../../api';
import { useToast } from '../../context/ToastContext';
import { countryName } from '../../utils/countryName';
import { flagUrl } from '../../utils/countryFlag';
import i18n from '../../i18n';
import RegisterVerify from './RegisterVerify';

/* The option lists below are the dashboard's lists, verbatim. Registrations
   land in the same tables agents type into, so the values have to match or a
   web signup shows up blank in the admin's dropdowns. */

const NATIONALITIES = [
  'American', 'Australian', 'Austrian', 'Belgian', 'Brazilian', 'British',
  'Canadian', 'Chinese', 'Czech', 'Danish', 'Dutch', 'Finnish', 'French',
  'German', 'Greek', 'Hungarian', 'Indian', 'Irish', 'Italian', 'Japanese',
  'Korean', 'Mexican', 'Norwegian', 'Polish', 'Portuguese', 'Romanian',
  'Russian', 'Spanish', 'Swedish', 'Swiss', 'Turkish', 'Ukrainian',
].sort();

const LANGUAGES = [
  'Arabic', 'Chinese', 'Danish', 'Dutch', 'English', 'Finnish',
  'French', 'German', 'Greek', 'Hungarian', 'Italian', 'Japanese',
  'Korean', 'Norwegian', 'Polish', 'Portuguese', 'Romanian',
  'Russian', 'Spanish', 'Swedish', 'Turkish', 'Ukrainian',
].sort();

const COUNTRIES = [
  'Austria', 'Belgium', 'Brazil', 'Canada', 'China', 'Czech Republic',
  'Denmark', 'Finland', 'France', 'Germany', 'Greece', 'Hungary',
  'India', 'Ireland', 'Italy', 'Japan', 'Mexico', 'Netherlands',
  'Norway', 'Poland', 'Portugal', 'Romania', 'Russia', 'South Korea',
  'Spain', 'Sweden', 'Switzerland', 'Turkey', 'Ukraine',
  'United Kingdom', 'United States',
].sort();

// Values are the DB enum, unchanged by language; labels are computed at render time so a
// language switch relabels the dropdown without touching what gets sent.
const genderOptions = () => [
  { value: 'MALE', label: i18n.t('auth:gender.male', 'Male') },
  { value: 'FEMALE', label: i18n.t('auth:gender.female', 'Female') },
  { value: 'OTHER', label: i18n.t('auth:gender.other', 'Other') },
  { value: 'PREFER_NOT_TO_SAY', label: i18n.t('auth:gender.preferNotToSay', 'Prefer not to say') },
];

const PHONE_CODES = [
  { code: '32', name: 'Belgium' },
  { code: '31', name: 'Netherlands' },
  { code: '33', name: 'France' },
  { code: '49', name: 'Germany' },
  { code: '44', name: 'United Kingdom' },
  { code: '1', name: 'US / Canada' },
  { code: '34', name: 'Spain' },
  { code: '39', name: 'Italy' },
  { code: '351', name: 'Portugal' },
  { code: '41', name: 'Switzerland' },
  { code: '43', name: 'Austria' },
  { code: '352', name: 'Luxembourg' },
  { code: '353', name: 'Ireland' },
  { code: '45', name: 'Denmark' },
  { code: '46', name: 'Sweden' },
  { code: '47', name: 'Norway' },
  { code: '358', name: 'Finland' },
  { code: '48', name: 'Poland' },
  { code: '420', name: 'Czech Republic' },
  { code: '36', name: 'Hungary' },
  { code: '30', name: 'Greece' },
  { code: '40', name: 'Romania' },
  { code: '359', name: 'Bulgaria' },
  { code: '385', name: 'Croatia' },
  { code: '386', name: 'Slovenia' },
  { code: '7', name: 'Russia' },
  { code: '380', name: 'Ukraine' },
  { code: '90', name: 'Turkey' },
  { code: '971', name: 'UAE' },
  { code: '966', name: 'Saudi Arabia' },
  { code: '91', name: 'India' },
  { code: '92', name: 'Pakistan' },
  { code: '880', name: 'Bangladesh' },
  { code: '94', name: 'Sri Lanka' },
  { code: '86', name: 'China' },
  { code: '81', name: 'Japan' },
  { code: '82', name: 'South Korea' },
  { code: '60', name: 'Malaysia' },
  { code: '65', name: 'Singapore' },
  { code: '66', name: 'Thailand' },
  { code: '62', name: 'Indonesia' },
  { code: '63', name: 'Philippines' },
  { code: '84', name: 'Vietnam' },
  { code: '61', name: 'Australia' },
  { code: '64', name: 'New Zealand' },
  { code: '55', name: 'Brazil' },
  { code: '52', name: 'Mexico' },
  { code: '27', name: 'South Africa' },
  { code: '20', name: 'Egypt' },
  { code: '212', name: 'Morocco' },
  { code: '216', name: 'Tunisia' },
  { code: '213', name: 'Algeria' },
];

// The value stored (and sent to the dashboard) stays the exact English demonym/name above;
// only what the dropdown SHOWS is translated.
const nationalityLabel = (n) => i18n.t(`auth:nationalities.${n.toLowerCase()}`, n);
const languageLabel = (l) => i18n.t(`auth:languages.${l.toLowerCase()}`, l);

// Country names reuse the same countryName()/Intl.DisplayNames helper as Checkout — one ISO
// code decides the word, so nobody retypes thirty country names by hand in a second language.
const COUNTRY_ISO = {
  Austria: 'AT', Belgium: 'BE', Brazil: 'BR', Canada: 'CA', China: 'CN', 'Czech Republic': 'CZ',
  Denmark: 'DK', Finland: 'FI', France: 'FR', Germany: 'DE', Greece: 'GR', Hungary: 'HU',
  India: 'IN', Ireland: 'IE', Italy: 'IT', Japan: 'JP', Mexico: 'MX', Netherlands: 'NL',
  Norway: 'NO', Poland: 'PL', Portugal: 'PT', Romania: 'RO', Russia: 'RU', 'South Korea': 'KR',
  Spain: 'ES', Sweden: 'SE', Switzerland: 'CH', Turkey: 'TR', Ukraine: 'UA',
  'United Kingdom': 'GB', 'United States': 'US',
};
const countryLabel = (c) => countryName(COUNTRY_ISO[c], i18n.language, c);

// One ISO code per dial code: it names the country in the reader's language and picks the
// flag. The two that are not a single country get the flag of the larger one.
const PHONE_COUNTRY_ISO = {
  Belgium: 'BE', Netherlands: 'NL', France: 'FR', Germany: 'DE', 'United Kingdom': 'GB',
  'US / Canada': 'US', Spain: 'ES', Italy: 'IT', Portugal: 'PT', Switzerland: 'CH',
  Austria: 'AT', Luxembourg: 'LU', Ireland: 'IE', Denmark: 'DK', Sweden: 'SE', Norway: 'NO',
  Finland: 'FI', Poland: 'PL', 'Czech Republic': 'CZ', Hungary: 'HU', Greece: 'GR',
  Romania: 'RO', Bulgaria: 'BG', Croatia: 'HR', Slovenia: 'SI', Russia: 'RU', Ukraine: 'UA',
  Turkey: 'TR', UAE: 'AE', 'Saudi Arabia': 'SA', India: 'IN', Pakistan: 'PK',
  Bangladesh: 'BD', 'Sri Lanka': 'LK', China: 'CN', Japan: 'JP', 'South Korea': 'KR',
  Malaysia: 'MY', Singapore: 'SG', Thailand: 'TH', Indonesia: 'ID', Philippines: 'PH',
  Vietnam: 'VN', Australia: 'AU', 'New Zealand': 'NZ', Brazil: 'BR', Mexico: 'MX',
  'South Africa': 'ZA', Egypt: 'EG', Morocco: 'MA', Tunisia: 'TN', Algeria: 'DZ',
};
const phoneCountryLabel = (name) => {
  if (name === 'US / Canada') return i18n.t('auth:phoneCountries.usCanada', 'US / Canada');
  if (name === 'UAE') return i18n.t('auth:phoneCountries.uae', 'UAE');
  return countryName(PHONE_COUNTRY_ISO[name], i18n.language, name);
};

const EMPTY_FORM = {
  firstName: '', lastName: '', email: '',
  phoneCode: '32', phone: '',
  dateOfBirth: '', gender: '', nationality: '', language: '',
  street: '', houseNumber: '', boxNumber: '', city: '', postalCode: '', country: '',
  password: '',
  legalName: '', vatNumber: '',
};

const toE164 = (code, number) => `+${code}${number.replace(/\D/g, '').replace(/^0+/, '')}`;

// The design's person glyph: broader shoulders than lucide's User, so it fills the same
// square as the other field icons.
const Person = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="7.75" r="4.25" />
    <path d="M3.75 20.5c.85-4 4.15-6.5 8.25-6.5s7.4 2.5 8.25 6.5" />
  </svg>
);

/* Date of birth is typed as "dd / mm / yyyy", the same order whatever a native date field
   would have shown in the browser's locale, and stored as YYYY-MM-DD. */
const formatDob = (raw) => {
  const d = raw.replace(/\D/g, '').slice(0, 8);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)].filter(Boolean).join(' / ');
};
const dobToIso = (text) => {
  const m = /^(\d{2}) \/ (\d{2}) \/ (\d{4})$/.exec(text);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const date = new Date(Date.UTC(+yyyy, +mm - 1, +dd));
  if (date.getUTCFullYear() !== +yyyy || date.getUTCMonth() !== +mm - 1 || date.getUTCDate() !== +dd) return null;
  return `${yyyy}-${mm}-${dd}`;
};
const isoToDob = (iso) => {
  const [y, m, d] = String(iso).split('-');
  return y && m && d ? `${d} / ${m} / ${y}` : '';
};

function getPasswordStrength(pw) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}

function validateField(key, form, isCompany) {
  const v = String(form[key] ?? '').trim();
  switch (key) {
    case 'firstName':
      if (!v) return i18n.t('auth:validation.firstNameRequired', 'First name is required');
      if (v.length < 2) return i18n.t('auth:validation.firstNameMinLength', 'First name must be at least 2 characters');
      break;
    case 'lastName':
      if (!v) return i18n.t('auth:validation.lastNameRequired', 'Last name is required');
      if (v.length < 2) return i18n.t('auth:validation.lastNameMinLength', 'Last name must be at least 2 characters');
      break;
    case 'email':
      if (!v) return i18n.t('auth:validation.emailRequired', 'Email is required');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return i18n.t('auth:validation.emailInvalid', 'Please enter a valid email address');
      break;
    case 'phone': {
      if (!v) return i18n.t('auth:validation.phoneRequired', 'Phone number is required');
      const e164 = toE164(form.phoneCode, v);
      if (!/^\+[1-9]\d{6,14}$/.test(e164)) return i18n.t('auth:validation.phoneInvalid', 'Enter a valid phone number');
      break;
    }
    case 'nationality':
      // Only stored on a private customer — a company account has no such column.
      if (!isCompany && !v) return i18n.t('auth:validation.nationalityRequired', 'Nationality is required');
      break;
    case 'language':
      if (!v) return i18n.t('auth:validation.languageRequired', 'Preferred language is required');
      break;
    case 'dateOfBirth': {
      if (!v) break;
      const iso = dobToIso(v);
      if (!iso || iso < '1900-01-01') return i18n.t('auth:validation.dobInvalid', 'Enter a valid date (dd / mm / yyyy)');
      if (iso > new Date().toISOString().slice(0, 10)) return i18n.t('auth:validation.dobFuture', 'Date of birth cannot be in the future');
      break;
    }
    case 'country':
      // The dashboard needs it for a company; a private address can do without, as the
      // design has no country on it.
      if (isCompany && !v) return i18n.t('auth:validation.countryRequired', 'Country is required');
      break;
    case 'password':
      if (!v) return i18n.t('auth:validation.passwordRequired', 'Password is required');
      if (getPasswordStrength(form.password) < 4) return i18n.t('auth:validation.passwordStrength', 'Use 8+ characters with an uppercase letter, a number and a symbol');
      break;
    case 'legalName':
      if (isCompany && !v) return i18n.t('auth:validation.companyNameRequired', 'Company name is required');
      break;
    case 'vatNumber':
      if (isCompany && !v) return i18n.t('auth:validation.vatRequired', 'VAT number is required');
      break;
    default: break;
  }
  return '';
}

// Checked when "Create Account" leaves the first screen, and when the second one submits.
// A business account swaps the personal fields for the company's, in the same places.
const stepOneFields = (isCompany) => [
  'firstName', 'lastName', 'email', 'phone', 'language',
  ...(isCompany ? ['country', 'legalName', 'vatNumber'] : ['nationality', 'dateOfBirth']),
];
const STEP_TWO_FIELDS = ['password'];

// Stable component, defined outside Register so a re-render does not remount it.
// One field: label, a bordered control with its icon, and the error under it.
function Field({
  label, placeholder, type = 'text', required, icon: Icon,
  select, options, value, onChange, onBlur, error, className = '', autoComplete, inputMode, name,
}) {
  // Ties the label to its control, so clicking the label focuses the field and a screen
  // reader announces what the field is for.
  const id = useId();
  return (
    <div className={`${styles.field} ${className}`}>
      <label className={styles.fieldLabel} htmlFor={id}>{label}{required && ' *'}</label>
      <div className={`${styles.control} ${select ? styles.controlSelect : ''} ${error ? styles.controlError : ''} ${select && !value ? styles.controlEmpty : ''}`}>
        {Icon && <Icon className={styles.controlIcon} aria-hidden="true" />}
        {select ? (
          <select
            id={id}
            name={name}
            className={styles.input}
            value={value}
            onChange={onChange}
            onBlur={onBlur}
            aria-invalid={Boolean(error)}
          >
            <option value="">{placeholder}</option>
            {options.map((o) => (typeof o === 'string'
              ? <option key={o} value={o}>{o}</option>
              : <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        ) : (
          <input
            id={id}
            name={name}
            className={styles.input}
            type={type}
            placeholder={placeholder}
            value={value}
            onChange={onChange}
            onBlur={onBlur}
            autoComplete={autoComplete}
            inputMode={inputMode}
            aria-invalid={Boolean(error)}
          />
        )}
        {select && <ChevronDown className={styles.chevron} aria-hidden="true" />}
      </div>
      {error && <span className={styles.errorText}>{error}</span>}
    </div>
  );
}

/* Date of birth: typed as dd / mm / yyyy, with the browser's own calendar one click away
   on the icon at the right. The native picker lives in a hidden date input. */
function DateField({ label, value, onChange, onBlur, error, className = '' }) {
  const { t } = useTranslation('auth');
  const id = useId();
  const pickerRef = useRef(null);
  const today = new Date().toISOString().split('T')[0];

  const openPicker = () => {
    const picker = pickerRef.current;
    if (!picker) return;
    picker.value = dobToIso(value) || '';
    try { picker.showPicker(); } catch { picker.focus(); }
  };

  return (
    <div className={`${styles.field} ${className}`}>
      <label className={styles.fieldLabel} htmlFor={id}>{label}</label>
      <div className={`${styles.control} ${error ? styles.controlError : ''}`}>
        <Calendar className={styles.controlIcon} aria-hidden="true" />
        <input
          id={id}
          className={styles.input}
          type="text"
          inputMode="numeric"
          autoComplete="bday"
          placeholder={t('auth:register.dobPlaceholder', 'dd / mm / yyyy')}
          value={value}
          onChange={(e) => onChange(formatDob(e.target.value))}
          onBlur={onBlur}
          aria-invalid={Boolean(error)}
        />
        <button type="button" className={styles.calendarBtn} onClick={openPicker} aria-label={t('auth:register.openCalendar', 'Open calendar')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="4" y="5" width="16" height="15" rx="2.5" /><path d="M4 10h16" />
          </svg>
        </button>
        <input
          ref={pickerRef}
          type="date"
          className={styles.nativeDate}
          max={today}
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => { if (e.target.value) onChange(isoToDob(e.target.value)); }}
        />
      </div>
      {error && <span className={styles.errorText}>{error}</span>}
    </div>
  );
}

// Searchable phone code picker + number input — defined outside Register
function PhoneField({ label, codeValue, numberValue, onCodeChange, onNumberChange, onBlur, error, required, className = '' }) {
  const { t } = useTranslation('auth');
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapRef = useRef(null);

  useEffect(() => {
    const onMouse = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onMouse);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouse);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const q = search.toLowerCase().replace(/^\+/, '');
  // Matched against both the English name and the translated one shown on screen, so typing
  // in either language finds the country.
  const filtered = PHONE_CODES.filter((c) =>
    c.name.toLowerCase().includes(q) || phoneCountryLabel(c.name).toLowerCase().includes(q) || c.code.startsWith(q)
  );
  const selected = PHONE_CODES.find((c) => c.code === codeValue) || PHONE_CODES[0];
  const numberId = useId();
  // A real flag image: Windows draws flag emoji as two letters.
  const flag = (c) => <img className={styles.flag} src={flagUrl(PHONE_COUNTRY_ISO[c.name])} alt="" loading="lazy" />;

  return (
    <div className={`${styles.field} ${className}`}>
      <label className={styles.fieldLabel} htmlFor={numberId}>{label}{required && ' *'}</label>
      <div className={`${styles.control} ${styles.phoneControl} ${error ? styles.controlError : ''}`} ref={wrapRef}>
        <button
          type="button"
          className={styles.phoneCodeBtn}
          onClick={() => { setOpen((o) => !o); setSearch(''); }}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={`${phoneCountryLabel(selected.name)} +${selected.code}`}
        >
          {flag(selected)}
          <span>+{selected.code}</span>
          <ChevronDown className={styles.phoneChevron} aria-hidden="true" />
        </button>

        {open && (
          <div className={styles.phoneDropdown}>
            <div className={styles.phoneSearchWrap}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                className={styles.phoneSearch}
                placeholder={t('auth:register.searchCountryOrCode', 'Search country or code…')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>
            <div className={styles.phoneList} role="listbox">
              {filtered.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  role="option"
                  aria-selected={c.code === codeValue}
                  className={`${styles.phoneOption} ${c.code === codeValue ? styles.phoneOptionActive : ''}`}
                  onClick={() => { onCodeChange(c.code); setOpen(false); setSearch(''); }}
                >
                  {flag(c)}
                  <span className={styles.phoneOptionName}>{phoneCountryLabel(c.name)}</span>
                  <span className={styles.phoneOptionCode}>+{c.code}</span>
                </button>
              ))}
              {filtered.length === 0 && (
                <div className={styles.phoneNoResult}>{t('auth:register.noResults', 'No results')}</div>
              )}
            </div>
          </div>
        )}

        <span className={styles.phoneDivider} aria-hidden="true" />
        <Phone className={styles.controlIcon} aria-hidden="true" />
        <input
          id={numberId}
          className={styles.input}
          type="tel"
          autoComplete="tel-national"
          placeholder="470 123 456"
          value={numberValue}
          onChange={onNumberChange}
          onBlur={onBlur}
          aria-invalid={Boolean(error)}
        />
      </div>
      {error && <span className={styles.errorText}>{error}</span>}
    </div>
  );
}

// `children` sit at the end of the row, after the hairline.
function SectionHead({ index, title, tight, children }) {
  return (
    <div className={`${styles.sectionHead} ${tight ? styles.sectionHeadTight : ''}`}>
      <span className={styles.sectionIndex}>{index}</span>
      <span className={styles.sectionTitle}>{title}</span>
      <span className={styles.sectionRule} />
      {children}
    </div>
  );
}

/* "I'm registering as a company", on the first screen beside "Your details", since ticking it
   changes which details are asked for. A real checkbox under the drawn box, reachable by
   keyboard and announced by screen readers. */
function CompanyToggle({ checked, onChange }) {
  const { t } = useTranslation('auth');
  return (
    <label className={`${styles.companyToggle} ${checked ? styles.companyToggleOn : ''}`}>
      <input type="checkbox" className={styles.checkInput} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className={styles.checkbox} aria-hidden="true">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
      </span>
      <span className={styles.companyToggleText}>{t('auth:register.registeringAsCompany', "I'm registering as a company")}</span>
      <BriefcaseBusiness className={styles.companyToggleIcon} aria-hidden="true" />
    </label>
  );
}

export default function Register() {
  // The logo the dashboard sets, with the bundled one showing until it lands.
  const brandLogo = useBrandLogo();
  const { t } = useTranslation('auth');
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { execute: register, loading } = useRegister();

  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [isCompany, setCompany] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [showPw, setShowPw] = useState(false);

  // The design's screen holds the person and the address. The password, an optional
  // company and the terms follow on a second screen in the same card, so neither screen
  // has to scroll.
  const [step, setStep] = useState(1);
  const cardRef = useRef(null);

  // Signup is two steps. `pending` holds the validated payload while the person
  // confirms their address; the account is only created once the code is back,
  // so abandoning here leaves nothing behind but an expiring code row.
  const [pending, setPending] = useState(null); // { payload, expiryMinutes }
  const [sending, setSending] = useState(false);

  const set = (key) => (e) => {
    let value = e.target.value;
    // SUNSKY convention — surnames are uppercase, same as the dashboard.
    if (key === 'lastName') value = value.toUpperCase();
    if (key === 'email') value = value.trim().toLowerCase();
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: '' }));
  };
  const setValue = (key) => (v) => {
    setForm((prev) => ({ ...prev, [key]: v }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: '' }));
  };
  const blur = (key) => () =>
    setErrors((prev) => ({ ...prev, [key]: validateField(key, form, isCompany) }));

  const strength = getPasswordStrength(form.password);

  const setAccountType = (company) => {
    if (company === isCompany) return;
    setCompany(company);
    // Drop stale errors for the fields that trade places.
    setErrors((e) => ({ ...e, nationality: '', dateOfBirth: '', legalName: '', vatNumber: '', country: '' }));
  };

  // Validates `keys`, shows what is wrong and puts the cursor in the first wrong field.
  const check = (keys) => {
    const found = {};
    keys.forEach((key) => {
      const err = validateField(key, form, isCompany);
      if (err) found[key] = err;
    });
    setErrors((prev) => ({ ...prev, ...Object.fromEntries(keys.map((k) => [k, found[k] || ''])) }));
    if (Object.keys(found).length) {
      showToast(t('auth:register.checkHighlightedFields', 'Please check the highlighted fields.'), 'error');
      requestAnimationFrame(() => cardRef.current?.querySelector('[aria-invalid="true"]')?.focus());
      return false;
    }
    return true;
  };

  const goToStepTwo = () => {
    if (check(stepOneFields(isCompany))) setStep(2);
  };

  const handleRegister = async () => {
    if (!check(STEP_TWO_FIELDS)) return;

    const payload = {
      type: isCompany ? 'professional' : 'private',
      password: form.password,
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim().toLowerCase(),
      phone: toE164(form.phoneCode, form.phone),
      preferredLanguage: form.language,
      street: form.street.trim(),
      houseNumber: form.houseNumber.trim(),
      boxNumber: form.boxNumber.trim(),
      city: form.city.trim(),
      postalCode: form.postalCode.trim(),
    };
    if (isCompany) {
      payload.country = form.country;
      // The person above is stored as the company's primary contact. No trading name is
      // asked for — for almost every SME it is the legal name typed a second time, and the
      // server copies it across for the column that requires one.
      payload.legalName = form.legalName.trim();
      payload.vatNumber = form.vatNumber.trim();
    } else {
      payload.nationality = form.nationality;
      const dob = dobToIso(form.dateOfBirth);
      if (dob) payload.dateOfBirth = dob;
      if (form.gender) payload.gender = form.gender;
    }

    // Step 1: the server validates the whole payload and emails a code. Nothing
    // is created yet, so a failure here costs the person nothing but a retry.
    setSending(true);
    try {
      const res = await sendRegistrationCode(payload);
      setPending({ payload, expiryMinutes: res?.data?.data?.expiresInMinutes ?? null });
      showToast(t('auth:register.codeSentTo', { email: payload.email, defaultValue: 'We sent a 6-digit code to {{email}}' }), 'success');
    } catch (err) {
      showToast(err.response?.data?.message || t('auth:register.signupStartFailed', 'We could not start your signup. Please try again.'), 'error');
    } finally {
      setSending(false);
    }
  };

  /* Step 2: the code comes back, the account is created and the user is logged
     in by useRegister's onSuccess. Rethrows so the verify screen can mark the
     code field wrong and clear it. */
  const handleVerify = async (code) => {
    try {
      await register({ ...pending.payload, code });
    } catch (err) {
      showToast(err.response?.data?.message || t('auth:register.registrationFailed', 'Registration failed. Please try again.'), 'error');
      throw err;
    }
  };

  const handleResend = async () => {
    try {
      const res = await sendRegistrationCode(pending.payload);
      setPending((p) => ({ ...p, expiryMinutes: res?.data?.data?.expiresInMinutes ?? p.expiryMinutes }));
      showToast(t('auth:register.newCodeOnWay', 'A new code is on its way.'), 'success');
      return true;
    } catch (err) {
      showToast(err.response?.data?.message || t('auth:register.resendFailed', 'Could not send a new code. Please try again.'), 'error');
      return false;
    }
  };

  // Address confirmation takes over the whole page. The form's state stays
  // mounted behind it, so "Change details" returns to a filled-in form.
  if (pending) {
    return (
      <RegisterVerify
        email={pending.payload.email}
        expiryMinutes={pending.expiryMinutes}
        submitting={loading}
        onVerify={handleVerify}
        onResend={handleResend}
        onBack={() => setPending(null)}
      />
    );
  }

  const submitLabel = sending
    ? t('auth:register.sendingCode', 'Sending code…')
    : isCompany
      ? t('auth:register.createBusinessAccount', 'Create Business Account')
      : t('auth:register.createAccount', 'Create Account');

  return (
    <div className={styles.page}>
      {/* ══ Left: the brand message ══ */}
      <div className={styles.brandPanel}>
        <Link to="/" className={styles.logo}>
          {/* The wordmark carries the name, so no text beside it. */}
          <img src={brandLogo.src} alt={brandLogo.alt || 'Sunsky Vakanties'} className={styles.logoWordmark} />
        </Link>

        <p className={styles.eyebrow}>{t('auth:register.eyebrow', 'Travel • Explore • Create memories')}</p>
        <h2 className={styles.brandTitle}>
          <Trans i18nKey="auth:register.brandTitle" t={t}>Start your next<br /><em>adventure</em> today</Trans>
        </h2>
        <p className={styles.brandSub}>
          {t('auth:register.brandSub', 'Join thousands of travellers who trust SunSky for unforgettable holidays at guaranteed best prices.')}
        </p>

        <ul className={styles.trustList}>
          <li className={styles.trustItem}>
            <span className={styles.trustIcon}><Shield aria-hidden="true" /></span>
            <span className={styles.trustText}>
              <strong>{t('auth:register.trustSecure', 'Secure & GDPR-compliant')}</strong>
              <span>{t('auth:register.trustSecureSub', 'Your data is always protected')}</span>
            </span>
          </li>
          <li className={styles.trustItem}>
            <span className={styles.trustIcon}><Tag aria-hidden="true" /></span>
            <span className={styles.trustText}>
              <strong>{t('auth:register.trustBestPrice', 'Best price guarantee')}</strong>
              <span>{t('auth:register.trustBestPriceSub', 'Unbeatable deals on top destinations')}</span>
            </span>
          </li>
          <li className={styles.trustItem}>
            <span className={styles.trustIcon}><Users aria-hidden="true" /></span>
            <span className={styles.trustText}>
              <strong>{t('auth:register.trustHappyCustomers', 'Happy customers worldwide')}</strong>
              <span>{t('auth:register.trustHappyCustomersSub', 'Trusted by 500+ travel destinations')}</span>
            </span>
          </li>
        </ul>

        <p className={styles.quote}>
          {t('auth:login.quote', '“More than travel,\nit’s a feeling.”')}
          {/* A brush stroke: full at the left, tapering to nothing as it rises to the right. */}
          <svg className={styles.quoteSwash} viewBox="0 0 112 14" aria-hidden="true">
            <path d="M3.5 9.6 C 30 6.2, 64 3.2, 110.5 1.2 C 72 4.6, 36 8.6, 4.8 13.1 C 1.6 13.5, 0.6 10.2, 3.5 9.6 Z" fill="currentColor" />
          </svg>
        </p>
      </div>

      {/* ══ Right: the registration card ══ */}
      <div className={styles.formPanel}>
        <div className={styles.card} ref={cardRef}>
          <LanguageMenu className={styles.langMenu} />

          <div className={styles.cardHead}>
            <h1 className={styles.cardTitle}>{t('auth:register.title', 'Create your account')}</h1>
            <p className={styles.cardSub}>
              {step === 1
                ? <Trans i18nKey="auth:register.confirmEmailSignIn" t={t}>Confirm your email and you're in. Already have an account? <Link to="/login">Sign in</Link></Trans>
                : t('auth:register.lastStep', 'Last step: choose a password to protect your account.')}
            </p>
          </div>

          <div className={styles.cardBody}>
            {step === 1 ? (
              <>
                <SectionHead index="01" title={t('auth:register.sectionYourDetails', 'Your details')}>
                  <CompanyToggle checked={isCompany} onChange={setAccountType} />
                </SectionHead>
                <div className={`${styles.grid} ${styles.gridDetails}`}>
                  <Field label={t('auth:fields.firstName', 'First name')} placeholder="John" required icon={Person} autoComplete="given-name"
                    value={form.firstName} onChange={set('firstName')} onBlur={blur('firstName')} error={errors.firstName} />
                  <Field label={t('auth:fields.lastName', 'Last name')} placeholder="Doe" required icon={Person} autoComplete="family-name"
                    value={form.lastName} onChange={set('lastName')} onBlur={blur('lastName')} error={errors.lastName} />
                  <Field label={t('auth:fields.emailAddress', 'Email address')} placeholder="john@example.com" type="email" required icon={Mail} autoComplete="email"
                    value={form.email} onChange={set('email')} onBlur={blur('email')} error={errors.email} />
                  <PhoneField label={t('auth:fields.phone', 'Phone number')} className={styles.span2} required
                    codeValue={form.phoneCode} numberValue={form.phone}
                    onCodeChange={setValue('phoneCode')} onNumberChange={set('phone')}
                    onBlur={blur('phone')} error={errors.phone} />
                  {/* A business is registered from its country; a person, their nationality. */}
                  {isCompany ? (
                    <Field key="country" label={t('auth:fields.country', 'Country')} placeholder={t('auth:register.selectCountry', 'Select country')} select icon={Globe} required
                      options={COUNTRIES.map((c) => ({ value: c, label: countryLabel(c) }))}
                      value={form.country} onChange={set('country')} onBlur={blur('country')} error={errors.country} />
                  ) : (
                    <Field key="nationality" label={t('auth:fields.nationality', 'Nationality')} placeholder={t('auth:register.selectNationality', 'Select nationality')} select icon={Globe} required
                      options={NATIONALITIES.map((n) => ({ value: n, label: nationalityLabel(n) }))}
                      value={form.nationality} onChange={set('nationality')} onBlur={blur('nationality')} error={errors.nationality} />
                  )}
                </div>
                <div className={`${styles.grid} ${styles.gridPersonal}`}>
                  <Field label={t('auth:fields.preferredLanguage', 'Preferred language')} placeholder={t('auth:register.selectLanguage', 'Select language')} select icon={Languages}
                    options={LANGUAGES.map((l) => ({ value: l, label: languageLabel(l) }))} required
                    value={form.language} onChange={set('language')} onBlur={blur('language')} error={errors.language} />
                  {/* Date of birth and gender are only kept on a private account, so a business
                      is asked for its name and VAT number in their place. */}
                  {isCompany ? (
                    <>
                      <Field key="legalName" label={t('auth:fields.companyName', 'Company name')} placeholder="SunSky Travel BV" required icon={Building2} autoComplete="organization"
                        value={form.legalName} onChange={set('legalName')} onBlur={blur('legalName')} error={errors.legalName} />
                      <Field key="vatNumber" label={t('auth:fields.vatNumber', 'VAT number')} placeholder="BE0477.123.456" required icon={ReceiptText}
                        value={form.vatNumber} onChange={set('vatNumber')} onBlur={blur('vatNumber')} error={errors.vatNumber} />
                    </>
                  ) : (
                    <>
                      <DateField key="dateOfBirth" label={t('auth:fields.dateOfBirth', 'Date of birth')}
                        value={form.dateOfBirth} onChange={setValue('dateOfBirth')} onBlur={blur('dateOfBirth')} error={errors.dateOfBirth} />
                      <Field key="gender" label={t('auth:fields.gender', 'Gender')} placeholder={t('auth:fields.selectPlaceholder', 'Select')} select icon={Person} options={genderOptions()}
                        value={form.gender} onChange={set('gender')} />
                    </>
                  )}
                </div>

                <SectionHead index="02" title={t('auth:register.sectionAddress', 'Address')} tight />
                <div className={`${styles.grid} ${styles.gridAddress}`}>
                  <Field label={t('auth:fields.street', 'Street')} placeholder="Rue de la Loi" className={styles.span2} icon={MapPin} autoComplete="address-line1"
                    value={form.street} onChange={set('street')} />
                  <Field label={t('auth:fields.houseNo', 'House no.')} placeholder="42" icon={House}
                    value={form.houseNumber} onChange={set('houseNumber')} />
                  <Field label={t('auth:fields.boxNo', 'Box no.')} placeholder="3A" icon={Box}
                    value={form.boxNumber} onChange={set('boxNumber')} />
                  <Field label={t('auth:fields.city', 'City')} placeholder="Brussels" icon={Building2} autoComplete="address-level2"
                    value={form.city} onChange={set('city')} />
                  <Field label={t('auth:fields.postalCode', 'Postal code')} placeholder="1000" icon={Mail} autoComplete="postal-code"
                    value={form.postalCode} onChange={set('postalCode')} />
                </div>
              </>
            ) : (
              <>
                <SectionHead index="03" title={t('auth:register.sectionSecurity', 'Security')} />
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="register-password">{t('auth:fields.password', 'Password')} *</label>
                  <div className={`${styles.control} ${errors.password ? styles.controlError : ''}`}>
                    <Lock className={styles.controlIcon} aria-hidden="true" />
                    <input
                      id="register-password"
                      className={styles.input}
                      type={showPw ? 'text' : 'password'}
                      placeholder={t('auth:register.min8Characters', 'Min. 8 characters')}
                      value={form.password}
                      onChange={set('password')}
                      onBlur={blur('password')}
                      autoComplete="new-password"
                      aria-invalid={Boolean(errors.password)}
                      autoFocus
                    />
                    <button
                      type="button"
                      className={styles.eyeBtn}
                      onClick={() => setShowPw((v) => !v)}
                      aria-label={showPw ? t('auth:fields.hidePassword', 'Hide password') : t('auth:fields.showPassword', 'Show password')}
                    >
                      {showPw ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                    </button>
                  </div>
                  {errors.password && <span className={styles.errorText}>{errors.password}</span>}
                </div>
                <div className={styles.strengthBar}>
                  {[1, 2, 3, 4].map((i) => <div key={i} className={`${styles.strengthSeg} ${strength >= i ? styles[`filled${i}`] : ''}`} />)}
                </div>
                <div className={styles.strengthHint}>
                  <span className={strength >= 1 ? styles.met : ''}>{t('auth:register.strength8Chars', '8+ chars')}</span>
                  <span className={strength >= 2 ? styles.met : ''}>{t('auth:register.strengthUppercase', 'Uppercase')}</span>
                  <span className={strength >= 3 ? styles.met : ''}>{t('auth:register.strengthNumber', 'Number')}</span>
                  <span className={strength >= 4 ? styles.met : ''}>{t('auth:register.strengthSymbol', 'Symbol')}</span>
                </div>

                {/* A real checkbox under the drawn box, reachable by keyboard and announced by
                    screen readers. */}
                <label className={styles.terms}>
                  <input type="checkbox" className={styles.checkInput} checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                  <span className={styles.checkbox} aria-hidden="true">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                  </span>
                  <span className={styles.termsText}><Trans i18nKey="auth:register.termsText" t={t}>I agree to the <a href="#">Terms of Service</a> and <a href="#">Privacy Policy</a></Trans></span>
                </label>
              </>
            )}
          </div>

          <div className={styles.cardFoot}>
            {step === 1 ? (
              <button type="button" className={styles.guestBtn} onClick={() => navigate('/')}>
                <Globe aria-hidden="true" />
                {t('auth:continueAsGuest', 'Continue as Guest')}
              </button>
            ) : (
              <button type="button" className={styles.guestBtn} onClick={() => setStep(1)}>
                <ArrowLeft aria-hidden="true" />
                {t('auth:register.back', 'Back')}
              </button>
            )}
            <button
              type="button"
              className={styles.submitBtn}
              disabled={step === 2 && (!agreed || sending || loading)}
              onClick={step === 1 ? goToStepTwo : handleRegister}
            >
              {submitLabel}
              <ArrowRight aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
