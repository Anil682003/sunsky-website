import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import mainLogo from '../../assets/main-logo.png';
import styles from './Register.module.css';
import { useRegister } from '../../api';
import { useToast } from '../../context/ToastContext';

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

// Values are the DB enum; labels are what the dashboard shows.
const GENDERS = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'OTHER', label: 'Other' },
  { value: 'PREFER_NOT_TO_SAY', label: 'Prefer not to say' },
];

const PHONE_CODES = [
  { code:'32',  flag:'🇧🇪', name:'Belgium' },
  { code:'31',  flag:'🇳🇱', name:'Netherlands' },
  { code:'33',  flag:'🇫🇷', name:'France' },
  { code:'49',  flag:'🇩🇪', name:'Germany' },
  { code:'44',  flag:'🇬🇧', name:'United Kingdom' },
  { code:'1',   flag:'🇺🇸', name:'US / Canada' },
  { code:'34',  flag:'🇪🇸', name:'Spain' },
  { code:'39',  flag:'🇮🇹', name:'Italy' },
  { code:'351', flag:'🇵🇹', name:'Portugal' },
  { code:'41',  flag:'🇨🇭', name:'Switzerland' },
  { code:'43',  flag:'🇦🇹', name:'Austria' },
  { code:'352', flag:'🇱🇺', name:'Luxembourg' },
  { code:'353', flag:'🇮🇪', name:'Ireland' },
  { code:'45',  flag:'🇩🇰', name:'Denmark' },
  { code:'46',  flag:'🇸🇪', name:'Sweden' },
  { code:'47',  flag:'🇳🇴', name:'Norway' },
  { code:'358', flag:'🇫🇮', name:'Finland' },
  { code:'48',  flag:'🇵🇱', name:'Poland' },
  { code:'420', flag:'🇨🇿', name:'Czech Republic' },
  { code:'36',  flag:'🇭🇺', name:'Hungary' },
  { code:'30',  flag:'🇬🇷', name:'Greece' },
  { code:'40',  flag:'🇷🇴', name:'Romania' },
  { code:'359', flag:'🇧🇬', name:'Bulgaria' },
  { code:'385', flag:'🇭🇷', name:'Croatia' },
  { code:'386', flag:'🇸🇮', name:'Slovenia' },
  { code:'7',   flag:'🇷🇺', name:'Russia' },
  { code:'380', flag:'🇺🇦', name:'Ukraine' },
  { code:'90',  flag:'🇹🇷', name:'Turkey' },
  { code:'971', flag:'🇦🇪', name:'UAE' },
  { code:'966', flag:'🇸🇦', name:'Saudi Arabia' },
  { code:'91',  flag:'🇮🇳', name:'India' },
  { code:'92',  flag:'🇵🇰', name:'Pakistan' },
  { code:'880', flag:'🇧🇩', name:'Bangladesh' },
  { code:'94',  flag:'🇱🇰', name:'Sri Lanka' },
  { code:'86',  flag:'🇨🇳', name:'China' },
  { code:'81',  flag:'🇯🇵', name:'Japan' },
  { code:'82',  flag:'🇰🇷', name:'South Korea' },
  { code:'60',  flag:'🇲🇾', name:'Malaysia' },
  { code:'65',  flag:'🇸🇬', name:'Singapore' },
  { code:'66',  flag:'🇹🇭', name:'Thailand' },
  { code:'62',  flag:'🇮🇩', name:'Indonesia' },
  { code:'63',  flag:'🇵🇭', name:'Philippines' },
  { code:'84',  flag:'🇻🇳', name:'Vietnam' },
  { code:'61',  flag:'🇦🇺', name:'Australia' },
  { code:'64',  flag:'🇳🇿', name:'New Zealand' },
  { code:'55',  flag:'🇧🇷', name:'Brazil' },
  { code:'52',  flag:'🇲🇽', name:'Mexico' },
  { code:'27',  flag:'🇿🇦', name:'South Africa' },
  { code:'20',  flag:'🇪🇬', name:'Egypt' },
  { code:'212', flag:'🇲🇦', name:'Morocco' },
  { code:'216', flag:'🇹🇳', name:'Tunisia' },
  { code:'213', flag:'🇩🇿', name:'Algeria' },
];

