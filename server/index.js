/**
 * Production server for the built site.
 *
 * Two jobs:
 *   1. Serve `dist/` with SPA fallback — what the plain static server did before.
 *   2. Give /hotel/:code REAL Open Graph tags.
 *
 * Why (2) needs a server at all: this is a client-rendered Vite app, and the crawlers
 * behind WhatsApp / Facebook / iMessage / Slack previews do not run JavaScript. They
 * read the HTML as served, so every shared hotel link used to resolve to the generic
 * index.html — one identical "Sunsky — Where Will You Chase the Sun?" card for every
 * hotel in the catalogue. The hotel record is fetched here and stamped into the shell
 * before it goes out.
 *
 * Deliberately DEPENDENCY-FREE (node:http, not express): the deploy runs
 * `git pull && npm run build && pm2 restart 2` with no `npm install` step, so a server
 * that needs node_modules it doesn't already have would break the next deploy.
 *
 * Requires Node 18+ (global fetch). Env: PORT (8080), SITE_ORIGIN, VITE_CACHE_API_URL.
 *
 * Text responses (JS, CSS, HTML, JSON, SVG) are compressed — brotli when the browser takes it,
 * else gzip. The main bundle went out as 1.49 MB raw; brotli makes it ~0.3 MB. Assets are
 * content-hashed, so each is compressed once and kept in memory until its file changes.
 */
import http from 'node:http';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import { hotelImage } from '../src/utils/hotelImage.js';
import { localizedDescription } from '../src/utils/hotelContentLanguage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '..', 'dist');
const PORT = Number(process.env.PORT) || 8080;
const SITE_ORIGIN = (process.env.SITE_ORIGIN || 'https://holidaybooking.be').replace(/\/+$/, '');
const CACHE_API = (process.env.VITE_CACHE_API_URL || 'https://cache.holidaybooking.be').replace(/\/+$/, '');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.eot': 'application/vnd.ms-fontobject',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.pdf': 'application/pdf',
};

/* ── compression ── */
const brotli = promisify(zlib.brotliCompress);
const gzip = promisify(zlib.gzip);
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.map', '.svg', '.txt', '.xml', '.webmanifest']);
const MIN_COMPRESS_BYTES = 1024;   // below this, compression only adds bytes
// Brotli 9: ~4× smaller than raw for the bundle in ~170 ms, once per file (11 is 20× slower for 8%).
const BROTLI_OPTS = { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 } };

/** The encoding to answer with: brotli when accepted, else gzip, else none (`q=0` = refused). */
export function pickEncoding(acceptEncoding) {
  const accepted = new Set();
  for (const part of String(acceptEncoding || '').toLowerCase().split(',')) {
    const [name, ...params] = part.trim().split(';').map((x) => x.trim());
    const q = params.find((x) => x.startsWith('q='));
    if (name && !(q && Number(q.slice(2)) === 0)) accepted.add(name);
  }
  if (accepted.has('br')) return 'br';
  if (accepted.has('gzip')) return 'gzip';
  return null;
}

const compress = (body, enc) => (enc === 'br' ? brotli(body, BROTLI_OPTS) : gzip(body, { level: 9 }));

// file → { mtimeMs, br?: Promise<Buffer>, gzip?: Promise<Buffer> }. A failed compression is
// forgotten (the next request retries) and the file goes out uncompressed meanwhile.
const compressedFiles = new Map();
function compressedFile(file, mtimeMs, body, enc) {
  let entry = compressedFiles.get(file);
  if (!entry || entry.mtimeMs !== mtimeMs) { entry = { mtimeMs }; compressedFiles.set(file, entry); }
  if (!entry[enc]) entry[enc] = compress(body, enc).catch((err) => { delete entry[enc]; throw err; });
  return entry[enc];
}

/* Preview crawlers. They get to WAIT for the hotel record; a human never does. */
const CRAWLER_RE = /facebookexternalhit|facebookcatalog|whatsapp|twitterbot|telegrambot|linkedinbot|slackbot|slack-imgproxy|discordbot|pinterest|redditbot|skypeuripreview|applebot|googlebot|bingbot|yandex|duckduckbot|embedly|quora link preview|vkshare|w3c_validator|bitlybot|nuzzel|outbrain|flipboard|tumblr|iframely|google-inspectiontool|baiduspider/i;

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/* ── the built shell, re-read when a new build lands ── */
let shellCache = { mtime: 0, html: '' };
async function shell() {
  const file = path.join(DIST, 'index.html');
  const st = await fsp.stat(file);
  if (st.mtimeMs !== shellCache.mtime) {
    shellCache = { mtime: st.mtimeMs, html: await fsp.readFile(file, 'utf8') };
  }
  return shellCache.html;
}

/* ── hotel records: 6h TTL, bounded LRU-ish ── */
const TTL_MS = 6 * 60 * 60 * 1000;
const MAX_ENTRIES = 1000;
const records = new Map();   // code → { at, rec }
const inflight = new Map();  // code → Promise, so a burst on one hotel makes one call

