// Lerngruppen: Teilnehmer treten mit einem Code bei, der Admin (ADMIN_EMAILS) sieht die Ergebnisse der Mitglieder.
import { randomUUID } from 'node:crypto';
import { sql } from './auth.js';
import { TYPE_KEYS, generateCode, normalizeCode, formatCode, parseAdminEmails, summarize, percent, toCsv, utc } from './stats.js';

const adminEmails = parseAdminEmails(process.env.ADMIN_EMAILS);
export const isAdmin = (user) => Boolean(user?.email) && adminEmails.has(user.email.toLowerCase());
if (!adminEmails.size) console.warn('ADMIN_EMAILS ist nicht gesetzt – es gibt keinen Admin.');

export async function ensureGroupTables() {
  await sql.run(`CREATE TABLE IF NOT EXISTS study_groups (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT NOT NULL UNIQUE, created_at ${sql.bigint} NOT NULL)`);
  await sql.run(`CREATE TABLE IF NOT EXISTS study_group_members (
    group_id TEXT NOT NULL, user_id TEXT NOT NULL, joined_at ${sql.bigint} NOT NULL,
    PRIMARY KEY (group_id, user_id))`);
}

const num = (x) => (x == null ? x : Number(x)); // BIGINT/COUNT kommen aus Postgres als String
const ID = /^[\w-]{1,64}$/;

// Code-Raten bremsen: höchstens 8 falsche Codes pro Nutzer in 15 Minuten
const misses = new Map();
function tooManyMisses(uid) {
  const now = Date.now();
  const recent = (misses.get(uid) ?? []).filter((t) => now - t < 15 * 60_000);
  misses.set(uid, recent);
  return recent.length >= 8;
}
const noteMiss = (uid) => misses.set(uid, [...(misses.get(uid) ?? []), Date.now()]);

const db = {
  groupByCode: async (code) => (await sql.all('SELECT id, name FROM study_groups WHERE code = ?', [code]))[0],
  group: async (id) => {
    const g = (await sql.all('SELECT id, name, code, created_at FROM study_groups WHERE id = ?', [id]))[0];
    return g && { id: g.id, name: g.name, code: formatCode(g.code), createdAt: num(g.created_at) };
  },
  mine: async (uid) => (await sql.all(
    `SELECT g.id, g.name, m.joined_at FROM study_group_members m JOIN study_groups g ON g.id = m.group_id
     WHERE m.user_id = ? ORDER BY m.joined_at`, [uid])).map((r) => ({ id: r.id, name: r.name, joinedAt: num(r.joined_at) })),
  join: (gid, uid) => sql.run('INSERT INTO study_group_members (group_id, user_id, joined_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING', [gid, uid, Date.now()]),
  leave: (gid, uid) => sql.run('DELETE FROM study_group_members WHERE group_id = ? AND user_id = ?', [gid, uid]),
  all: async () => (await sql.all(
    `SELECT g.id, g.name, g.code, g.created_at,
       (SELECT COUNT(*) FROM study_group_members m WHERE m.group_id = g.id) AS members
     FROM study_groups g ORDER BY g.created_at DESC`)).map((r) => ({
    id: r.id, name: r.name, code: formatCode(r.code), createdAt: num(r.created_at), members: num(r.members),
  })),
  create: async (name) => {
    for (let i = 0; i < 5; i++) { // Kollision des UNIQUE-Codes ist praktisch ausgeschlossen, trotzdem wiederholen
      const id = randomUUID();
      try { await sql.run('INSERT INTO study_groups (id, name, code, created_at) VALUES (?, ?, ?, ?)', [id, name, generateCode(), Date.now()]); return id; } catch (e) { if (i === 4) throw e; }
    }
  },
  remove: async (gid) => {
    await sql.run('DELETE FROM study_group_members WHERE group_id = ?', [gid]);
    return sql.run('DELETE FROM study_groups WHERE id = ?', [gid]);
  },
  members: (gid) => sql.all(
    `SELECT u.id, u.name, u.email, m.joined_at FROM study_group_members m JOIN "user" u ON u.id = m.user_id
     WHERE m.group_id = ? ORDER BY u.name`, [gid]),
  entries: async (gid, uid = null) => (await sql.all(
    `SELECT user_id, ts, mode, type, correct, total, seconds, seed FROM history
     WHERE user_id ${uid ? '= ?' : 'IN (SELECT user_id FROM study_group_members WHERE group_id = ?)'} ORDER BY ts`,
    [uid ?? gid])).map((e) => ({ ...e, ts: num(e.ts) })),
  isMember: async (gid, uid) => (await sql.all('SELECT 1 AS x FROM study_group_members WHERE group_id = ? AND user_id = ?', [gid, uid])).length > 0,
};

const memberOut = (m) => ({ id: m.id, name: m.name, email: m.email, joinedAt: num(m.joined_at) });

async function groupOverview(gid) {
  const [members, entries] = await Promise.all([db.members(gid), db.entries(gid)]);
  const byUser = new Map();
  for (const e of entries) (byUser.get(e.user_id) ?? byUser.set(e.user_id, []).get(e.user_id)).push(e);
  return members.map((m) => ({ ...memberOut(m), ...summarize(byUser.get(m.id) ?? []) }));
}

const slug = (s) => s.normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'gruppe';

/**
 * Behandelt /api/account, /api/groups/* und /api/admin/*. ctx: { user, send, sendCsv, readJson, sameOrigin }
 * Gibt true zurück, wenn die Anfrage behandelt wurde.
 */
