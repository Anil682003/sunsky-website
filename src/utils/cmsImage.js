import { BASE_URL } from './ip';

// Resolve the upload origin the same way axiosInstance picks the API base, so
// dashboard-uploaded images resolve against whatever backend the app talks to
// (env override wins; falls back to the server-managed BASE_URL const).
const API_BASE = import.meta.env.VITE_API_URL || BASE_URL;
const UPLOAD_BASE = API_BASE.replace(/\/api\/?$/, '');

/**
 * Resolve a CMS image reference to a loadable URL.
 *
 * Images entered as a full URL (Unsplash, etc.) are used as-is. Images uploaded
 * through the dashboard are stored as a server-relative path ("/uploads/…"),
 * which only resolves against the ADMIN backend origin — not the customer site —
 * so those must be prefixed with the upload base. Returns '' for empty input.
 */
export function resolveCmsImageUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const u = url.trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u) || u.startsWith('data:')) return u;
  return `${UPLOAD_BASE}/${u.replace(/^\/+/, '')}`;
}
