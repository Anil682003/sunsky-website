import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plane, User, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import styles from './Auth.module.css';

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '' });
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    // TODO: replace with real API call
    console.log('Register payload:', form);
    setTimeout(() => setLoading(false), 800);
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logoRow} onClick={() => navigate('/')}>
          <div className={styles.logoIcon}><Plane size={20} /></div>
          <span className={styles.logoText}>Sun<span className={styles.logoAccent}>sky</span></span>
        </div>

        <h1 className={styles.title}>Create account</h1>
        <p className={styles.subtitle}>Start booking your next adventure</p>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>First Name</label>
              <div className={styles.inputWrap}>
                <User size={16} className={styles.inputIcon} />
                <input className={styles.input} placeholder="John" value={form.firstName} onChange={set('firstName')} required />
              </div>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Last Name</label>
              <div className={styles.inputWrap}>
                <User size={16} className={styles.inputIcon} />
                <input className={styles.input} placeholder="Doe" value={form.lastName} onChange={set('lastName')} required />
              </div>
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Email</label>
            <div className={styles.inputWrap}>
              <Mail size={16} className={styles.inputIcon} />
              <input type="email" className={styles.input} placeholder="you@example.com" value={form.email} onChange={set('email')} required />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Password</label>
            <div className={styles.inputWrap}>
              <Lock size={16} className={styles.inputIcon} />
              <input
                type={showPass ? 'text' : 'password'}
                className={styles.input}
                placeholder="••••••••"
                value={form.password}
                onChange={set('password')}
                required
              />
              <button type="button" className={styles.eyeBtn} onClick={() => setShowPass((s) => !s)}>
                {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>

        <p className={styles.switchText}>
          Already have an account?{' '}
          <button className={styles.switchLink} onClick={() => navigate('/login')}>Sign In</button>
        </p>
      </div>
    </div>
  );
}
