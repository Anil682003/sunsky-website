#!/usr/bin/env node
// Builds server/data/ip-country-be-nl.json: which IP addresses are Belgian or Dutch, for the
// "switch to sunsky.be / sunsky.nl?" prompt (Levent, 24 Nov 2026).
//
// Source: RIPE NCC's public delegation file (the official registry of European IP allocations,
// country per allocation). Only BE and NL are kept. No visitor data goes anywhere: the website
// server looks addresses up in this file locally.
//
//   node scripts/build-ip-country.mjs                 (downloads the latest file)
//   node scripts/build-ip-country.mjs path/to/delegated-ripencc-latest
//
// Refresh it every few months; allocations change slowly.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'server', 'data', 'ip-country-be-nl.json');
const SOURCE = 'https://ftp.ripe.net/pub/stats/ripencc/delegated-ripencc-latest';
const KEEP = new Set(['BE', 'NL']);

const text = process.argv[2]
  ? await fs.readFile(process.argv[2], 'utf8')
  : await (await fetch(SOURCE, { signal: AbortSignal.timeout(120_000) })).text();

const ipv4ToInt = (ip) => ip.split('.').reduce((n, o) => n * 256 + Number(o), 0);
const v4 = [];
const v6 = [];
for (const line of text.split('\n')) {
  const [registry, cc, type, start, value, , status] = line.split('|');
  if (registry !== 'ripencc' || !KEEP.has(cc) || !/^(allocated|assigned)$/.test(String(status).trim())) continue;
  if (type === 'ipv4') {
    const s = ipv4ToInt(start);
    v4.push([s, s + Number(value) - 1, cc]);
  } else if (type === 'ipv6') {
    v6.push([start, Number(value), cc]);
  }
}
// Sorted and merged (adjacent ranges of one country become one): a binary search per lookup.
v4.sort((a, b) => a[0] - b[0]);
const merged = [];
for (const r of v4) {
  const last = merged[merged.length - 1];
  if (last && last[2] === r[2] && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1]);
  else merged.push([...r]);
}
const header = text.split('\n', 1)[0].split('|');
const data = { source: SOURCE, serial: header[2] || null, built: new Date().toISOString().slice(0, 10), v4: merged, v6 };
await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, JSON.stringify(data));
console.log(`${OUT}: ${merged.length} IPv4 ranges (from ${v4.length}), ${v6.length} IPv6 prefixes`);
