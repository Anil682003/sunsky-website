import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import lightLogo from '../../assets/light-logo.png';
import styles from './Register.module.css';

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

export default function Register() {
  const navigate = useNavigate();
  const [type, setType] = useState('private');
  const [step, setStep] = useState(0);
  const [agreed, setAgreed] = useState(false);

  const [prv, setPrv] = useState({
    firstName:'', lastName:'', email:'', phone:'',
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
    primaryContactEmail:'', primaryContactPhone:'',
    primaryContactRole:'', preferredLanguage:'',
    password:'',
  });

  const data = type === 'private' ? prv : pro;
  const setData = type === 'private' ? setPrv : setPro;
  const update = (k, v) => setData(prev => ({ ...prev, [k]: v }));
  const strength = getPasswordStrength(data.password);
  const steps = type === 'private' ? PRIVATE_STEPS : PRO_STEPS;
  const isLast = step === steps.length - 1;
  const handleTypeSwitch = (t) => { setType(t); setStep(0); };

  const F = ({ name, label, placeholder, type: t = 'text', full, span2, required, select, options }) => (
    <div className={`${styles.field} ${full ? styles.fieldFull : ''} ${span2 ? styles.fieldSpan2 : ''}`}>
      <label className={styles.fieldLabel}>{label}{required && ' *'}</label>
      {select ? (
        <select className={styles.fieldSelect} value={data[name]} onChange={e => update(name, e.target.value)}>
          <option value="">{placeholder}</option>
          {options.map(o => typeof o === 'string'
            ? <option key={o} value={o}>{o}</option>
            : <option key={o.value} value={o.value}>{o.label}</option>
          )}
        </select>
      ) : (
        <input className={styles.fieldInput} type={t} placeholder={placeholder} value={data[name]} onChange={e => update(name, e.target.value)} />
      )}
    </div>
  );

  const renderPrivateStep = () => {
    switch (step) {
      case 0: return (
        <>
          <F name="firstName" label="First Name" placeholder="John" required />
          <F name="lastName" label="Last Name" placeholder="Doe" required />
          <F name="email" label="Email" placeholder="john@example.com" type="email" required />
          <F name="phone" label="Phone" placeholder="+32 470 123 456" type="tel" required />
          <F name="dateOfBirth" label="Date of Birth" type="date" />
          <F name="gender" label="Gender" placeholder="Select" select options={[
            { value:'MALE', label:'Male' }, { value:'FEMALE', label:'Female' },
            { value:'OTHER', label:'Other' }, { value:'PREFER_NOT_TO_SAY', label:'Prefer not to say' },
          ]} />
          <F name="nationality" label="Nationality" placeholder="e.g. Belgian" required />
          <F name="preferredLanguage" label="Language" placeholder="Select" select options={LANGUAGES} required />
        </>
      );
      case 1: return (
        <>
          <F name="street" label="Street" placeholder="Rue de la Loi 16" full />
          <F name="city" label="City" placeholder="Brussels" />
          <F name="postalCode" label="Postal Code" placeholder="1000" />
          <F name="country" label="Country" placeholder="Belgium" />
        </>
      );
      case 2: return (
        <>
          <F name="password" label="Password" placeholder="Min. 8 characters" type="password" full required />
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
          <F name="tradingName" label="Trading Name" placeholder="SunSky Travel BV" required />
          <F name="legalName" label="Legal Name" placeholder="SunSky Travel BV" required />
          <F name="vatNumber" label="VAT Number" placeholder="BE0477.123.456" required />
          <F name="industry" label="Industry" placeholder="Select industry" select options={INDUSTRIES} required />
          <F name="website" label="Website" placeholder="https://example.com" required />
          <F name="country" label="Country" placeholder="Belgium" required />
          <F name="street" label="Street" placeholder="Rue de la Loi 16" span2 />
          <F name="city" label="City" placeholder="Brussels" />
          <F name="postalCode" label="Postal Code" placeholder="1000" />
        </>
      );
      case 1: return (
        <>
          <F name="invoiceEmail" label="Invoice Email" placeholder="billing@company.com" type="email" span2 required />
          <F name="paymentTerms" label="Payment Terms" placeholder="Select terms" select options={PAYMENT_TERMS} />
          <F name="invoicingAddress" label="Invoicing Address (if different)" placeholder="Full invoicing address" full />
        </>
      );
      case 2: return (
        <>
          <F name="primaryContactFirstName" label="First Name" placeholder="Jane" required />
          <F name="primaryContactLastName" label="Last Name" placeholder="Smith" required />
          <F name="primaryContactRole" label="Role / Title" placeholder="e.g. Travel Manager" />
          <F name="primaryContactEmail" label="Email" placeholder="jane@company.com" type="email" required />
          <F name="primaryContactPhone" label="Phone" placeholder="+32 470 123 456" type="tel" required />
          <F name="preferredLanguage" label="Language" placeholder="Select" select options={LANGUAGES} />
        </>
      );
      case 3: return (
        <>
          <F name="password" label="Password" placeholder="Min. 8 characters" type="password" full required />
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
          {/* Fixed header */}
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

          {/* Scrollable body */}
          <div className={styles.cardBody}>
            <div className={styles.formGrid} key={`${type}-${step}`}>
              {type === 'private' ? renderPrivateStep() : renderProStep()}
            </div>
          </div>

          {/* Fixed footer */}
          <div className={styles.cardFoot}>
            <div className={styles.navRow}>
              {step > 0 ? (
                <button className={styles.backBtn} onClick={() => setStep(step - 1)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                  Back
                </button>
              ) : <div />}
              {isLast ? (
                <button className={styles.submitBtn} disabled={!agreed}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/></svg>
                  Create {type === 'private' ? 'Account' : 'Business Account'}
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
