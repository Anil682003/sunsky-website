import { useEffect, useState } from 'react';
import './SupportStep.css';

/*
 * The checkout's Support Package step, drawn to the client's two designs (18 Nov 2026):
 *   Flight Only    "Choose your Support Package": compact cards with an icon, a "p.p." price,
 *                  a radio and a Select button, a Compare packages link and a short note;
 *   Flight + Hotel "Your Support Package": wider cards with the radio by the title, "per person",
 *                  a "Select <level>" button and an "Important to know" box.
 * Everything on a card is dashboard configuration (Support spec v1.0 §3, §5): titles, badges,
 * descriptions, services and their statuses. Nothing here assumes how many levels exist or what
 * they are called; the design's icons and badge colours follow a level's place in the order.
 * The server prices the chosen level itself; this step only reports the code.
 */

const S = ({ children, size = 16, sw = 2, fill = 'none', ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor"
    strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>{children}</svg>
);

const ICON = {
  send: <S><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" /></S>,
  star: <S><path d="M12 2.8l2.85 5.78 6.38.93-4.62 4.5 1.09 6.35L12 17.36l-5.7 3 1.09-6.35-4.62-4.5 6.38-.93z" /></S>,
  crown: <S fill="currentColor" sw={1.4}><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 10H5L3 8z" /></S>,
  shield: <S><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></S>,
  plane: <S><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" /></S>,
  bed: <S><path d="M2 20v-8a2 2 0 012-2h16a2 2 0 012 2v8" /><path d="M4 10V6a2 2 0 012-2h12a2 2 0 012 2v4" /><line x1="2" y1="20" x2="22" y2="20" /></S>,
  checkCircle: <S sw={2.2}><circle cx="12" cy="12" r="9" /><path d="M8.5 12.5l2.5 2.5 4.5-5" /></S>,
  euroCircle: <S sw={1.9}><circle cx="12" cy="12" r="9" /><path d="M14.8 8.6a3.6 3.6 0 100 6.8" /><line x1="8" y1="11" x2="12.5" y2="11" /><line x1="8" y1="13.2" x2="12.5" y2="13.2" /></S>,
  xCircle: <S sw={1.9}><circle cx="12" cy="12" r="9" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></S>,
  check: <S sw={2.6}><path d="M20 6L9 17l-5-5" /></S>,
  info: <S sw={2.2}><circle cx="12" cy="12" r="9" /><line x1="12" y1="11" x2="12" y2="16.5" /><circle cx="12" cy="7.8" r="0.9" fill="currentColor" stroke="none" /></S>,
  scale: <S><path d="M12 3v18" /><path d="M5 21h14" /><path d="M3 7h18" /><path d="M6 7l-3 7a4 4 0 006 0L6 7z" /><path d="M18 7l-3 7a4 4 0 006 0l-3-7z" /></S>,
  arrowR: <S sw={2.4}><path d="M5 12h14" /><path d="M12 5l7 7-7 7" /></S>,
  close: <S sw={2.4}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></S>,
};

/** The design's level icons, by place: the first level, the levels between, the last one. */
const levelIcon = (i, n) => (i === 0 ? ICON.send : i === n - 1 ? ICON.crown : ICON.star);
const levelTone = (i, n) => (i === 0 ? 'tone-1' : i === n - 1 ? 'tone-3' : 'tone-2');

const statusIcon = (status) => (status === 'INCLUDED' ? ICON.checkCircle : status === 'PAID' ? ICON.euroCircle : ICON.xCircle);

function unitText(t, unit) {
  if (unit === 'PER_REQUEST') return t('checkout:support.perRequest', 'per request');
  if (unit === 'PER_PERSON') return t('checkout:support.perPerson', 'per person');
  return t('checkout:support.perBooking', 'per booking');
}

/** One service line: its status icon, its text and what it costs under this level. */
function ServiceRow({ s, t, money }) {
  return (
    <span className={`ck-sup-row ${String(s.status).toLowerCase()}`}>
      <span className="ck-sup-mark">{statusIcon(s.status)}</span>
      <span className="ck-sup-text">{s.text}</span>
      <span className="ck-sup-val">
        {s.status === 'INCLUDED' && t('checkout:support.included', 'Included')}
        {s.status === 'NOT_INCLUDED' && t('checkout:support.notIncluded', 'Not included')}
        {s.status === 'PAID' && (
          <>
            <b>{money(s.fee)}</b>
            <small>{unitText(t, s.feeUnit)}</small>
          </>
        )}
      </span>
    </span>
  );
}

/** "Compare packages": every service down the side, every level across. */
function CompareDialog({ levels, onClose, t, money }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const services = [];
  for (const lvl of levels) {
    for (const s of lvl.services || []) {
      if (!services.some((x) => x.code === s.code)) services.push({ code: s.code, text: s.text });
    }
  }
  return (
    <div className="ck-sup-cmp-overlay" role="presentation" onClick={onClose}>
      <div className="ck-sup-cmp" role="dialog" aria-modal="true" aria-label={t('checkout:support.compareTitle', 'Compare packages')}
        onClick={(e) => e.stopPropagation()}>
        <div className="ck-sup-cmp-head">
          <h3 className="hd">{t('checkout:support.compareTitle', 'Compare packages')}</h3>
          <button type="button" className="ck-sup-cmp-close" onClick={onClose} aria-label={t('checkout:support.close', 'Close')}>{ICON.close}</button>
        </div>
        <div className="ck-sup-cmp-scroll">
          <table>
            <thead>
              <tr>
                <th>{t('checkout:support.service', 'Service')}</th>
                {levels.map((l) => (
                  <th key={l.code}>
                    <span>{l.title}</span>
                    <small>{money(l.price)} {l.pricingUnit === 'PER_PERSON' ? t('checkout:support.pp', 'p.p.') : t('checkout:support.perBooking', 'per booking')}</small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {services.map((svc) => (
                <tr key={svc.code}>
                  <td>{svc.text}</td>
                  {levels.map((l) => {
                    const s = (l.services || []).find((x) => x.code === svc.code);
                    if (!s) return <td key={l.code} className="none">-</td>;
                    return (
                      <td key={l.code} className={String(s.status).toLowerCase()}>
                        <span className="ck-sup-cmp-cell">
                          {statusIcon(s.status)}
                          {s.status === 'INCLUDED' && t('checkout:support.included', 'Included')}
                          {s.status === 'NOT_INCLUDED' && t('checkout:support.notIncluded', 'Not included')}
                          {s.status === 'PAID' && <>{money(s.fee)} <small>{unitText(t, s.feeUnit)}</small></>}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function SupportStep({ product, levels, loaded, pickedCode, onPick, pax, money, t }) {
  const [comparing, setComparing] = useState(false);
  const flightHotel = product === 'FLIGHT_HOTEL';
  const n = levels.length;

  const head = flightHotel ? (
    <div className="ck-sup-head2">
      <div className="ck-sup-titlewrap">
        <span className="ck-sup-shield">{ICON.shield}</span>
        <div>
          <h2 className="hd">{t('checkout:support.titleFlightHotel', 'Your Support Package')}</h2>
          <p>{t('checkout:support.subFlightHotel', 'Choose the level of SUNSKY support for your flight + hotel booking.')}</p>
        </div>
      </div>
      <div className="ck-sup-prodtag">
        <span className="ck-sup-prodtag-ico">{ICON.plane}<i>+</i>{ICON.bed}</span>
        <span>{t('checkout:support.productFlightHotel', 'Flight + Hotel')}</span>
      </div>
    </div>
  ) : (
    <div className="ck-sup-head1">
      <div>
        <h2 className="hd">{t('checkout:support.titleFlightOnly', 'Choose your Support Package')}</h2>
        <p className="ck-sup-prod">{t('checkout:support.productFlightOnly', 'Flight Only')}</p>
      </div>
      <div className="ck-sup-peace">
        <span className="ck-sup-peace-ico">{ICON.plane}</span>
        <span>
          <b>{t('checkout:support.peaceTitle', 'More peace of mind for your journey')}</b>
          <small>{t('checkout:support.peaceSub', 'Flexible support from the SUNSKY team.')}</small>
        </span>
      </div>
    </div>
  );

  return (
    <section className={`ck-card ck-reveal ck-sup ${flightHotel ? 'v-wide' : 'v-compact'}`}>
      {head}

      {!loaded ? (
        <p className="ck-pick-note">{t('checkout:support.loading', 'Loading support packages…')}</p>
      ) : (
        <>
          <div className={`ck-sup-grid cols-${Math.min(Math.max(n, 1), 4)}`}>
            {levels.map((lvl, i) => {
              const picked = lvl.code === pickedCode;
              const people = lvl.pricingUnit === 'PER_PERSON' ? Math.max(1, pax) : 1;
              const unit = lvl.pricingUnit === 'PER_PERSON'
                ? (flightHotel ? t('checkout:support.perPerson', 'per person') : t('checkout:support.pp', 'p.p.'))
                : t('checkout:support.perBooking', 'per booking');
              const badge = lvl.badge
                ? <span className={`ck-sup-badge ${i === n - 1 && n > 1 ? 'best' : 'hot'}`}>{lvl.badge}</span>
                : null;
              return (
                <button
                  type="button"
                  key={lvl.code}
                  className={`ck-sup-card ${levelTone(i, n)}${picked ? ' act' : ''}`}
                  aria-pressed={picked}
                  onClick={() => onPick(lvl.code)}
                >
                  {flightHotel ? (
                    <span className="ck-sup-top">
                      <span className="ck-sup-radio">{picked && <i />}</span>
                      <span className="ck-sup-name hd">{lvl.title}</span>
                      {badge}
                    </span>
                  ) : (
                    <>
                      {badge}
                      <span className="ck-sup-top">
                        <span className="ck-sup-ico">{levelIcon(i, n)}</span>
                        <span className="ck-sup-name hd">{lvl.title}</span>
                      </span>
                    </>
                  )}

                  <span className="ck-sup-price">
                    <strong>{money(lvl.price)}</strong>
                    <small>{unit}</small>
                  </span>
                  {/* What the party pays, so a per-person price does not read as the whole
                      charge for a family of four. */}
                  {lvl.price > 0 && people > 1 && (
                    <span className="ck-sup-total">
                      {t('checkout:support.totalForParty', {
                        count: people,
                        amount: money(Math.round(lvl.price * people * 100) / 100),
                        defaultValue: '{{amount}} for {{count}} travellers',
                      })}
                    </span>
                  )}

                  {lvl.description && <span className="ck-sup-desc">{lvl.description}</span>}

                  {lvl.services.length > 0 && (
                    <span className="ck-sup-list">
                      {lvl.services.map((s) => <ServiceRow key={s.code} s={s} t={t} money={money} />)}
                    </span>
                  )}

                  {flightHotel ? (
                    <span className={`ck-sup-pick${picked ? ' act' : ''}`}>
                      {picked && ICON.check}
                      {t('checkout:support.selectLevel', { level: lvl.title, defaultValue: 'Select {{level}}' })}
                    </span>
                  ) : (
                    <span className="ck-sup-foot">
                      <span className="ck-sup-radio">{picked && <i />}</span>
                      <span className={`ck-sup-pick${picked ? ' act' : ''}`}>
                        {picked
                          ? <>{ICON.check} {t('checkout:support.selected', 'Selected')}</>
                          : t('checkout:support.select', 'Select')}
                      </span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {flightHotel ? (
            <div className="ck-sup-important">
              <span className="ck-sup-important-ico">{ICON.info}</span>
              <div>
                <b>{t('checkout:support.importantTitle', 'Important to know')}</b>
                <p>{t('checkout:support.importantText', 'SUNSKY Support Packages cover SUNSKY service and handling fees. Airline, hotel and other supplier charges (such as fare differences, airline modification fees, baggage fees, hotel fees, etc.) remain payable separately where applicable. Support services are assistance services. Changes, cancellations or other requests remain subject to airline, hotel and supplier rules and availability.')}</p>
              </div>
            </div>
          ) : (
            <>
              {n > 1 && (
                <button type="button" className="ck-sup-compare" onClick={() => setComparing(true)}>
                  <span className="ck-sup-compare-ico">{ICON.scale}</span>
                  <span>
                    <b>{t('checkout:support.compare', 'Compare packages')} {ICON.arrowR}</b>
                    <small>{t('checkout:support.compareSub', 'See full details and differences between our support packages.')}</small>
                  </span>
                </button>
              )}
              {/* §5.1: the statuses cover the SUNSKY service fee and nothing else. */}
              <p className="ck-sup-note">
                {ICON.info}
                <span>{t('checkout:support.noteFlightOnly', 'Support packages cover SUNSKY service and handling fees only. Airline, supplier charges and fare differences remain payable separately.')}</span>
              </p>
            </>
          )}
        </>
      )}

      {comparing && <CompareDialog levels={levels} onClose={() => setComparing(false)} t={t} money={money} />}
    </section>
  );
}
