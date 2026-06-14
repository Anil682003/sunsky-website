import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import lightLogo from '../../assets/light-logo.png';
import styles from './Register.module.css';
import { useRegister } from '../../api';
import { useToast } from '../../context/ToastContext';

const INDUSTRIES = [
  'Airline','Corporate Travel','Event Management','Government',
  'Hospitality','Incentive Travel','Logistics','Management Consulting',
  'Media & Entertainment','NGO / Non-Profit','Sports & Recreation',
  'Technology','Tour Operator','Travel Agency','Other',
];
const LANGUAGES = [
  { value:'en', label:'English' },
  { value:'nl', label:'Nederlands' },
  { value:'fr', label:'Français' },
  { value:'de', label:'Deutsch' },
];
const PAYMENT_TERMS = ['0 days','7 days','14 days','30 days','45 days','60 days'];

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

const PRIVATE_STEPS = [
  { key:'personal', label:'Personal' },
  { key:'address',  label:'Address' },
  { key:'security', label:'Security' },
];
const PRO_STEPS = [
  { key:'company',  label:'Company' },
  { key:'invoice',  label:'Invoicing' },
  { key:'contact',  label:'Contact' },
  { key:'security', label:'Security' },
];

function getPasswordStrength(pw) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}

// Stable component — defined outside Register to prevent React unmount on re-render
function Field({ label, placeholder, type = 'text', full, span2, required, select, options, value, onChange }) {
  return (
    <div className={`${styles.field} ${full ? styles.fieldFull : ''} ${span2 ? styles.fieldSpan2 : ''}`}>
      <label className={styles.fieldLabel}>{label}{required && ' *'}</label>
      {select ? (
        <select className={styles.fieldSelect} value={value} onChange={onChange}>
          <option value="">{placeholder}</option>
          {options.map(o => typeof o === 'string'
            ? <option key={o} value={o}>{o}</option>
            : <option key={o.value} value={o.value}>{o.label}</option>
          )}
        </select>
      ) : (
        <input
          className={styles.fieldInput}
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
        />
      )}
    </div>
  );
}

// Searchable phone code picker + number input — defined outside Register
function PhoneField({ label, codeValue, numberValue, onCodeChange, onNumberChange, required, full, span2 }) {
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
          className={styles.phoneNumber}
          type="tel"
          placeholder="470 123 456"
          value={numberValue}
          onChange={onNumberChange}
        />
      </div>
    </div>
  );
}

