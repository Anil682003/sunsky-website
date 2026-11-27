import { useTranslation } from 'react-i18next';
import { hotelInfoSections, localMoney, withEmailLinks } from '../../utils/hotelInfo';
import styles from './HotelInfoBox.module.css';

/**
 * "Belangrijke informatie van het hotel" (Levent, 27 Nov 2026): one box per hotel with only the
 * sections that apply — local taxes and charges (V1.1), security deposit (V1.1 §4), the general
 * hotel transfer notice (V1.2). Always open: mandatory information is never folded away before
 * booking. Renders nothing when the box is not live or has nothing to say.
 *
 * `info` is what useHotelInfo answers ({ live, notice, deposit }); `localCharges` comes from the
 * selected rate's live check; `snapshot` (confirmation page) is the booking's saved box instead.
 */
export default function HotelInfoBox({ info = null, localCharges = null, snapshot = null, className = '' }) {
  const { t, i18n } = useTranslation('common');
  const lang = String(i18n.language || 'nl').toLowerCase().startsWith('en') ? 'en' : 'nl';
  const live = snapshot ? !!snapshot.shown : !!info?.live;
  if (!live) return null;
  const sections = hotelInfoSections({
    localCharges: snapshot ? snapshot.localCharges : localCharges,
    deposit: snapshot ? snapshot.deposit : info?.deposit,
    notice: snapshot ? snapshot.notice : info?.notice,
    lang,
  });
  if (!sections.length) return null;

  const TITLES = {
    local: t('hotelInfo.localTitle', 'Local taxes and charges'),
    deposit: t('hotelInfo.depositTitle', 'Security deposit'),
    notice: t('hotelInfo.noticeTitle', 'Important information about hotel transfers'),
  };
  const line = (l) => {
    if (l.text != null) {
      return withEmailLinks(l.text).map((p, i) => (p.email
        ? <a key={i} href={`mailto:${p.email}`}>{p.email}</a>
        : <span key={i}>{p.text}</span>));
    }
    const amount = l.money ? localMoney(l.money.amount, l.money.currency) : undefined;
    return t(l.key, { amount, defaultValue: '' });
  };

  return (
    <section className={`${styles.box} ${className}`} aria-labelledby="hotel-info-title">
      <h3 id="hotel-info-title" className={styles.head}>{t('hotelInfo.title', 'Important hotel information')}</h3>
      {sections.map((s) => (
        <div key={s.key} className={`${styles.section} ${styles[s.key] || ''}`}>
          <h4 className={styles.title}>{TITLES[s.key]}</h4>
          {s.lines.map((l, i) => (
            <p key={i} className={l.money ? styles.amount : styles.text}>{line(l)}</p>
          ))}
          {s.note && <p className={styles.note}>{t(s.note, 'Not included in the amount you pay to SUNSKY.')}</p>}
        </div>
      ))}
    </section>
  );
}