const EMPTY_FORM = {
  firstName: '', lastName: '', email: '',
  phoneCode: '32', phone: '',
  dateOfBirth: '', gender: '', nationality: '', language: '',
  street: '', houseNumber: '', boxNumber: '', city: '', postalCode: '', country: '',
  password: '',
  tradingName: '', legalName: '', vatNumber: '',
};

const toE164 = (code, number) => `+${code}${number.replace(/\D/g, '').replace(/^0+/, '')}`;

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
      if (!v) return 'First name is required';
      if (v.length < 2) return 'First name must be at least 2 characters';
      break;
    case 'lastName':
      if (!v) return 'Last name is required';
      if (v.length < 2) return 'Last name must be at least 2 characters';
      break;
    case 'email':
      if (!v) return 'Email is required';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Enter a valid email address';
      break;
    case 'phone': {
      if (!v) return 'Phone number is required';
      const e164 = toE164(form.phoneCode, v);
      if (!/^\+[1-9]\d{6,14}$/.test(e164)) return 'Enter a valid phone number';
      break;
    }
    case 'nationality':
      // Only stored on a private customer — a company account has no such column.
      if (!isCompany && !v) return 'Nationality is required';
      break;
    case 'language':
      if (!v) return 'Preferred language is required';
      break;
    case 'country':
      if (!v) return 'Country is required';
      break;
    case 'password':
      if (!v) return 'Password is required';
      if (getPasswordStrength(form.password) < 4) return 'Use 8+ characters with an uppercase letter, a number and a symbol';
      break;
    case 'tradingName':
      if (isCompany && !v) return 'Trading name is required';
      break;
    case 'legalName':
      if (isCompany && !v) return 'Legal name is required';
      break;
    case 'vatNumber':
      if (isCompany && !v) return 'VAT number is required';
      break;
    default: break;
  }
  return '';
}

const VALIDATED_FIELDS = [
  'firstName', 'lastName', 'email', 'phone', 'nationality',
  'language', 'country', 'password', 'tradingName', 'legalName', 'vatNumber',
];

// Stable component — defined outside Register to prevent React unmount on re-render
function Field({
  label, placeholder, type = 'text', full, span2, required,
  select, options, value, onChange, onBlur, error, hint, max,
}) {
  return (
    <div className={`${styles.field} ${full ? styles.fieldFull : ''} ${span2 ? styles.fieldSpan2 : ''}`}>
      <label className={styles.fieldLabel}>{label}{required && ' *'}</label>
      {select ? (
        <select
          className={`${styles.fieldSelect} ${error ? styles.inputError : ''}`}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
        >
          <option value="">{placeholder}</option>
          {options.map(o => typeof o === 'string'
            ? <option key={o} value={o}>{o}</option>
            : <option key={o.value} value={o.value}>{o.label}</option>
          )}
        </select>
      ) : (
        <input
          className={`${styles.fieldInput} ${error ? styles.inputError : ''}`}
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          max={max}
        />
      )}
      {error
        ? <span className={styles.errorText}>{error}</span>
        : hint ? <span className={styles.hintText}>{hint}</span> : null}
    </div>
  );
}

