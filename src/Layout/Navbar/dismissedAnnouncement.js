// Which announcement the visitor closed, remembered per announcement rather than per site:
// closing the autumn sale must not also hide the winter one (the key is announcementKey()).
// Storage can be missing or blocked (private mode), so every access is guarded and the
// announcement simply shows again on the next visit.
const DISMISS_KEY = 'sunsky.announcementDismissed';

export const readDismissed = () => {
  try {
    return localStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
};

export const writeDismissed = (value) => {
  try {
    localStorage.setItem(DISMISS_KEY, value);
  } catch { /* storage blocked: closed for this page view only */ }
};
