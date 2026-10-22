import { useLayoutEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styles from './AnnouncementBar.module.css';
import { pick, headerLink, newTabProps, showOnClass, announcementKey } from '../../utils/siteHeader';

// The thin strip above the header bar (CMS -> Layout -> Header -> Announcement).
//
// It sits ABOVE the bar rather than inside it, and the bar moves down to make room: the strip
// publishes its height as --announce-h on <html>, and --nav-h (which every page already clears
// the fixed bar with) is the bar plus that. So no page needs to know the strip exists, and when
// it is dismissed or switched off everything slides back to where it was.
//
// One line, always. A second line on a phone would make the height depend on the words, and the
// height is the contract every page reads; the text ellipses instead, and the full sentence is
// on the element's title for anyone who wants it.

// The bar's own breakpoint: the burger appears at 900px, and that is where showOn draws the
// line between 'desktop' and 'mobile'.
const PHONE_QUERY = '(max-width: 900px)';
const STRIP_H = 36;

// Remembered per announcement, not per site: dismissing the autumn sale must not also hide
// the winter one. Storage can be missing or blocked (private mode), so every access is
// guarded and the strip simply shows again next visit.
const DISMISS_KEY = 'sunsky.announcementDismissed';
const readDismissed = () => {
  try {
    return localStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
};
const writeDismissed = (value) => {
  try {
    localStorage.setItem(DISMISS_KEY, value);
  } catch { /* storage blocked: dismissed for this page view only */ }
};

export default function AnnouncementBar({ announcement }) {
  const { t, i18n } = useTranslation('common');
  const lang = i18n.resolvedLanguage || i18n.language;
  const key = announcementKey(announcement);
  const [dismissedKey, setDismissedKey] = useState(readDismissed);

  const visible = Boolean(announcement?.live) && dismissedKey !== key;
  const showOn = announcement?.showOn || 'all';

  // Layout, not effect: the bar must move down in the same frame the strip appears, or the
  // first paint shows the strip sitting on top of the bar's contents.
  useLayoutEffect(() => {
    if (!visible) return undefined;
    const root = document.documentElement;
    const mq = typeof window.matchMedia === 'function' ? window.matchMedia(PHONE_QUERY) : null;
    // A strip the stylesheet hides at this width takes no room either; otherwise a desktop-only
    // announcement would leave a 36px gap above the bar on every phone.
    const apply = () => {
      const phone = Boolean(mq?.matches);
      const hidden = (showOn === 'desktop' && phone) || (showOn === 'mobile' && !phone);
      root.style.setProperty('--announce-h', hidden ? '0px' : `${STRIP_H}px`);
    };
    apply();
    mq?.addEventListener?.('change', apply);
    return () => {
      mq?.removeEventListener?.('change', apply);
      root.style.removeProperty('--announce-h');
    };
  }, [visible, showOn]);

  if (!visible) return null;

  const message = pick(announcement.text, lang);
  const linkLabel = pick(announcement.linkLabel, lang);
  const link = headerLink(announcement.link, announcement.newTab);

  // With a link but no link label, the sentence itself is the link: "a link with no words" is
  // the most likely way an editor fills this in, and it should still go somewhere.
  const renderLink = (content, className) => {
    if (!link) return content;
    return link.router
      ? <Link to={link.href} className={className}>{content}</Link>
      : <a href={link.href} className={className} {...newTabProps(link.newTab)}>{content}</a>;
  };

  const dismiss = () => {
    setDismissedKey(key);
    writeDismissed(key);
  };

  return (
    <div
      className={`${styles.strip} ${styles[announcement.tone] || styles.orange} ${showOnClass(showOn, styles)}`}
      role="region"
      aria-label={t('nav.announcement', 'Announcement')}
      data-tone={announcement.tone}
    >
      <p className={styles.inner} title={message}>
        {linkLabel && link ? (
          <>
            <span className={styles.text}>{message}</span>
            {renderLink(
              <>
                {linkLabel}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
              </>,
              styles.link,
            )}
          </>
        ) : (
          renderLink(<span className={styles.text}>{message}</span>, styles.textLink)
        )}
      </p>
      {announcement.dismissible && (
        <button
          type="button"
          className={styles.close}
          onClick={dismiss}
          aria-label={t('nav.dismissAnnouncement', 'Close announcement')}
          title={t('nav.dismissAnnouncement', 'Close announcement')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      )}
    </div>
  );
}
