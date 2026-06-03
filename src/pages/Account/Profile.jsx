import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import axiosInstance from '../../services/axiosInstance';
import { updateUser } from '../../store/slices/authSlice';

const Field = ({ label, value }) => (
  <div style={s.field}>
    <div style={s.fieldLabel}>{label}</div>
    <div style={s.fieldValue}>{value || '—'}</div>
  </div>
);

export default function Profile() {
  const dispatch = useDispatch();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    axiosInstance.get('/public/auth/me')
      .then((res) => {
        setProfile(res.data.data);
        dispatch(updateUser({ name: res.data.data.name, email: res.data.data.email }));
      })
      .catch((err) => setError(err.response?.data?.message || 'Failed to load profile'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={s.center}>Loading profile…</div>;
  if (error)   return <div style={{ ...s.center, color: '#dc2626' }}>{error}</div>;
  if (!profile) return null;

  const cp = profile.customerProfile;
  const isPrivate = cp?.type === 'private';
  const isPro = cp?.type === 'professional';

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.avatar}>{(profile.name || 'U')[0].toUpperCase()}</div>
        <div>
          <div style={s.name}>{profile.name}</div>
          <div style={s.email}>{profile.email}</div>
          <div style={s.roleBadge}>{isPro ? 'Professional Account' : 'Private Account'}</div>
        </div>
      </div>

      {cp && (
        <div style={s.section}>
          <div style={s.sectionTitle}>{isPro ? 'Company Details' : 'Personal Details'}</div>
          <div style={s.grid}>
            {isPrivate && (
              <>
                <Field label="First Name" value={cp.firstName} />
                <Field label="Last Name" value={cp.lastName} />
                <Field label="Phone" value={cp.phone} />
                <Field label="Nationality" value={cp.nationality} />
                <Field label="Date of Birth" value={cp.dateOfBirth} />
                <Field label="Gender" value={cp.gender} />
                <Field label="Customer Code" value={cp.customerCode} />
                <Field label="Preferred Language" value={cp.preferredLanguage} />
              </>
            )}
            {isPro && (
              <>
                <Field label="Trading Name" value={cp.tradingName} />
                <Field label="Legal Name" value={cp.legalName} />
                <Field label="VAT Number" value={cp.vatNumber} />
                <Field label="Industry" value={cp.industry} />
                <Field label="Website" value={cp.website} />
                <Field label="Customer Code" value={cp.customerCode} />
                <Field label="Contact Person" value={`${cp.primaryContactFirstName || ''} ${cp.primaryContactLastName || ''}`.trim()} />
                <Field label="Contact Phone" value={cp.primaryContactPhone} />
              </>
            )}
          </div>
        </div>
      )}

      {cp && (
        <div style={s.section}>
          <div style={s.sectionTitle}>Address</div>
          <div style={s.grid}>
            <Field label="Street" value={[cp.street, cp.houseNumber].filter(Boolean).join(' ')} />
            <Field label="City" value={cp.city} />
            <Field label="Postal Code" value={cp.postalCode} />
            <Field label="Country" value={cp.country} />
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  page:         { padding: '32px 24px', maxWidth: 760, margin: '0 auto' },
  center:       { textAlign: 'center', padding: '60px 0', color: '#64748b', fontSize: 15 },
  header:       { display: 'flex', alignItems: 'center', gap: 20, marginBottom: 32, padding: '20px 24px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12 },
  avatar:       { width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg,#f5a51e,#f97316)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, flexShrink: 0 },
  name:         { fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 2 },
  email:        { fontSize: 13, color: '#64748b', marginBottom: 6 },
  roleBadge:    { display: 'inline-block', padding: '2px 10px', background: '#eff6ff', color: '#2563eb', borderRadius: 20, fontSize: 11, fontWeight: 700 },
  section:      { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 24px', marginBottom: 16 },
  sectionTitle: { fontSize: 13, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 16 },
  grid:         { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '14px 24px' },
  field:        { display: 'flex', flexDirection: 'column', gap: 3 },
  fieldLabel:   { fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldValue:   { fontSize: 14, fontWeight: 500, color: '#1e293b' },
};