async function hotelRecord(code, { wait }) {
  const hit = records.get(code);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.rec;

  let job = inflight.get(code);
  if (!job) {
    job = (async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2500);
      try {
        const r = await fetch(`${CACHE_API}/hotels/bulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hotelCodes: [String(code)] }),
          signal: ctrl.signal,
        });
        const rec = r.ok ? (await r.json())?.data?.[0] || null : null;
        if (records.size >= MAX_ENTRIES) records.delete(records.keys().next().value);
        records.set(code, { at: Date.now(), rec });
        return rec;
      } catch {
        return null;   // upstream down or slow — the page still renders, just without rich tags
      } finally {
        clearTimeout(timer);
        inflight.delete(code);
      }
    })();
    inflight.set(code, job);
  }
  // A human gets the shell immediately; the fetch keeps running and warms the cache for
  // the crawler that follows. Only crawlers pay the latency.
  return wait ? job : null;
}

/* ── copy ── */
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayMonth = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  return m ? `${Number(m[3])} ${MO[Number(m[2]) - 1]}` : '';
};

function hotelPreview(code, rec, qs) {
  const name = rec?.name?.trim() || qs.get('name')?.trim() || `Hotel ${code}`;
  const city = rec?.cityName || rec?.city || qs.get('loc') || '';
  const zone = rec?.zoneName && rec.zoneName.toLowerCase() !== String(city).toLowerCase() ? rec.zoneName : '';
  const place = [zone, city].filter(Boolean).join(', ');
  const stars = Number(rec?.stars) || Number(qs.get('stars')) || 0;

  // Master image first — the admin's visualOrder is what the gallery honours, so the
  // preview card shows the same photo the page leads with.
  const ordered = Array.isArray(rec?.images)
    ? [...rec.images].sort((a, b) => (a?.visualOrder ?? a?.order ?? 999) - (b?.visualOrder ?? b?.order ?? 999))
    : [];
  const rawImg = ordered.find((im) => im?.url)?.url || '';
  // `bigger` (800x533, ~73KB) is the largest RELIABLE variant — `xl` 403s for many hotels
  // and a broken og:image renders a blank card that the platform then caches.
  const image = rawImg ? hotelImage(rawImg, 'bigger') : '';
  const sized = !!image && image !== rawImg;

  const nights = Number(qs.get('nights')) || 0;
  const adults = Number(qs.get('adults')) || 0;
  const children = Number(qs.get('children')) || 0;
  const inD = dayMonth(qs.get('checkIn'));
  const outD = dayMonth(qs.get('checkOut'));

  // Dutch, because that is the site's own language and a crawler tells us nothing about the
  // reader's. Each noun carries its own plural; Dutch does not form them the way English does.
  const stay = [
    nights ? `${nights} ${nights === 1 ? 'nacht' : 'nachten'}` : '',
    adults ? `${adults} ${adults > 1 ? 'volwassenen' : 'volwassene'}${children ? `, ${children} ${children > 1 ? 'kinderen' : 'kind'}` : ''}` : '',
    inD && outD ? `${inD} – ${outD}` : '',
  ].filter(Boolean).join(' · ');

  // The Dutch description row when the backfill has one for this hotel, English otherwise.
  const blurb = localizedDescription(rec, 'nl').replace(/\s+/g, ' ').trim();
  const lead = [
    stars ? `${stars}-sterren` : '',
    place ? `in ${place}` : '',
  ].filter(Boolean).join(' ');

  let description = [lead ? `${lead[0].toUpperCase()}${lead.slice(1)}.` : '', stay ? `${stay}.` : '', blurb]
    .filter(Boolean).join(' ');
  if (description.length > 200) description = `${description.slice(0, 197).trimEnd()}…`;
  // No price in the card on purpose: a preview is cached by the platform for a long time
  // and the fare in the link is a search-time figure — a stale price on a permanent card
  // is a promise the booking flow can't keep.

  return {
    title: place ? `${name} — ${place} | Sunsky` : `${name} | Sunsky`,
    description: description || `Boek ${name} bij Sunsky. Veilig betalen, geen boekingskosten, directe bevestiging.`,
    image,
    imageSize: sized ? { w: 800, h: 533 } : null,
  };
}

function metaBlock({ title, description, image, imageSize, url, canonical }) {
  const out = [];
  const prop = (p, c) => { if (c) out.push(`    <meta property="${p}" content="${esc(c)}" />`); };
  const name = (n, c) => { if (c) out.push(`    <meta name="${n}" content="${esc(c)}" />`); };
  name('description', description);
  // canonical drops the query, og:url keeps it. Every share carries its own dates, and one
  // canonical per date permutation would split a hotel's ranking across thousands of URLs —
  // while the preview card still needs the dated link it was actually shared with.
  out.push(`    <link rel="canonical" href="${esc(canonical || url)}" />`);
  prop('og:type', 'website');
  prop('og:site_name', 'Sunsky');
  prop('og:locale', 'nl_BE');
  prop('og:title', title);
  prop('og:description', description);
  prop('og:url', url);
  prop('og:image', image);
  prop('og:image:alt', title);
  if (image && imageSize) {
    prop('og:image:width', String(imageSize.w));
    prop('og:image:height', String(imageSize.h));
  }
  name('twitter:card', image ? 'summary_large_image' : 'summary');
  name('twitter:title', title);
  name('twitter:description', description);
  name('twitter:image', image);
  return out.join('\n');
}

// The shell ships DEFAULT og:/twitter: tags for every other route. They must come out
// before the hotel's go in: a head holding two og:title values is ambiguous, and the
// crawlers that resolve it by "first one wins" would show the generic card on every hotel.
const DEFAULT_META_RE = /[ \t]*<meta\b[^>]*\b(?:property="og:[^"]*"|name="twitter:[^"]*"|name="description")[^>]*>\r?\n?/gi;
const CANONICAL_RE = /[ \t]*<link\b[^>]*\brel="canonical"[^>]*>\r?\n?/gi;

function stamp(html, preview, url, canonical) {
  return html
    .replace(DEFAULT_META_RE, '')
    .replace(CANONICAL_RE, '')
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(preview.title)}</title>`)
    .replace(/[ \t]*<\/head>/i, `${metaBlock({ ...preview, url, canonical })}\n  </head>`);
}

/* ── responses ── */
async function sendHtml(req, res, html, method) {
  let body = Buffer.from(html, 'utf8');
  const headers = {
    'Content-Type': 'text/html; charset=utf-8',
    // The shell names hashed asset files — never let a proxy pin an old one.
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    Vary: 'Accept-Encoding',
  };
  // The shell can differ per request (hotel preview tags), so it is compressed on the fly.
  const enc = method === 'GET' && body.length >= MIN_COMPRESS_BYTES ? pickEncoding(req.headers['accept-encoding']) : null;
  if (enc) {
    try { body = await compress(body, enc); headers['Content-Encoding'] = enc; } catch { /* send it raw */ }
  }
  headers['Content-Length'] = body.length;
  res.writeHead(200, headers);
  res.end(method === 'HEAD' ? undefined : body);
}

async function sendFile(req, res, file, method) {
  const ext = path.extname(file).toLowerCase();
  const st = await fsp.stat(file);
  let body = method === 'HEAD' ? null : await fsp.readFile(file);
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    // Vite content-hashes everything under /assets, so those are safe to pin forever.
    'Cache-Control': file.includes(`${path.sep}assets${path.sep}`)
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
  };
  if (COMPRESSIBLE.has(ext)) {
    headers.Vary = 'Accept-Encoding';
    const enc = body && body.length >= MIN_COMPRESS_BYTES ? pickEncoding(req.headers['accept-encoding']) : null;
    if (enc) {
      try { body = await compressedFile(file, st.mtimeMs, body, enc); headers['Content-Encoding'] = enc; } catch { /* send it raw */ }
    }
  }
  headers['Content-Length'] = body ? body.length : st.size;
  res.writeHead(200, headers);
  res.end(body ?? undefined);
}

async function staticFile(pathname) {
  if (pathname === '/' || pathname.endsWith('/')) return null;
  const abs = path.join(DIST, path.normalize(pathname).replace(/^[/\\]+/, ''));
  if (abs !== DIST && !abs.startsWith(DIST + path.sep)) return null;   // traversal guard
  try {
    const st = await fsp.stat(abs);
    return st.isFile() ? abs : null;
  } catch { return null; }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(url.pathname);

    const file = await staticFile(pathname);
    if (file) { await sendFile(req, res, file, req.method); return; }

    const html = await shell();
    const hotel = /^\/hotel\/([^/]+)\/?$/.exec(pathname);
    if (hotel) {
      const code = hotel[1];
      const isCrawler = CRAWLER_RE.test(req.headers['user-agent'] || '');
      const rec = await hotelRecord(code, { wait: isCrawler });
      const cached = records.get(code);
      // A human with nothing cached yet gets the plain shell instantly — the SPA fetches
      // the same record on mount anyway, so nothing is lost but the tab title.
      const usable = rec || (cached && Date.now() - cached.at < TTL_MS ? cached.rec : null);
      if (usable || isCrawler) {
        const shared = `${SITE_ORIGIN}${pathname}${url.search}`;
        const canonical = `${SITE_ORIGIN}${pathname}`;
        const preview = hotelPreview(code, usable, url.searchParams);
        await sendHtml(req, res, stamp(html, preview, shared, canonical), req.method);
        return;
      }
    }
    await sendHtml(req, res, html, req.method);   // SPA fallback: React owns the route
  } catch (err) {
    console.error('[server]', req.method, req.url, err);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
  }
});

server.listen(PORT, () => {
  console.log(`[server] sunsky-website on :${PORT} — dist=${DIST}, og=${SITE_ORIGIN}, cache=${CACHE_API}`);
});