// Searchable phone code picker + number input — defined outside Register
function PhoneField({ label, codeValue, numberValue, onCodeChange, onNumberChange, onBlur, error, required, full, span2 }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapRef = useRef(null);

  useEffect(() => {
    const onMouse = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey   = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onMouse);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouse);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const q = search.toLowerCase().replace(/^\+/, '');
  const filtered = PHONE_CODES.filter(c =>
    c.name.toLowerCase().includes(q) || c.code.startsWith(q)
  );
  const selected = PHONE_CODES.find(c => c.code === codeValue) || PHONE_CODES[0];

  return (
    <div className={`${styles.field} ${full ? styles.fieldFull : ''} ${span2 ? styles.fieldSpan2 : ''}`}>
      <label className={styles.fieldLabel}>{label}{required && ' *'}</label>
      <div className={styles.phoneRow} ref={wrapRef}>
        <button
          type="button"
          className={styles.phoneCodeBtn}
          onClick={() => { setOpen(o => !o); setSearch(''); }}
        >
          <span>{selected.flag}</span>
          <span>+{selected.code}</span>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </button>

        {open && (
          <div className={styles.phoneDropdown}>
            <div className={styles.phoneSearchWrap}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
              <input
                className={styles.phoneSearch}
                placeholder="Search country or code…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                autoFocus
              />
            </div>
            <div className={styles.phoneList}>
              {filtered.map(c => (
                <button
                  key={c.code}
                  type="button"
                  className={`${styles.phoneOption} ${c.code === codeValue ? styles.phoneOptionActive : ''}`}
                  onClick={() => { onCodeChange(c.code); setOpen(false); setSearch(''); }}
                >
                  <span>{c.flag}</span>
                  <span className={styles.phoneOptionName}>{c.name}</span>
                  <span className={styles.phoneOptionCode}>+{c.code}</span>
                </button>
              ))}
              {filtered.length === 0 && (
                <div className={styles.phoneNoResult}>No results</div>
              )}
            </div>
          </div>
        )}

        <input
          className={`${styles.phoneNumber} ${error ? styles.inputError : ''}`}
          type="tel"
          placeholder="470 123 456"
          value={numberValue}
          onChange={onNumberChange}
          onBlur={onBlur}
        />
      </div>
      {error && <span className={styles.errorText}>{error}</span>}
    </div>
  );
}

function SectionHead({ index, title, note }) {
  return (
    <div className={styles.sectionHead}>
      <span className={styles.sectionIndex}>{index}</span>
      <span className={styles.sectionTitle}>{title}</span>
      {note && <span className={styles.sectionNote}>{note}</span>}
      <span className={styles.sectionRule} />
    </div>
  );
}

