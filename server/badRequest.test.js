// A malformed URL is the client's mistake, not ours.
//
// `decodeURIComponent('/%')` throws URIError, and that used to fall through to the request
// handler's catch, which answers 500 and logs a stack trace. Scanners probe paths like these
// constantly, so production was reporting itself broken several times a minute and burying real
// errors in the same log. Runs the real server, like the compression test does.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const hasBuild = fs.existsSync(path.join(DIST, 'index.html'));
const PORT = 19000 + (process.pid % 1000);

let proc;
let stderr = '';
beforeAll(async () => {
  if (!hasBuild) return;
  proc = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' });
  proc.stderr.on('data', (d) => { stderr += String(d); });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start')), 8000);
    proc.stdout.on('data', (d) => { if (String(d).includes('sunsky-website on')) { clearTimeout(t); resolve(); } });
  });
});
afterAll(() => { proc?.kill(); });

// `path` is sent raw, so the malformed escape survives to the server rather than being
// normalised by a URL parser on the way out.
const get = (urlPath) => new Promise((resolve, reject) => {
  http.request({ port: PORT, path: urlPath, method: 'GET' }, (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
  }).on('error', reject).end();
});

describe.skipIf(!hasBuild)('malformed request paths', () => {
  it('answers 400, not 500, for a path that is not valid percent-encoding', async () => {
    for (const bad of ['/%', '/%zz', '/%e0%a4%a', '/assets/%ff', '/hotel/%']) {
      const r = await get(bad);
      expect(r.status, `${bad} should be a client error`).toBe(400);
      expect(r.body).toBe('Bad Request');
    }
  });

  it('does not log the probe as a server error', async () => {
    stderr = '';
    await get('/%zz');
    await new Promise((r) => { setTimeout(r, 120); });
    expect(stderr).not.toMatch(/URI malformed/i);
    expect(stderr).not.toMatch(/\[server\]/);
  });

  it('still serves a normal path, and still decodes a legitimate escape', async () => {
    // The guard must not swallow real requests: %20 is a space and has to keep working.
    const ok = await get('/');
    expect(ok.status).toBe(200);

    // A percent-escape that DECODES cleanly must be judged on the path it decodes to, not
    // refused for containing a %. Which status that path then earns is the router's business:
    // an unknown route is a 404 here and on production, a known one is a 200. The only answer
    // this guard must never give is 400, so that is what is asserted — pinning an exact status
    // would tie this test to the route table and fail the next time one is added.
    const escaped = await get('/some%20page');
    expect(escaped.status).not.toBe(400);
  });
});
