import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Download, FileText } from 'lucide-react';
import { useBooking, useBookingDocuments, fetchBookingDocumentPdf } from '../../api';
import { useToast } from '../../context/ToastContext';
import i18n from '../../i18n';
import styles from './BookingDetail.module.css';

const fmt = (n) => `€${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
// Dates are read by the browser, so they need the reader's locale rather than a hard-coded en-GB.
const dateLocale = () => (i18n.language === 'nl' ? 'nl-BE' : 'en-GB');
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString(dateLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

const STATUS = {
  Confirmed: { bg: '#d1fae5', color: '#065f46' },
  Pending:   { bg: '#fef3c7', color: '#92400e' },
  Cancelled: { bg: '#fee2e2', color: '#991b1b' },
  Draft:     { bg: '#eef2f7', color: '#475569' },
};

const statusLabel = (status) => i18n.t(`account:status.${String(status || 'draft').toLowerCase()}`, status || 'Draft');

const productIcon = (t = '') => {
  const s = String(t).toLowerCase();
  if (s.includes('flight')) return '✈️';
  if (s.includes('hotel')) return '🏨';
  if (s.includes('insurance')) return '🛡️';
  return '🎫';
};

// dd/mm/yyyy, read from the YYYY-MM-DD text so no time zone can move the day.
const fmtDmy = (ymd) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};

// Hands the PDF to the browser as a file download.
const savePdf = (blob, filename) => {
  const file = blob instanceof Blob ? blob : new Blob([blob], { type: 'application/pdf' });
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Released a moment later: some browsers only start the download after click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

function BookingDocuments({ bookingRef }) {
  const { t } = useTranslation('account');
  const { showToast } = useToast();
  const { data: documents, loading, error } = useBookingDocuments(bookingRef);
  const [busy, setBusy] = useState({});
  const [failed, setFailed] = useState({});

  const download = async (doc) => {
    setBusy((s) => ({ ...s, [doc.id]: true }));
    setFailed((s) => ({ ...s, [doc.id]: null }));
    try {
      const blob = await fetchBookingDocumentPdf(bookingRef, doc.id);
      savePdf(blob, doc.filename || `${doc.number || `document-${doc.id}`}.pdf`);
      showToast(t('account:bookingDetail.documents.downloaded', 'Document downloaded'), 'success');
    } catch (err) {
      const message = err?.response?.status === 403
        ? t('account:bookingDetail.documents.notAvailable', 'This document is not available yet.')
        : t('account:bookingDetail.documents.downloadFailed', 'The download failed. Please try again.');
      setFailed((s) => ({ ...s, [doc.id]: message }));
      showToast(message, 'error');
    } finally {
      setBusy((s) => ({ ...s, [doc.id]: false }));
    }
  };

  const list = documents || [];

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>{t('account:bookingDetail.documents.title', 'Documents')}</h2>
      {loading ? (
        <p className={styles.docNote}>{t('account:bookingDetail.documents.loading', 'Loading documents…')}</p>
      ) : error ? (
        <p className={`${styles.docNote} ${styles.docError}`}>{t('account:bookingDetail.documents.loadFailed', 'Your documents could not be loaded. Please try again later.')}</p>
      ) : list.length === 0 ? (
        <p className={styles.docNote}>{t('account:bookingDetail.documents.empty', 'Your documents will appear here once they are issued.')}</p>
      ) : (
        <ul className={styles.docs}>
          {list.map((doc) => {
            const title = t(`account:bookingDetail.documents.types.${doc.type}`, doc.title || t('account:bookingDetail.documents.fallbackTitle', 'Document'));
            const meta = [doc.number, doc.issueDate && t('account:bookingDetail.documents.issued', { date: fmtDmy(doc.issueDate), defaultValue: 'Issued {{date}}' })].filter(Boolean).join(' · ');
            const isBusy = !!busy[doc.id];
            return (
              <li key={doc.id} className={styles.doc}>
                <div className={styles.docIcon} aria-hidden="true"><FileText size={20} /></div>
                <div className={styles.docBody}>
                  <div className={styles.docTitle}>{title}</div>
                  {doc.detail && <div className={styles.docDetail}>{doc.detail}</div>}
                  {meta && <div className={styles.docMeta}>{meta}</div>}
                  {failed[doc.id] && <div className={styles.docError} role="alert">{failed[doc.id]}</div>}
                </div>
                <button
                  type="button"
                  className={styles.docBtn}
                  onClick={() => download(doc)}
                  disabled={isBusy}
                  aria-busy={isBusy}
                  aria-label={t('account:bookingDetail.documents.downloadAria', { title, number: doc.number || '', defaultValue: 'Download {{title}} {{number}}' }).trim()}
                >
                  <Download size={15} aria-hidden="true" />
                  {isBusy ? t('account:bookingDetail.documents.downloading', 'Downloading…') : t('account:bookingDetail.documents.download', 'Download')}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default function BookingDetail() {
  const { t } = useTranslation('account');
  const { ref } = useParams();
  const { data: b, loading, error } = useBooking(ref);

  if (loading) return <div className={styles.page}><div className={styles.center}>{t('account:bookingDetail.loading', 'Loading booking…')}</div></div>;
  if (error)   return <div className={styles.page}><div className={styles.center} style={{ color: '#dc2626' }}>{error}</div></div>;
  if (!b)      return <div className={styles.page}><div className={styles.center}>{t('account:bookingDetail.notFound', 'Booking not found.')}</div></div>;

  const st = STATUS[b.status] || STATUS.Draft;
  const total = parseFloat(b.grandTotal || 0);
  const paid = parseFloat(b.paidAmount || 0);
  const balance = parseFloat(b.balanceAmount != null ? b.balanceAmount : total - paid);
  const products = b.products || [];
  const travelers = b.travelers || [];

  return (
    <div className={styles.page}>
      <Link to="/account/bookings" className={styles.back}>← {t('account:bookingDetail.backToBookings', 'Back to my bookings')}</Link>

      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{b.bookingReference}</h1>
          <p className={styles.subtitle}>{t('account:myBookings.booked', { date: fmtDate(b.createdAt), defaultValue: 'Booked {{date}}' })}</p>
        </div>
        <span className={styles.badge} style={{ background: st.bg, color: st.color }}>{statusLabel(b.status)}</span>
      </header>

      {/* Payment summary */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>{t('account:bookingDetail.payment', 'Payment')}</h2>
        <div className={styles.priceStrip}>
          <div className={styles.priceCell}><span className={styles.priceLabel}>{t('account:price.total', 'Total')}</span><span className={styles.priceValue}>{fmt(total)}</span></div>
          <div className={styles.priceCell}><span className={styles.priceLabel}>{t('account:price.paid', 'Paid')}</span><span className={`${styles.priceValue} ${styles.paid}`}>{fmt(paid)}</span></div>
          <div className={styles.priceCell}><span className={styles.priceLabel}>{t('account:price.balanceDue', 'Balance due')}</span><span className={`${styles.priceValue} ${balance > 0 ? styles.owed : styles.paid}`}>{fmt(balance)}</span></div>
        </div>
        <div className={styles.metaRow}>
          <span>{t('account:bookingDetail.paymentStatus', 'Payment status:')} <b>{b.paymentStatus || '—'}</b></span>
          {b.bookingType && <span>{t('account:bookingDetail.source', 'Source:')} <b>{b.bookingType}</b></span>}
        </div>
      </section>

      {/* Documents */}
      <BookingDocuments bookingRef={b.bookingReference || ref} />

      {/* Products */}
      {products.length > 0 && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>{t('account:bookingDetail.whatsIncluded', 'What’s included')}</h2>
          <div className={styles.products}>
            {products.map((p) => {
              const d = p.productDetails || {};
              const legs = d.legs || [];
              return (
                <div key={p.id} className={styles.product}>
                  <div className={styles.prodIcon}>{productIcon(p.productType)}</div>
                  <div className={styles.prodBody}>
                    <div className={styles.prodTop}>
                      <span className={styles.prodType}>{p.productType}</span>
                      <span className={styles.prodStatus}>{p.productStatus}</span>
                    </div>
                    {p.productType === 'Flight' && legs.length > 0 ? (
                      <div className={styles.legs}>
                        {legs.map((l, i) => (
                          <div key={i} className={styles.leg}>
                            <b>{l.from} → {l.to}</b>
                            <span>{l.airline} {l.flightNumber}</span>
                            <span>{fmtDateTime(l.departure)}</span>
                          </div>
                        ))}
                      </div>
                    ) : p.productType === 'Hotel' ? (
                      <div className={styles.prodMeta}>
                        {d.hotelName && <span>{d.hotelName}</span>}
                        {(d.checkin || d.checkout) && (
                          <span>
                            {fmtDate(d.checkin)} → {fmtDate(d.checkout)}
                            {d.nights ? ` · ${t('account:bookingDetail.nights', { count: d.nights, defaultValue_one: '{{count}} night', defaultValue_other: '{{count}} nights' })}` : ''}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className={styles.prodMeta}>{d.label || p.supplierName}</div>
                    )}
                    <div className={styles.prodFoot}>
                      {p.supplierName && <span>{p.supplierName}</span>}
                      {p.supplierReference && <span>{t('account:bookingDetail.ref', { ref: p.supplierReference, defaultValue: 'Ref: {{ref}}' })}</span>}
                      <span className={styles.prodPrice}>{fmt(p.sellingPrice)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Travellers */}
      {travelers.length > 0 && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>{t('account:bookingDetail.travellers', { count: travelers.length, defaultValue: 'Travellers ({{count}})' })}</h2>
          <div className={styles.travelers}>
            {travelers.map((tr) => (
              <div key={tr.id} className={styles.traveler}>
                <div className={styles.tAvatar}>{(tr.firstName || '?')[0]}{(tr.lastName || '')[0]}</div>
                <div>
                  <div className={styles.tName}>{tr.title ? `${tr.title} ` : ''}{tr.firstName} {tr.lastName}{tr.isLeadTraveler ? ` · ${t('account:bookingDetail.lead', 'Lead')}` : ''}</div>
                  <div className={styles.tMeta}>{tr.type || 'ADT'}{tr.dateOfBirth ? ` · ${fmtDate(tr.dateOfBirth)}` : ''}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
