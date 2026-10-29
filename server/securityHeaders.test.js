// Every response carries the security headers (security review, 29 Oct 2026): the HTML shell, a
// hashed asset, robots.txt, and the error answers. Runs the real server, like badRequest.test.js.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const hasBuild = fs.existsSync(path.join(DIST, 'index.html'));
const PORT = 20000 + (process.pid % 1000);

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

const head = (urlPath, method = 'GET') => new Promise((resolve, reject) => {
  http.request({ port: PORT, path: urlPath, method }, (res) => { res.resume(); res.on('end', () => resolve(res)); })
    .on('error', reject).end();
});

const asset = () => {
  const dir = path.join(DIST, 'assets');
  const f = fs.existsSync(dir) ? fs.readdirSync(dir).find((n) => n.endsWith('.css') || n.endsWith('.js')) : null;
  return f ? `/assets/${f}` : null;
};

describe.skipIf(!hasBuild)('security headers', () => {
  it('on the HTML shell, an asset, robots.txt, a 400, a 405 and a 404', async () => {
    const paths = [['/'], ['/robots.txt'], ['/%zz'], ['/', 'POST'], ['/hotel'], ...(asset() ? [[asset()]] : [])];
    for (const [p, m] of paths) {
      const r = await head(p, m);
      const where = `${m || 'GET'} ${p} (${r.statusCode})`;
      expect(r.headers['strict-transport-security'], where).toBe('max-age=31536000');
      expect(r.headers['x-frame-options'], where).toBe('DENY');
      expect(r.headers['x-content-type-options'], where).toBe('nosniff');
      expect(r.headers['referrer-policy'], where).toBe('strict-origin-when-cross-origin');
      expect(r.headers['permissions-policy'], where).toMatch(/camera=\(\)/);
    }
  });

  it('leaves payment allowed (Stripe wallets) and sends no CSP yet', async () => {
    const r = await head('/');
    expect(r.headers['permissions-policy']).not.toMatch(/payment/);
    expect(r.headers['content-security-policy']).toBeUndefined();
  });
});
