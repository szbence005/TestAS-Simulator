// Statischer Server + Better-Auth-Endpunkte + Verlaufs-API.   npm install && npm start
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

let mods;
try {
  mods = {
    ...(await import('./auth.js')),
    ...(await import('./groups.js')),
    ...(await import('better-auth/node')),
  };
} catch (err) {
  console.error('Better Auth konnte nicht geladen werden. Bitte zuerst "npm install" ausführen.\n', err.message);
  process.exit(1);
}
const { auth, history, githubEnabled, toNodeHandler, fromNodeHeaders, groupsApi, ensureGroupTables } = mods;

// Datenbanktabellen von Better Auth anlegen (user, session, account, verification).
// Je nach Version liegt getMigrations an einem anderen Ort – wir probieren die bekannten Pfade.
async function migrate() {
  for (const path of ['better-auth/db/migration', 'better-auth/db']) {
    try {
      const mod = await import(path);
      if (typeof mod.getMigrations !== 'function') continue;
      const { runMigrations } = await mod.getMigrations(auth.options);
      await runMigrations();
      return;
    } catch { /* nächsten Pfad probieren */ }
  }
  console.warn('Automatische Migration nicht möglich – bitte einmal "npm run auth:migrate" ausführen und den Server neu starten.');
}
await migrate();
await ensureGroupTables();

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
// Nur diese Dateien werden ausgeliefert – nicht server/, data/ oder .git
const isPublic = (p) => ['/index.html', '/app.js', '/style.css'].includes(p) || /^\/src\/[\w-]+\.js$/.test(p);

const authHandler = toNodeHandler(auth);
const MODES = new Set(['exam', 'practice']);
const TYPES = new Set(['figural', 'gleichungen', 'quadrate']);
const int = (v) => Number.isSafeInteger(v);

function readJson(req, limit = 100_000) {
  return new Promise((ok, fail) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { fail(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { ok(JSON.parse(Buffer.concat(chunks).toString() || '{}')); } catch (e) { fail(e); } });
    req.on('error', fail);
  });
}
const send = (res, status, body) => res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(JSON.stringify(body));

// CSRF-Schutz: Anfragen mit fremdem Origin ablehnen (Cookies sind zusätzlich SameSite=Lax)
const sameOrigin = (req) => !req.headers.origin || new URL(req.headers.origin).host === req.headers.host;
const sendCsv = (res, filename, text) => res.writeHead(200, {
  'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store',
}).end(text);

async function groupsRoute(req, res, pathname) {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  return groupsApi(req, res, pathname, { user: session?.user ?? null, send, sendCsv, readJson, sameOrigin });
}

async function historyApi(req, res) {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session) return send(res, 401, { error: 'unauthorized' });
  const uid = session.user.id;
  if (req.method === 'GET') return send(res, 200, { entries: await history.list(uid) });
  if (req.method === 'POST') {
    if (!sameOrigin(req)) return send(res, 403, { error: 'forbidden' });
    const { entries } = await readJson(req);
    if (!Array.isArray(entries) || entries.length > 100) return send(res, 400, { error: 'invalid' });
    const rows = entries.filter((e) => e && int(e.ts) && MODES.has(e.mode) && TYPES.has(e.type)
      && int(e.correct) && int(e.total) && e.correct >= 0 && e.correct <= e.total && e.total <= 100
      && (e.seconds == null || int(e.seconds)) && (e.seed == null || int(e.seed)));
    await history.add(uid, rows);
    return send(res, 200, { saved: rows.length });
  }
  return send(res, 405, { error: 'method' });
}

const server = http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname.startsWith('/api/auth/')) return await authHandler(req, res);
    if (pathname === '/api/config') return send(res, 200, { github: githubEnabled });
    if (pathname === '/api/history') return await historyApi(req, res);
    if (pathname === '/api/account' || pathname.startsWith('/api/groups/') || pathname.startsWith('/api/admin/')) return await groupsRoute(req, res, pathname);
    const p = pathname === '/' ? '/index.html' : pathname;
    if (!isPublic(p)) return res.writeHead(404).end('Not found');
    const data = await readFile(resolve(root, '.' + p));
    res.writeHead(200, { 'Content-Type': types[extname(p)], 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' }).end(data);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) send(res, 500, { error: 'server' });
  }
});

const port = Number(process.env.PORT) || 8080;
server.listen(port, () => console.log(`http://localhost:${port}`));
