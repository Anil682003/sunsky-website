/**
 * Belgian or Dutch? From the visitor's IP address, looked up locally in RIPE's allocation list
 * (server/data/ip-country-be-nl.json, built by scripts/build-ip-country.mjs). For the prompt that
 * offers a Belgian visitor on sunsky.nl the Belgian site and vice versa (Levent, 24 Nov 2026).
 * Nothing leaves the server and nothing is stored: the answer is BE, NL or null (any other
 * country, or not known).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

let table = null;
function load() {
  if (table) return table;
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(HERE, 'data', 'ip-country-be-nl.json'), 'utf8'));
    table = {
      v4: raw.v4 || [],
      v6: (raw.v6 || []).map(([prefix, len, cc]) => ({ net: v6ToBigInt(prefix), len: Number(len), cc })).filter((x) => x.net != null),
    };
  } catch {
    table = { v4: [], v6: [] };   // no list: nobody is prompted, nothing breaks
  }
  return table;
}

const v4ToInt = (ip) => {
  const p = ip.split('.');
  if (p.length !== 4 || p.some((o) => !/^\d{1,3}$/.test(o) || Number(o) > 255)) return null;
  return p.reduce((n, o) => n * 256 + Number(o), 0);
};

function v6ToBigInt(ip) {
  let s = String(ip).toLowerCase().split('%')[0];
  if (!/^[0-9a-f:.]+$/.test(s) || !s.includes(':')) return null;
  // An embedded IPv4 tail (::ffff:1.2.3.4) becomes two hextets.
  const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (tail) {
    const n = v4ToInt(tail[1]);
    if (n == null) return null;
    s = s.slice(0, -tail[1].length) + `${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const [head, rest] = s.split('::');
  if (s.split('::').length > 2) return null;
  const h = head ? head.split(':') : [];
  const r = rest != null ? (rest ? rest.split(':') : []) : [];
  const fill = rest != null ? 8 - h.length - r.length : 0;
  const groups = [...h, ...Array(Math.max(0, fill)).fill('0'), ...r];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.reduce((n, g) => (n << 16n) + BigInt(parseInt(g, 16)), 0n);
}

/** PURE (given the table). 'BE' | 'NL' | null for an IPv4 or IPv6 address. */
export function countryOfIp(ip, t = load()) {
  const raw = String(ip || '').trim();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(raw);
  const v4 = v4ToInt(mapped ? mapped[1] : raw);
  if (v4 != null) {
    let lo = 0;
    let hi = t.v4.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const [s, e, cc] = t.v4[mid];
      if (v4 < s) hi = mid - 1;
      else if (v4 > e) lo = mid + 1;
      else return cc;
    }
    return null;
  }
  const n = v6ToBigInt(raw);
  if (n == null) return null;
  for (const { net, len, cc } of t.v6) {
    const shift = BigInt(128 - len);
    if ((n >> shift) === (net >> shift)) return cc;
  }
  return null;
}

/**
 * The visitor's address. Caddy (the only proxy, on this host) sets X-Forwarded-For to the
 * address it received the connection from; the LAST entry is that one, so a client cannot
 * choose its own country by sending the header itself.
 */
export function clientIp(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
  return xff.length ? xff[xff.length - 1] : (req.socket?.remoteAddress || '');
}
