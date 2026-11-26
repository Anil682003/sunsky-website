/* ═══════════════════════════════════════════════════════════════════════════
   "Garantie en voorwaarden" (SUNSKY Checkout Terms & Conditions spec V1.3 FINAL).

   Everything here is drawn from the server's terms view (termsApi.js): the approved
   wording, the document behind every link and which checkboxes are mandatory. Before the
   customer accepts, links are neutral and nothing carries a tick or a green mark (§3.7);
   checkboxes are never preselected (§4, §5.5).
   ═══════════════════════════════════════════════════════════════════════════ */
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const TICK = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

/** A document link: always a new tab, so the checkout keeps everything typed so far (§18). */
export function DocLink({ doc, children }) {
  if (!doc?.url) return <span>{children || doc?.label || doc?.name}</span>;
  return (
    <a className="ck-terms-link" href={doc.url} target="_blank" rel="noopener noreferrer">
      {children || doc.label || doc.name}
    </a>
  );
}

/**
 * The approved sentence, segment by segment. A segment that names the booking's own
 * description or its important information opens the dialog built from this booking; one that
 * names a document links to it; one whose document is not configured stays plain text rather
 * than becoming a dead link.
 */
export function TermsText({ segments, links, onOpen }) {
  return (segments || []).map((s, i) => {
    if (!s.link) return <span key={i}>{s.text}</span>;
    if (s.link === 'TRAVEL_DESCRIPTION' || s.link === 'IMPORTANT_TRAVEL_INFO') {
      return (
        <button key={i} type="button" className="ck-terms-link ck-terms-linkbtn" onClick={() => onOpen?.(s.link)}>
          {s.text}
        </button>
      );
    }
    const doc = links?.[s.link];
    return doc?.url ? <DocLink key={i} doc={doc}>{s.text}</DocLink> : <span key={i}>{s.text}</span>;
  });
}

/** One mandatory acceptance: a native checkbox in the checkout's own condition-row look. */
function AcceptRow({ checked, onChange, children, error, name }) {
  return (
    // `ck-err` is what the checkout scrolls to when a payment attempt finds something missing.
    <div className={`ck-terms-accept${error ? ' ck-err' : ''}`}>
      <label className={`ck-cond-item${checked ? ' on' : ''}`}>
        <input type="checkbox" name={name} checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="ck-cond-box" aria-hidden="true">{TICK}</span>
        <span className="ck-cond-text">{children}</span>
      </label>
      {error && <div className="ck-errmsg ck-cond-errmsg">{error}</div>}
    </div>
  );
}

export function TermsSection({
  terms, loading, failed, onRetry, travelAccepted, insuranceAccepted, onTravel, onInsurance, errors = {}, notice, onOpen,
}) {
  const { t } = useTranslation(['checkout']);

  if (!terms) {
    return (
      <section className="ck-terms ck-terms-pending" aria-busy={loading ? 'true' : 'false'}>
        <h3 className="ck-terms-title hd">{t('checkout:terms.title', 'Garantie en voorwaarden')}</h3>
        {failed ? (
          <div className="ck-terms-alert">
            {t('checkout:terms.loadFailed', 'The booking conditions could not be loaded. You cannot book without them.')}
            {' '}<button type="button" className="ck-terms-linkbtn ck-terms-link" onClick={onRetry}>{t('checkout:terms.retry', 'Try again')}</button>
          </div>
        ) : (
          <p className="ck-terms-muted">{t('checkout:terms.loading', 'Loading the conditions that apply to your booking…')}</p>
        )}
      </section>
    );
  }

  return (
    <section className="ck-terms" aria-labelledby="ck-terms-title">
      <h3 className="ck-terms-title hd" id="ck-terms-title">{terms.sectionTitle}</h3>

      {notice && <div className="ck-terms-notice" role="status">{notice}</div>}
      {terms.blocked && (
        <div className="ck-terms-alert" role="alert">
          {t('checkout:terms.blocked', 'Not every mandatory document for this booking is available yet, so it cannot be booked online right now. Please contact us.')}
        </div>
      )}

      <div className="ck-terms-block">
        <p className="ck-terms-info"><TermsText segments={terms.travelInfo?.segments} links={terms.links} onOpen={onOpen} /></p>
        {terms.travelDocuments?.length > 0 && (
          <ul className="ck-terms-docs">
            {terms.travelDocuments.map((d, i) => (
              <li key={`${d.documentType || d.group}-${d.documentId || i}`}>
                {d.group ? (
                  <>
                    <span>{d.label}: </span>
                    {d.documents.map((x, j) => (
                      <span key={x.versionId || j}>{j > 0 && ', '}<DocLink doc={x}>{x.name}</DocLink></span>
                    ))}
                  </>
                ) : <DocLink doc={d}>{d.label}</DocLink>}
              </li>
            ))}
          </ul>
        )}
        <AcceptRow name="travelAcceptance" checked={travelAccepted} onChange={onTravel} error={errors.travel}>
          <TermsText segments={terms.travelDeclaration?.segments} links={terms.links} onOpen={onOpen} />
        </AcceptRow>
      </div>

      {terms.insurance && (
        <div className="ck-terms-block ck-terms-ins">
          <h4 className="ck-terms-sub hd">{terms.insurance.title}</h4>
          {terms.insurance.products.map((p) => (
            <div className="ck-terms-insprod" key={p.product}>
              <b>{p.label}</b>
              <ul className="ck-terms-docs">
                {p.documents.length
                  ? p.documents.map((d) => <li key={d.versionId || d.documentId}><DocLink doc={d} /></li>)
                  : <li className="ck-terms-muted">{t('checkout:terms.insuranceDocsPending', 'The insurer documents will follow')}</li>}
              </ul>
            </div>
          ))}
          <AcceptRow name="insuranceAcceptance" checked={insuranceAccepted} onChange={onInsurance} error={errors.insurance}>
            <TermsText segments={terms.insurance.declaration?.segments} links={terms.links} onOpen={onOpen} />
          </AcceptRow>
        </div>
      )}

      <div className="ck-terms-legal">
        {(terms.info || []).map((d) => (
          <p key={d.code}><TermsText segments={d.segments} links={terms.links} onOpen={onOpen} /></p>
        ))}
      </div>
    </section>
  );
}

/** "Definitieve boeking", immediately above the payment button (§10.2). No checkbox. */
export function FinalDeclaration({ terms, onOpen }) {
  if (!terms) return null;
  return (
    <div className="ck-final" role="note">
      <div className="ck-final-title hd">{terms.finalTitle}</div>
      {(terms.finalDeclaration || []).map((d) => (
        <p key={d.code}><TermsText segments={d.segments} links={terms.links} onOpen={onOpen} /></p>
      ))}
    </div>
  );
}

/** The booking's own description or its important travel information, without leaving the page. */
export function TermsDialog({ open, title, onClose, children }) {
  const { t } = useTranslation(['common']);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="ck-modal-wrap" onClick={onClose}>
      <div className="ck-modal ck-terms-modal" role="dialog" aria-modal="true" aria-labelledby="ck-terms-dialog-title" onClick={(e) => e.stopPropagation()}>
        <div className="ck-modal-head">
          <h2 className="ck-modal-title hd" id="ck-terms-dialog-title">{title}</h2>
          <button type="button" className="ck-modal-x" onClick={onClose} aria-label={t('common:actions.close', 'Close')}>×</button>
        </div>
        <div className="ck-modal-body">{children}</div>
      </div>
    </div>
  );
}