export default function Register() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { execute: register, loading } = useRegister();

  const [form, setForm]         = useState(EMPTY_FORM);
  const [errors, setErrors]     = useState({});
  const [isCompany, setCompany] = useState(false);
  const [agreed, setAgreed]     = useState(false);

  const set = (key) => (e) => {
    let value = e.target.value;
    // SUNSKY convention — surnames are uppercase, same as the dashboard.
    if (key === 'lastName') value = value.toUpperCase();
    if (key === 'email') value = value.trim().toLowerCase();
    setForm(prev => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: '' }));
  };
  const setCode = (key) => (v) => setForm(prev => ({ ...prev, [key]: v }));
  const blur = (key) => () =>
    setErrors(prev => ({ ...prev, [key]: validateField(key, form, isCompany) }));

  const strength = getPasswordStrength(form.password);

  const toggleCompany = () => {
    setCompany(prev => {
      const next = !prev;
      // Drop stale errors for fields that stop applying either way.
      setErrors(e => ({ ...e, nationality: '', tradingName: '', legalName: '', vatNumber: '' }));
      return next;
    });
  };

  const handleRegister = async () => {
    const found = {};
    VALIDATED_FIELDS.forEach(key => {
      const err = validateField(key, form, isCompany);
      if (err) found[key] = err;
    });
    setErrors(found);

    if (Object.keys(found).length) {
      showToast('Please check the highlighted fields.', 'error');
      document.querySelector(`.${styles.inputError}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

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
      country: form.country,
    };

    if (isCompany) {
      // The person above is stored as the company's primary contact.
      payload.tradingName = form.tradingName.trim();
      payload.legalName   = form.legalName.trim();
      payload.vatNumber   = form.vatNumber.trim();
    } else {
      payload.nationality = form.nationality;
      if (form.dateOfBirth) payload.dateOfBirth = form.dateOfBirth;
      if (form.gender)      payload.gender      = form.gender;
    }

    try {
      await register(payload);
    } catch (err) {
      showToast(err.response?.data?.message || 'Registration failed. Please try again.', 'error');
    }
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className={styles.page}>
      {/* The sky scene */}
      <div className={styles.bgArt} aria-hidden="true">
        <div className={styles.bgGrad} />
        <div className={`${styles.blob} ${styles.blob1}`} />
        <div className={`${styles.blob} ${styles.blob2}`} />
        <div className={`${styles.blob} ${styles.blob3}`} />
        <div className={styles.ring} />
        <div className={styles.sun}>
          <div className={styles.sunRays} />
          <div className={styles.sunCore} />
        </div>
        <div className={`${styles.cloud} ${styles.cloud1}`} />
        <div className={`${styles.cloud} ${styles.cloud2}`} />
        <svg className={styles.balloon} viewBox="0 0 120 164" fill="none">
          <defs>
            <linearGradient id="ssbGradR" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#2E62E6" />
              <stop offset="0.55" stopColor="#3D7BF0" />
              <stop offset="1" stopColor="#7FB8FF" />
            </linearGradient>
          </defs>
          <path d="M60 4C27 4 8 30 8 60c0 30 27 51 39 64h26c12-13 39-34 39-64C112 30 93 4 60 4Z" fill="url(#ssbGradR)" />
          <path d="M60 4C43 4 33 30 33 60c0 30 13 51 19 64h8V4Z" fill="rgba(255,255,255,0.28)" />
          <path d="M60 4c17 0 27 26 27 56 0 30-13 51-19 64h-8V4Z" fill="rgba(10,35,110,0.12)" />
          <path d="M10 47c16-9 84-9 100 0 1.5 4 2 9 2 13-18-8-86-8-104 0 0-4 .5-9 2-13Z" fill="#FFC24D" />
          <path d="M47 124l6 18M73 124l-6 18M60 124v18" stroke="#B07A22" strokeWidth="1.6" />
          <rect x="48" y="140" width="24" height="17" rx="4" fill="#D89B3F" />
          <rect x="48" y="140" width="24" height="6" rx="3" fill="#B07A22" />
        </svg>
        <div className={styles.horizon} />
        <div className={styles.grain} />
      </div>

      <div className={styles.brandPanel}>
        <Link to="/" className={styles.logo}>
          <img src={mainLogo} alt="SunSky" className={styles.logoImg} />
          <div className={styles.logoText}>Sun<span>Sky</span></div>
        </Link>

        <h2 className={styles.brandTitle}>
          Start your next<br /><em>adventure</em> today
        </h2>
        <p className={styles.brandSub}>
          Join thousands of travellers who trust SunSky for unforgettable holidays at guaranteed best prices.
        </p>

        <div className={styles.trustRow}>
          <div className={styles.trustItem}>
            <div className={`${styles.trustIcon} ${styles.orange}`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <span className={styles.trustLabel}>Secure &amp; GDPR-compliant</span>
          </div>
          <div className={styles.trustItem}>
            <div className={`${styles.trustIcon} ${styles.blue}`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>
            </div>
            <span className={styles.trustLabel}>Best price guarantee</span>
          </div>
          <div className={styles.trustItem}>
            <div className={`${styles.trustIcon} ${styles.coral}`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
            </div>
            <span className={styles.trustLabel}>Happy customers worldwide</span>
          </div>
        </div>
      </div>

      <div className={styles.formPanel}>
        <div className={styles.card}>
          <div className={styles.ticket}>

            <div className={styles.cardHead}>
              <div className={styles.cardHeader}>
                <h1 className={styles.cardTitle}>Create your account</h1>
                <p className={styles.cardSub}>
                  One form, no steps. Already have an account? <Link to="/login">Sign in</Link>
                </p>
              </div>
            </div>

            <div className={styles.cardBody}>

              <SectionHead index="01" title="Your details" />
              <div className={styles.formGrid}>
                <Field label="First Name" placeholder="John" required
                  value={form.firstName} onChange={set('firstName')} onBlur={blur('firstName')} error={errors.firstName} />
                <Field label="Last Name" placeholder="DOE" required
                  value={form.lastName} onChange={set('lastName')} onBlur={blur('lastName')} error={errors.lastName} />
                <Field label="Email" placeholder="john@example.com" type="email" required
                  value={form.email} onChange={set('email')} onBlur={blur('email')} error={errors.email} />
                <PhoneField label="Phone" span2 required
                  codeValue={form.phoneCode} numberValue={form.phone}
                  onCodeChange={setCode('phoneCode')} onNumberChange={set('phone')}
                  onBlur={blur('phone')} error={errors.phone} />
                <Field label="Nationality" placeholder="Select nationality" select options={NATIONALITIES}
                  required={!isCompany}
                  value={form.nationality} onChange={set('nationality')} onBlur={blur('nationality')} error={errors.nationality} />
                <Field label="Preferred Language" placeholder="Select language" select options={LANGUAGES} required
                  value={form.language} onChange={set('language')} onBlur={blur('language')} error={errors.language} />
                <Field label="Date of Birth" type="date" max={today}
                  value={form.dateOfBirth} onChange={set('dateOfBirth')} />
                <Field label="Gender" placeholder="Select" select options={GENDERS}
                  value={form.gender} onChange={set('gender')} />
              </div>

              <SectionHead index="02" title="Address" />
              <div className={styles.formGrid}>
                <Field label="Street" placeholder="Rue de la Loi" span2
                  value={form.street} onChange={set('street')} />
                <Field label="House No." placeholder="42"
                  value={form.houseNumber} onChange={set('houseNumber')} />
                <Field label="Box No." placeholder="3A" hint="Apartment, suite or bus"
                  value={form.boxNumber} onChange={set('boxNumber')} />
                <Field label="City" placeholder="Brussels"
                  value={form.city} onChange={set('city')} />
                <Field label="Postal Code" placeholder="1000"
                  value={form.postalCode} onChange={set('postalCode')} />
                <Field label="Country" placeholder="Select country" select options={COUNTRIES} required full
                  value={form.country} onChange={set('country')} onBlur={blur('country')} error={errors.country} />
              </div>

              <SectionHead index="03" title="Security" />
              <div className={styles.formGrid}>
                <Field label="Password" placeholder="Min. 8 characters" type="password" full required
                  value={form.password} onChange={set('password')} onBlur={blur('password')} error={errors.password} />
                <div className={styles.strengthBar}>
                  {[1,2,3,4].map(i => <div key={i} className={`${styles.strengthSeg} ${strength >= i ? styles[`filled${i}`] : ''}`} />)}
                </div>
                <div className={styles.strengthHint}>
                  <span className={strength >= 1 ? styles.met : ''}>8+ chars</span>
                  <span className={strength >= 2 ? styles.met : ''}>Uppercase</span>
                  <span className={strength >= 3 ? styles.met : ''}>Number</span>
                  <span className={strength >= 4 ? styles.met : ''}>Symbol</span>
                </div>
              </div>

              <SectionHead index="04" title="Business account" note="Optional" />
              <div className={`${styles.companyBlock} ${isCompany ? styles.companyOpen : ''}`}>
                <div className={styles.companyToggle} onClick={toggleCompany}>
                  <div className={`${styles.checkbox} ${isCompany ? styles.checked : ''}`}>
                    {isCompany && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>}
                  </div>
                  <div className={styles.companyToggleText}>
                    <strong>I'm registering as a company</strong>
                    <span>Book on behalf of a business. You stay the primary contact on the account.</span>
                  </div>
                  <svg className={styles.companyIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                    <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><path d="M3 6h18M16 10a4 4 0 01-8 0"/>
                  </svg>
                </div>

                {isCompany && (
                  <div className={`${styles.formGrid} ${styles.companyFields}`}>
                    <Field label="Trading Name" placeholder="SunSky Travel" required
                      value={form.tradingName} onChange={set('tradingName')} onBlur={blur('tradingName')} error={errors.tradingName} />
                    <Field label="Legal Name" placeholder="SunSky Travel BV" required
                      value={form.legalName} onChange={set('legalName')} onBlur={blur('legalName')} error={errors.legalName} />
                    <Field label="VAT Number" placeholder="BE0477.123.456" required
                      value={form.vatNumber} onChange={set('vatNumber')} onBlur={blur('vatNumber')} error={errors.vatNumber} />
                  </div>
                )}
              </div>

              <div className={styles.terms}>
                <div className={`${styles.checkbox} ${agreed ? styles.checked : ''}`} onClick={() => setAgreed(!agreed)}>
                  {agreed && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>}
                </div>
                <span className={styles.termsText}>I agree to the <a href="#">Terms of Service</a> and <a href="#">Privacy Policy</a></span>
              </div>
            </div>

            <div className={styles.cardFoot}>
              <div className={styles.navRow}>
                <button className={styles.guestBtn} onClick={() => navigate('/')}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
                  Continue as Guest
                </button>
                <button className={styles.submitBtn} disabled={!agreed || loading} onClick={handleRegister}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/></svg>
                  {loading ? 'Creating account…' : `Create ${isCompany ? 'Business Account' : 'Account'}`}
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