export async function groupsApi(req, res, pathname, ctx) {
  const { user, send, sendCsv, readJson, sameOrigin } = ctx;
  const parts = pathname.split('/').filter(Boolean).map(decodeURIComponent); // ['api', …]
  const [, area, a, b, c, d] = parts;
  const method = req.method;
  if (method !== 'GET' && !sameOrigin(req)) return send(res, 403, { error: 'forbidden' });
  if (!user) return send(res, 401, { error: 'unauthorized' });

  /* ---- Konto des angemeldeten Nutzers */
  if (area === 'account' && method === 'GET') {
    return send(res, 200, { user: { id: user.id, name: user.name, email: user.email }, admin: isAdmin(user), groups: await db.mine(user.id) });
  }

  if (area === 'groups') {
    if (method !== 'POST') return send(res, 405, { error: 'method' });
    if (a === 'leave') {
      const { groupId } = await readJson(req);
      if (typeof groupId !== 'string' || !ID.test(groupId)) return send(res, 400, { error: 'invalid' });
      await db.leave(groupId, user.id);
      return send(res, 200, { ok: true, groups: await db.mine(user.id) });
    }
    if (a === 'preview' || a === 'join') {
      if (tooManyMisses(user.id)) return send(res, 429, { error: 'rate_limit' });
      const body = await readJson(req);
      const group = await db.groupByCode(normalizeCode(body.code));
      if (!group) { noteMiss(user.id); return send(res, 404, { error: 'not_found' }); }
      if (a === 'preview') return send(res, 200, { group: { name: group.name } });
      if (body.consent !== true) return send(res, 400, { error: 'consent_required' }); // Einwilligung muss ausdrücklich kommen
      await db.join(group.id, user.id);
      return send(res, 200, { group: { id: group.id, name: group.name }, groups: await db.mine(user.id) });
    }
    return send(res, 404, { error: 'not_found' });
  }

  /* ---- Admin */
  if (area !== 'admin') return send(res, 404, { error: 'not_found' });
  if (!isAdmin(user)) return send(res, 403, { error: 'forbidden' });
  if (a !== 'groups') return send(res, 404, { error: 'not_found' });

  if (!b) { // /api/admin/groups
    if (method === 'GET') return send(res, 200, { groups: await db.all() });
    if (method === 'POST') {
      const name = String((await readJson(req)).name ?? '').trim().slice(0, 80);
      if (!name) return send(res, 400, { error: 'invalid' });
      const id = await db.create(name);
      return send(res, 200, { group: await db.group(id) });
    }
    return send(res, 405, { error: 'method' });
  }

  if (!ID.test(b)) return send(res, 400, { error: 'invalid' });
  const group = await db.group(b);
  if (!group) return send(res, 404, { error: 'not_found' });

  if (!c) { // /api/admin/groups/:id
    if (method === 'GET') return send(res, 200, { group, members: await groupOverview(b) });
    if (method === 'DELETE') { await db.remove(b); return send(res, 200, { ok: true }); }
    return send(res, 405, { error: 'method' });
  }

  if (c === 'export' && method === 'GET') { // /api/admin/groups/:id/export?kind=summary|raw
    const raw = new URL(req.url, 'http://x').searchParams.get('kind') === 'raw';
    const stamp = new Date().toISOString().slice(0, 10);
    if (raw) {
      const members = new Map((await db.members(b)).map((m) => [m.id, m]));
      const rows = (await db.entries(b)).map((e) => {
        const m = members.get(e.user_id);
        return [m?.name, m?.email, utc(e.ts), e.mode === 'exam' ? 'Prüfung' : 'Übung', e.type, e.correct, e.total, percent(e), e.seconds, e.seed];
      });
      return sendCsv(res, `${slug(group.name)}-rohdaten-${stamp}.csv`,
        toCsv(['Name', 'E-Mail', 'Zeit (UTC)', 'Modus', 'Typ', 'Richtig', 'Gesamt', 'Prozent', 'Sekunden', 'Seed'], rows));
    }
    const pc = (x) => (x == null ? '' : x);
    const rows = (await groupOverview(b)).map((m) => [
      m.name, m.email, m.exams, m.practices,
      ...TYPE_KEYS.map((t) => pc(m.exam[t])), ...TYPE_KEYS.map((t) => pc(m.practice[t])),
      m.last ? utc(m.last) : '', m.trend ? m.trend.delta : '',
    ]);
    return sendCsv(res, `${slug(group.name)}-uebersicht-${stamp}.csv`, toCsv(
      ['Name', 'E-Mail', 'Prüfungen', 'Übungen', ...TYPE_KEYS.map((t) => `Prüfung Ø % ${t}`), ...TYPE_KEYS.map((t) => `Übung Ø % ${t}`), 'Zuletzt aktiv (UTC)', 'Trend (Prozentpunkte)'], rows));
  }

  if (c === 'members' && d && ID.test(d)) { // /api/admin/groups/:id/members/:uid
    if (!(await db.isMember(b, d))) return send(res, 404, { error: 'not_found' });
    if (method === 'GET') {
      const m = (await db.members(b)).find((x) => x.id === d);
      if (!m) return send(res, 404, { error: 'not_found' });
      const entries = await db.entries(b, d);
      return send(res, 200, { member: { ...memberOut(m), ...summarize(entries) }, entries: entries.map((e) => ({ ...e, percent: percent(e) })) });
    }
    if (method === 'DELETE') { await db.leave(b, d); return send(res, 200, { ok: true }); }
    return send(res, 405, { error: 'method' });
  }

  return send(res, 404, { error: 'not_found' });
}
