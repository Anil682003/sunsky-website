import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './ShareSheet.module.css';

/**
 * Share control: a trigger button + the sheet it opens.
 *
 * Desktop → a popover anchored under the trigger. Mobile → a bottom sheet.
 * Both are PORTALLED to <body>: the hero that hosts the trigger sits in its own
 * stacking context (`.sd-hero-inner{z-index:2}`), so an in-place popover would be
 * painted under the sticky tab bar and the mobile booking bar.
 *
 * The caller owns the link. It should be the CANONICAL one (dates + travellers in
 * the query string) so the recipient opens the exact stay the sharer was looking at.
 *
 *   url    the link to share
 *   title  headline for the OS/native share card
 *   text   the message body used for the social/mail channels
 *   image  small preview thumbnail (optional)
 *   meta   one-line stay summary shown under the title ("19–26 Mar · 2 adults")
 */

/* ── glyphs ── */
const Brand = ({ d, size = 19 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={d} /></svg>
);
const Stroke = ({ children, size = 19, sw = 1.9 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

const WA_PATH = 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z';
const FB_PATH = 'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z';
const X_PATH  = 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z';
const TG_PATH = 'M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z';

const enc = encodeURIComponent;

/* Link channels. `href` gets the built message so each one composes it the way that
   platform expects (WhatsApp/Telegram want the URL inside the text, FB only takes it). */
const CHANNELS = [
  {
    id: 'whatsapp', label: 'WhatsApp', tint: '#25d366', icon: <Brand d={WA_PATH} />,
    href: ({ url, text }) => `https://wa.me/?text=${enc(`${text}\n${url}`)}`,
  },
  {
    id: 'facebook', label: 'Facebook', tint: '#1877f2', icon: <Brand d={FB_PATH} />,
    href: ({ url }) => `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`,
  },
  {
    id: 'x', label: 'X', tint: '#0f172a', icon: <Brand d={X_PATH} size={17} />,
    href: ({ url, text }) => `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}`,
  },
  {
    id: 'telegram', label: 'Telegram', tint: '#229ed9', icon: <Brand d={TG_PATH} />,
    href: ({ url, text }) => `https://t.me/share/url?url=${enc(url)}&text=${enc(text)}`,
  },
  {
    id: 'email', label: 'Email', tint: '#1f4fd8',
    icon: <Stroke><rect x="2" y="4.5" width="20" height="15" rx="2.5" /><path d="M2.6 6.2l8.3 6a2 2 0 002.2 0l8.3-6" /></Stroke>,
    href: ({ url, text, subject }) => `mailto:?subject=${enc(subject)}&body=${enc(`${text}\n\n${url}`)}`,
    sameTab: true,   // a mailto: in a new tab leaves an orphan blank tab behind
  },
];

/* Copy that also works on http:// staging, where navigator.clipboard is undefined. */
async function copyText(value) {
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch { /* blocked or unavailable — fall through to the legacy path */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);   // iOS needs the explicit range
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

function useIsMobile(query = '(max-width: 640px)') {
  const [is, setIs] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setIs(mq.matches);
    on();
    mq.addEventListener('change', on);
    window.addEventListener('resize', on);   // belt and braces: the sheet's whole shape hangs on this
    return () => { mq.removeEventListener('change', on); window.removeEventListener('resize', on); };
  }, [query]);
  return is;
}

const SHEET_W = 348;   // popover width; keep in sync with .pop in the stylesheet
const EST_H = 300;     // first-paint height guess, refined from the real box on mount

export default function ShareSheet({
  url,
  title = '',
  text = '',
  image = '',
  meta = '',
  subject = '',
  buttonClassName = '',
  buttonLabel = 'Share',
  buttonIcon = null,
  onCopy,
  onError,
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pos, setPos] = useState(null);
  const isMobile = useIsMobile();

  // The OS share sheet — Android/iOS, and Windows/macOS Chrome + Safari. Never changes
  // at runtime, so it's read during render (this app never server-renders).
  const canNative = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const btnRef = useRef(null);
  const popRef = useRef(null);
  const copyTimer = useRef(null);

  useEffect(() => () => clearTimeout(copyTimer.current), []);

  const msg = { url, text: text || title, subject: subject || title || 'A stay worth a look' };

  const close = useCallback(({ refocus = true } = {}) => {
    setOpen(false);
    if (refocus) btnRef.current?.focus();
  }, []);

  /* ── anchor the popover to the trigger (desktop only) ──
     Right-aligned to the trigger, kept inside the viewport, flipped above it when
     there's no room below. The coordinates are resolved BEFORE the popover mounts
     (using the estimated height) rather than in a hidden first frame: a hidden
     frame can't take focus, and an unplaced one flashes at the top-left corner. */
  const compute = useCallback((h) => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return null;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.min(Math.max(12, r.right - SHEET_W), Math.max(12, vw - SHEET_W - 12));
    const below = r.bottom + 12;
    const flip = below + h > vh - 12 && r.top - h - 12 > 12;
    return { left, top: flip ? r.top - h - 12 : below, flip };
  }, []);

  const place = useCallback(() => {
    const next = compute(popRef.current?.offsetHeight || EST_H);
    if (next) setPos(next);
  }, [compute]);

  // re-place once the real height is known — still before paint, so no visible jump
  useLayoutEffect(() => {
    if (!open || isMobile) return;
    place();
  }, [open, isMobile, place]);

  useEffect(() => {
    if (!open || isMobile) return;
    const onMove = () => place();
    window.addEventListener('scroll', onMove, { passive: true, capture: true });
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, { capture: true });
      window.removeEventListener('resize', onMove);
    };
  }, [open, isMobile, place]);

  /* ── outside click, Escape, Tab containment ── */
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (popRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return;
      close({ refocus: false });
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
      if (e.key !== 'Tab' || !popRef.current) return;
      const f = popRef.current.querySelectorAll('a[href], button:not([disabled])');
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown, { passive: true });
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, close]);

  // the bottom sheet covers the viewport bottom — freeze the page behind it
  useEffect(() => {
    if (!open || !isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open, isMobile]);

  // Focus lands on Copy — the action nine out of ten people came for, and the anchor the
  // Tab loop starts from. A callback ref, so it happens the moment the node attaches:
  // an effect (let alone a rAF) can lose the race with whatever focused the trigger.
  const copyRef = useCallback((node) => { if (node) node.focus(); }, []);

  const handleCopy = async () => {
    const ok = await copyText(url);
    if (!ok) { onError?.(); return; }
    setCopied(true);
    onCopy?.();
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 2200);
  };

  const handleNative = async () => {
    try {
      await navigator.share({ title, text: msg.text, url });
      close({ refocus: false });
    } catch { /* cancelled — leave the sheet open so another channel is one tap away */ }
  };

  // host/path reads as the link; the query is summarised instead of dumped
  const [linkHost, linkQuery] = (() => {
    try {
      const u = new URL(url);
      return [`${u.host}${u.pathname}`, u.search];
    } catch { return [url, '']; }
  })();

  const sheet = (
    <>
      {isMobile && <div className={styles.scrim} onClick={() => close({ refocus: false })} />}
      <div
        ref={popRef}
        role="dialog"
        aria-modal={isMobile ? 'true' : undefined}
        aria-label={`Share ${title}`.trim()}
        className={`${isMobile ? styles.sheet : styles.pop} ${pos?.flip ? styles.flip : ''}`}
        style={isMobile ? undefined : { top: pos?.top ?? 0, left: pos?.left ?? 0 }}
      >
        {isMobile && <span className={styles.grab} />}

        <div className={styles.head}>
          <span className={styles.headTitle}>Share this stay</span>
          <button type="button" className={styles.close} onClick={() => close()} aria-label="Close share">
            <Stroke size={15} sw={2.2}><path d="M18 6L6 18" /><path d="M6 6l12 12" /></Stroke>
          </button>
        </div>

        {(image || title) && (
          <div className={styles.preview}>
            {image
              ? <img className={styles.thumb} src={image} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              : null}
            <span className={styles.pvText}>
              <span className={styles.pvName}>{title}</span>
              {meta && <span className={styles.pvMeta}>{meta}</span>}
            </span>
          </div>
        )}

        <span className={styles.tear} aria-hidden="true" />

        <div className={styles.linkRow}>
          <span className={styles.link} title={url}>
            <span className={styles.linkHost}>{linkHost}</span>
            {linkQuery && <span className={styles.linkTail}>your dates &amp; travellers included</span>}
          </span>
          <button
            ref={copyRef}
            type="button"
            className={`${styles.copy} ${copied ? styles.copied : ''}`}
            onClick={handleCopy}
            aria-live="polite"
          >
            {copied
              ? <><Stroke size={14} sw={3}><path d="M20 6L9 17l-5-5" /></Stroke>Copied</>
              : <><Stroke size={14}><rect x="9" y="9" width="12" height="12" rx="2.4" /><path d="M5.5 15H4.6A1.6 1.6 0 013 13.4V4.6A1.6 1.6 0 014.6 3h8.8A1.6 1.6 0 0115 4.6v.9" /></Stroke>Copy</>}
          </button>
        </div>

        <div className={styles.grid}>
          {CHANNELS.map((c, i) => (
            <a
              key={c.id}
              className={styles.tile}
              style={{ '--tint': c.tint, '--d': `${0.04 * i + 0.05}s` }}
              href={c.href(msg)}
              target={c.sameTab ? undefined : '_blank'}
              rel={c.sameTab ? undefined : 'noopener noreferrer'}
              onClick={() => close({ refocus: false })}
            >
              <span className={styles.tileIcon}>{c.icon}</span>
              <span className={styles.tileLabel}>{c.label}</span>
            </a>
          ))}
          {canNative && (
            <button
              type="button"
              className={styles.tile}
              style={{ '--tint': '#5e7291', '--d': `${0.04 * CHANNELS.length + 0.05}s` }}
              onClick={handleNative}
            >
              <span className={styles.tileIcon}>
                <Stroke><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></Stroke>
              </span>
              <span className={styles.tileLabel}>More</span>
            </button>
          )}
        </div>
      </div>
    </>
  );

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`${buttonClassName} ${open ? styles.triggerOpen : ''}`.trim()}
        onClick={() => {
          if (open) { close(); return; }
          if (!isMobile) setPos(compute(EST_H));
          setOpen(true);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {buttonIcon}{buttonLabel}
      </button>
      {open && createPortal(sheet, document.body)}
    </>
  );
}
