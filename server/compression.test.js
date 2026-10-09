// The production server compresses text responses: brotli when accepted, else gzip, else raw.
// The decoded bytes must be exactly the file on disk. Runs the real server against dist/.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const hasBuild = fs.existsSync(path.join(DIST, 'index.html'));
const PORT = 18000 + (process.pid % 1000);

let proc;
beforeAll(async () => {
  if (!hasBuild) return;
  proc = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start')), 8000);
    proc.stdout.on('data', (d) => { if (String(d).includes('sunsky-website on')) { clearTimeout(t); resolve(); } });
  });
});
afterAll(() => { proc?.kill(); });

const get = (urlPath, headers = {}, method = 'GET') => new Promise((resolve, reject) => {
  http.request({ port: PORT, path: urlPath, method, headers }, (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
  }).on('error', reject).end();
});
const biggestJs = () => fs.readdirSync(path.join(DIST, 'assets')).filter((f) => f.endsWith('.js'))
  .sort((a, b) => fs.statSync(path.join(DIST, 'assets', b)).size - fs.statSync(path.join(DIST, 'assets', a)).size)[0];

describe.skipIf(!hasBuild)('website server compression', () => {
  it('brotli for a browser that takes it; decodes to the exact file', async () => {
    const f = biggestJs();
    const raw = fs.readFileSync(path.join(DIST, 'assets', f));
    const r = await get(`/assets/${f}`, { 'Accept-Encoding': 'gzip, deflate, br, zstd' });
    expect(r.headers['content-encoding']).toBe('br');
    expect(r.headers.vary).toBe('Accept-Encoding');
    expect(r.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(Number(r.headers['content-length'])).toBe(r.body.length);
    expect(r.body.length).toBeLessThan(raw.length / 3);
    expect(zlib.brotliDecompressSync(r.body).equals(raw)).toBe(true);
  });

  it('gzip when brotli is not accepted (or refused with q=0)', async () => {
    const f = biggestJs();
    const raw = fs.readFileSync(path.join(DIST, 'assets', f));
    for (const ae of ['gzip, deflate', 'br;q=0, gzip']) {
      const r = await get(`/assets/${f}`, { 'Accept-Encoding': ae });
      expect(r.headers['content-encoding']).toBe('gzip');
      expect(zlib.gunzipSync(r.body).equals(raw)).toBe(true);
    }
  });

  it('raw for a client that asks for nothing', async () => {
    const f = biggestJs();
    const r = await get(`/assets/${f}`);
    expect(r.headers['content-encoding']).toBeUndefined();
    expect(r.body.equals(fs.readFileSync(path.join(DIST, 'assets', f)))).toBe(true);
  });

  it('the SPA shell is compressed too, and stays no-cache', async () => {
    const r = await get('/results?countries=TR', { 'Accept-Encoding': 'br' });
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('no-cache');
    const html = r.headers['content-encoding'] === 'br' ? zlib.brotliDecompressSync(r.body).toString() : r.body.toString();
    expect(html).toContain('<div id="root"');
  });

  it('images are never re-compressed', async () => {
    const r = await get('/sunsky-icon.png', { 'Accept-Encoding': 'br, gzip' });
    expect(r.headers['content-encoding']).toBeUndefined();
    expect(r.body.equals(fs.readFileSync(path.join(DIST, 'sunsky-icon.png')))).toBe(true);
  });

  it('HEAD answers headers only', async () => {
    const r = await get(`/assets/${biggestJs()}`, { 'Accept-Encoding': 'br' }, 'HEAD');
    expect(r.status).toBe(200);
    expect(r.body.length).toBe(0);
  });
});