export default function Register() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { execute: register, loading } = useRegister();
  const [type, setType] = useState('private');
  const [step, setStep] = useState(0);
  const [agreed, setAgreed] = useState(false);

  const [prv, setPrv] = useState({
    firstName:'', lastName:'', email:'',
    phoneCode:'32', phone:'',
    dateOfBirth:'', gender:'', nationality:'',
    preferredLanguage:'', street:'', city:'',
    postalCode:'', country:'', password:'',
  });

  const [pro, setPro] = useState({
    tradingName:'', legalName:'', vatNumber:'',
    industry:'', website:'', street:'', city:'',
    postalCode:'', country:'',
    invoiceEmail:'', invoicingAddress:'', paymentTerms:'',
    primaryContactFirstName:'', primaryContactLastName:'',
    primaryContactEmail:'',
    primaryContactPhoneCode:'32', primaryContactPhone:'',
    primaryContactRole:'', preferredLanguage:'',
    password:'',
  });

  const data    = type === 'private' ? prv : pro;
  const setData = type === 'private' ? setPrv : setPro;
  const set     = (k) => (e) => setData(prev => ({ ...prev, [k]: e.target.value }));
  const setCode = (k) => (v)  => setData(prev => ({ ...prev, [k]: v }));

  const strength = getPasswordStrength(data.password);
  const steps    = type === 'private' ? PRIVATE_STEPS : PRO_STEPS;
  const isLast   = step === steps.length - 1;
  const handleTypeSwitch = (t) => { setType(t); setStep(0); };

  const handleRegister = async () => {
    try {
      const { password, phoneCode, primaryContactPhoneCode, ...fields } = data;

      if (type === 'private' && fields.phone !== undefined) {
        const num = fields.phone.replace(/\D/g, '').replace(/^0+/, '');
        fields.phone = `+${phoneCode}${num}`;
      }
      if (type === 'professional' && fields.primaryContactPhone !== undefined) {
        const num = fields.primaryContactPhone.replace(/\D/g, '').replace(/^0+/, '');
        fields.primaryContactPhone = `+${primaryContactPhoneCode}${num}`;
      }

      await register({ type, password, ...fields });
    } catch (err) {
      showToast(err.response?.data?.message || 'Registration failed. Please try again.', 'error');
    }
  };

  const renderPrivateStep = () => {
    switch (step) {
      case 0: return (
        <>
          <Field label="First Name" placeholder="John" value={data.firstName} onChange={set('firstName')} required />
          <Field label="Last Name" placeholder="Doe" value={data.lastName} onChange={set('lastName')} required />
          <Field label="Email" placeholder="john@example.com" type="email" value={data.email} onChange={set('email')} required />
          <PhoneField label="Phone" codeValue={data.phoneCode} numberValue={data.phone} onCodeChange={setCode('phoneCode')} onNumberChange={set('phone')} required />
          <Field label="Date of Birth" type="date" value={data.dateOfBirth} onChange={set('dateOfBirth')} />
          <Field label="Gender" placeholder="Select" select value={data.gender} onChange={set('gender')} options={[
            { value:'MALE', label:'Male' }, { value:'FEMALE', label:'Female' },
            { value:'OTHER', label:'Other' }, { value:'PREFER_NOT_TO_SAY', label:'Prefer not to say' },
          ]} />
          <Field label="Nationality" placeholder="e.g. Belgian" value={data.nationality} onChange={set('nationality')} required />
          <Field label="Language" placeholder="Select" select value={data.preferredLanguage} onChange={set('preferredLanguage')} options={LANGUAGES} required />
        </>
      );
      case 1: return (
        <>
          <Field label="Street" placeholder="Rue de la Loi 16" full value={data.street} onChange={set('street')} />
          <Field label="City" placeholder="Brussels" value={data.city} onChange={set('city')} />
          <Field label="Postal Code" placeholder="1000" value={data.postalCode} onChange={set('postalCode')} />
          <Field label="Country" placeholder="Belgium" value={data.country} onChange={set('country')} />
        </>
      );
      case 2: return (
        <>
          <Field label="Password" placeholder="Min. 8 characters" type="password" full value={data.password} onChange={set('password')} required />
          <div className={styles.strengthBar}>
            {[1,2,3,4].map(i => <div key={i} className={`${styles.strengthSeg} ${strength >= i ? styles[`filled${i}`] : ''}`} />)}
          </div>
          <div className={styles.strengthHint}>
            <span className={strength >= 1 ? styles.met : ''}>8+ chars</span>
            <span className={strength >= 2 ? styles.met : ''}>Uppercase</span>
            <span className={strength >= 3 ? styles.met : ''}>Number</span>
            <span className={strength >= 4 ? styles.met : ''}>Symbol</span>
          </div>
          <div className={styles.terms}>
            <div className={`${styles.checkbox} ${agreed ? styles.checked : ''}`} onClick={() => setAgreed(!agreed)}>
              {agreed && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>}
            </div>
            <span className={styles.termsText}>I agree to the <a href="#">Terms of Service</a> and <a href="#">Privacy Policy</a></span>
          </div>
        </>
      );
      default: return null;
    }
  };

  const renderProStep = () => {
    switch (step) {
      case 0: return (
        <>
          <Field label="Trading Name" placeholder="SunSky Travel BV" value={data.tradingName} onChange={set('tradingName')} required />
          <Field label="Legal Name" placeholder="SunSky Travel BV" value={data.legalName} onChange={set('legalName')} required />
          <Field label="VAT Number" placeholder="BE0477.123.456" value={data.vatNumber} onChange={set('vatNumber')} required />
          <Field label="Industry" placeholder="Select industry" select value={data.industry} onChange={set('industry')} options={INDUSTRIES} required />
          <Field label="Website" placeholder="https://example.com" value={data.website} onChange={set('website')} required />
          <Field label="Country" placeholder="Belgium" value={data.country} onChange={set('country')} required />
          <Field label="Street" placeholder="Rue de la Loi 16" span2 value={data.street} onChange={set('street')} />
          <Field label="City" placeholder="Brussels" value={data.city} onChange={set('city')} />
          <Field label="Postal Code" placeholder="1000" value={data.postalCode} onChange={set('postalCode')} />
        </>
      );
      case 1: return (
        <>
          <Field label="Invoice Email" placeholder="billing@company.com" type="email" span2 value={data.invoiceEmail} onChange={set('invoiceEmail')} required />
          <Field label="Payment Terms" placeholder="Select terms" select value={data.paymentTerms} onChange={set('paymentTerms')} options={PAYMENT_TERMS} />
          <Field label="Invoicing Address (if different)" placeholder="Full invoicing address" full value={data.invoicingAddress} onChange={set('invoicingAddress')} />
        </>
      );
      case 2: return (
        <>
          <Field label="First Name" placeholder="Jane" value={data.primaryContactFirstName} onChange={set('primaryContactFirstName')} required />
          <Field label="Last Name" placeholder="Smith" value={data.primaryContactLastName} onChange={set('primaryContactLastName')} required />
          <Field label="Role / Title" placeholder="e.g. Travel Manager" value={data.primaryContactRole} onChange={set('primaryContactRole')} />
          <Field label="Email" placeholder="jane@company.com" type="email" value={data.primaryContactEmail} onChange={set('primaryContactEmail')} required />
          <PhoneField label="Phone" codeValue={data.primaryContactPhoneCode} numberValue={data.primaryContactPhone} onCodeChange={setCode('primaryContactPhoneCode')} onNumberChange={set('primaryContactPhone')} required />
          <Field label="Language" placeholder="Select" select value={data.preferredLanguage} onChange={set('preferredLanguage')} options={LANGUAGES} />
        </>
      );
      case 3: return (
        <>
          <Field label="Password" placeholder="Min. 8 characters" type="password" full value={data.password} onChange={set('password')} required />
          <div className={styles.strengthBar}>
            {[1,2,3,4].map(i => <div key={i} className={`${styles.strengthSeg} ${strength >= i ? styles[`filled${i}`] : ''}`} />)}
          </div>
          <div className={styles.strengthHint}>
            <span className={strength >= 1 ? styles.met : ''}>8+ chars</span>
            <span className={strength >= 2 ? styles.met : ''}>Uppercase</span>
            <span className={strength >= 3 ? styles.met : ''}>Number</span>
            <span className={strength >= 4 ? styles.met : ''}>Symbol</span>
          </div>
          <div className={styles.terms}>
            <div className={`${styles.checkbox} ${agreed ? styles.checked : ''}`} onClick={() => setAgreed(!agreed)}>
              {agreed && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>}
            </div>
            <span className={styles.termsText}>I agree to the <a href="#">Terms of Service</a> and <a href="#">Privacy Policy</a></span>
          </div>
        </>
      );
      default: return null;
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.bgArt}>
        <div className={styles.bgGrad} />
        <div className={`${styles.blob} ${styles.blob1}`} />
        <div className={`${styles.blob} ${styles.blob2}`} />
        <div className={`${styles.blob} ${styles.blob3}`} />
        <div className={styles.ring} />
      </div>

      <div className={styles.brandPanel}>
        <Link to="/" className={styles.logo}>
          <img src={lightLogo} alt="SunSky" className={styles.logoImg} />
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
            <span className={styles.trustLabel}>Secure & GDPR-compliant</span>
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
          <div className={styles.cardHead}>
            <div className={styles.cardHeader}>
              <h1 className={styles.cardTitle}>Create your account</h1>
              <p className={styles.cardSub}>Already have an account? <Link to="/login">Sign in</Link></p>
            </div>

            <div className={styles.typeToggle}>
              <button className={`${styles.typeBtn} ${type === 'private' ? styles.active : ''}`} onClick={() => handleTypeSwitch('private')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                Private
              </button>
              <button className={`${styles.typeBtn} ${type === 'professional' ? styles.active : ''}`} onClick={() => handleTypeSwitch('professional')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><path d="M3 6h18M16 10a4 4 0 01-8 0"/></svg>
                Professional
              </button>
            </div>

            <div className={styles.stepper}>
              {steps.map((s, i) => (
                <div key={s.key} className={`${styles.stepItem} ${i === step ? styles.stepActive : ''} ${i < step ? styles.stepDone : ''}`} onClick={() => i <= step && setStep(i)}>
                  <div className={styles.stepDot}>
                    {i < step ? (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
                    ) : (
                      <span>{i + 1}</span>
                    )}
                  </div>
                  <span className={styles.stepLabel}>{s.label}</span>
                  {i < steps.length - 1 && <div className={`${styles.stepLine} ${i < step ? styles.stepLineFilled : ''}`} />}
                </div>
              ))}
            </div>
          </div>

          <div className={styles.cardBody}>
            <div className={styles.formGrid} key={`${type}-${step}`}>
              {type === 'private' ? renderPrivateStep() : renderProStep()}
            </div>
          </div>

          <div className={styles.cardFoot}>
            <div className={styles.navRow}>
              {step > 0 ? (
                <button className={styles.backBtn} onClick={() => setStep(step - 1)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                  Back
                </button>
              ) : <div />}
              {isLast ? (
                <button className={styles.submitBtn} disabled={!agreed || loading} onClick={handleRegister}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/></svg>
                  {loading ? 'Creating account…' : `Create ${type === 'private' ? 'Account' : 'Business Account'}`}
                </button>
              ) : (
                <button className={styles.nextBtn} onClick={() => setStep(step + 1)}>
                  Continue
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </button>
              )}
            </div>
            <div className={styles.guestRow}>
              <div className={styles.guestLine} />
              <button className={styles.guestBtn} onClick={() => navigate('/')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
                Continue as Guest
              </button>
              <div className={styles.guestLine} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
