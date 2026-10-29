import { useEffect, useLayoutEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styles from './HomeTopStrip.module.css';
import { pick, headerLink, newTabProps } from '../../utils/siteHeader';
import TrustpilotRating from '../../components/Trustpilot/TrustpilotRating';
import TrustpilotBadge from '../../components/Trustpilot/TrustpilotBadge';
import LanguageSwitch from '../../components/LanguageSwitch/LanguageSwitch';

// The homepage's top strip (the client's header design, Oct 2026): the Trustpilot rating on the
// left, the CMS announcement in the middle, the language switch on the right, on brand blue, with
// the white header card floating below it over the hero photo.
//
// It stands in for AnnouncementBar on the homepage only, and keeps the same contract: its height
// is published as --announce-h on <html>, and --nav-h (which every page clears) is the bar plus
// that. Unlike the announcement strip it shows whenever it has anything to carry, not only while
// an announcement is live, because the rating and the language switch live here now. It has no
// close button: it is part of the header, not a notice. On a phone it shrinks back to the plain
// announcement line (the rating has no room, the language switch is in the menu).
const PHONE_QUERY = '(max-width: 900px)';
const STRIP_H = 54;
const PHONE_H = 36;

const isPhone = () => (typeof window.matchMedia === 'function' ? window.matchMedia(PHONE_QUERY).matches : false);

export default function HomeTopStrip({ announcement, trustpilot, language }) {
  const { t, i18n } = useTranslation('common');
  const lang = i18n.resolvedLanguage || i18n.language;
  const [phone, setPhone] = useState(isPhone);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia(PHONE_QUERY);
    const onChange = () => setPhone(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  const shows = (showOn) => (phone ? showOn !== 'desktop' : showOn !== 'mobile');
  const announceHere = Boolean(announcement?.live) && shows(announcement.showOn);
  const trustHere = !phone && trustpilot?.enabled && shows(trustpilot.showOn);
  const langHere = !phone && language?.enabled && shows(language.showOn);
  const height = phone ? (announceHere ? PHONE_H : 0) : (announceHere || trustHere || langHere ? STRIP_H : 0);

  // Layout, not effect: the bar must move in the same frame the strip appears.
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--announce-h', `${height}px`);
    return () => root.style.removeProperty('--announce-h');
  }, [height]);

  if (!height) return null;

  const message = announceHere ? pick(announcement.text, lang) : '';
  const linkLabel = announceHere ? pick(announcement.linkLabel, lang) : '';
  const link = announceHere ? headerLink(announcement.link, announcement.newTab) : null;
  const go = (content, className) => {
    if (!link) return content;
    return link.router
      ? <Link to={link.href} className={className}>{content}</Link>
      : <a href={link.href} className={className} {...newTabProps(link.newTab)}>{content}</a>;
  };

  return (
    <div
      className={`${styles.strip} ${styles[announcement?.tone] || styles.blue}`}
      role="region"
      aria-label={announceHere ? t('nav.announcement', 'Announcement') : t('nav.topStrip', 'Reviews and language')}
      data-tone={announcement?.tone || 'blue'}
    >
      <div className={styles.inner}>
        {trustHere && (
          <div className={styles.left}>
            {trustpilot.score
              ? <TrustpilotRating score={trustpilot.score} tone="onDark" />
              : <TrustpilotBadge />}
            <span className={styles.divider} aria-hidden="true" />
          </div>
        )}

        <p className={styles.center} title={message || undefined}>
          {announceHere && (linkLabel && link ? (
            <>
              <span className={styles.text}>{message}</span>
              {go(
                <>
                  {linkLabel}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
                </>,
                styles.pill,
              )}
            </>
          ) : go(<span className={styles.text}>{message}</span>, styles.textLink))}
        </p>

        {langHere && (
          <div className={styles.right}>
            <LanguageSwitch tone="onDark" />
          </div>
        )}
      </div>
    </div>
  );
}
