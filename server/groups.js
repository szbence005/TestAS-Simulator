// Lerngruppen: Teilnehmer treten mit einem Code bei, der Admin (ADMIN_EMAILS) sieht die Ergebnisse der Mitglieder.
import { randomUUID } from 'node:crypto';
import { sql } from './auth.js';
import { TYPE_KEYS, generateCode, normalizeCode, formatCode, parseAdminEmails, summarize, countExams, percent, toCsv, utc, parseTestInput, shapeTest, testResult, completedCount, MAX_TESTS_PER_GROUP } from './stats.js';

const adminEmails = parseAdminEmails(process.env.ADMIN_EMAILS);
export const isAdmin = (user) => Boolean(user?.email) && adminEmails.has(user.email.toLowerCase());
if (!adminEmails.size) console.warn('ADMIN_EMAILS ist nicht gesetzt – es gibt keinen Admin.');

export async function ensureGroupTables() {
  await sql.run(`CREATE TABLE IF NOT EXISTS study_groups (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT NOT NULL UNIQUE, created_at ${sql.bigint} NOT NULL, created_by TEXT)`);
  try { await sql.run('ALTER TABLE study_groups ADD COLUMN created_by TEXT'); }
  catch (error) {
    if (error.code !== '42701' && !/duplicate column name: created_by/i.test(error.message)) throw error;
  }
  await sql.run(`CREATE TABLE IF NOT EXISTS study_group_members (
    group_id TEXT NOT NULL, user_id TEXT NOT NULL, joined_at ${sql.bigint} NOT NULL,
    PRIMARY KEY (group_id, user_id))`);
  // Geplante Tests einer Gruppe: erscheinen für die Mitglieder ab starts_at (Seed + Umfang + Zeit ergeben die Aufgaben)
  await sql.run(`CREATE TABLE IF NOT EXISTS group_tests (
    id TEXT PRIMARY KEY, group_id TEXT NOT NULL, title TEXT NOT NULL, kind TEXT NOT NULL, minutes INTEGER NOT NULL,
    seed INTEGER NOT NULL, starts_at ${sql.bigint} NOT NULL, created_at ${sql.bigint} NOT NULL)`);
  await sql.run('CREATE INDEX IF NOT EXISTS group_tests_group ON group_tests (group_id)');
}

const num = (x) => (x == null ? x : Number(x)); // BIGINT/COUNT kommen aus Postgres als String
const ID = /^[\w-]{1,64}$/;
const ACTIONS = new Set(['created', 'create', 'leave', 'preview', 'join']); // feste Aktionen, keine Gruppen-IDs

// Code-Raten bremsen: höchstens 8 falsche Codes pro Nutzer in 15 Minuten
const misses = new Map();
function tooManyMisses(uid) {
  const now = Date.now();
  const recent = (misses.get(uid) ?? []).filter((t) => now - t < 15 * 60_000);
  misses.set(uid, recent);
  return recent.length >= 8;
}
const noteMiss = (uid) => misses.set(uid, [...(misses.get(uid) ?? []), Date.now()]);

const testRow = (r) => ({ id: r.id, title: r.title, kind: r.kind, minutes: num(r.minutes), seed: num(r.seed), startsAt: num(r.starts_at), createdAt: num(r.created_at) });

const db = {
  groupByCode: async (code) => (await sql.all('SELECT id, name, created_by FROM study_groups WHERE code = ?', [code]))[0],
  group: async (id) => {
    const g = (await sql.all('SELECT id, name, code, created_at FROM study_groups WHERE id = ?', [id]))[0];
    return g && { id: g.id, name: g.name, code: formatCode(g.code), createdAt: num(g.created_at) };
  },
  mine: async (uid) => (await sql.all(
    `SELECT g.id, g.name, m.joined_at FROM study_group_members m JOIN study_groups g ON g.id = m.group_id
     WHERE m.user_id = ? AND (g.created_by IS NULL OR g.created_by <> ?) ORDER BY m.joined_at`, [uid, uid])).map((r) => ({ id: r.id, name: r.name, joinedAt: num(r.joined_at) })),
  join: (gid, uid) => sql.run('INSERT INTO study_group_members (group_id, user_id, joined_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING', [gid, uid, Date.now()]),
  leave: (gid, uid) => sql.run('DELETE FROM study_group_members WHERE group_id = ? AND user_id = ?', [gid, uid]),
  all: async () => (await sql.all(
    `SELECT g.id, g.name, g.code, g.created_at,
       (SELECT COUNT(*) FROM study_group_members m WHERE m.group_id = g.id) AS members
     FROM study_groups g ORDER BY g.created_at DESC`)).map((r) => ({
    id: r.id, name: r.name, code: formatCode(r.code), createdAt: num(r.created_at), members: num(r.members),
  })),
  created: async (uid) => (await sql.all(
    `SELECT g.id, g.name, g.code, g.created_at,
       (SELECT COUNT(*) FROM study_group_members m WHERE m.group_id = g.id) AS members
     FROM study_groups g WHERE g.created_by = ? ORDER BY g.created_at DESC`, [uid])).map((r) => ({
    id: r.id, name: r.name, code: formatCode(r.code), createdAt: num(r.created_at), members: num(r.members),
  })),
  isOwner: async (gid, uid) => (await sql.all('SELECT 1 AS x FROM study_groups WHERE id = ? AND created_by = ?', [gid, uid])).length > 0,
  create: async (name, ownerId = null) => {
    for (let i = 0; i < 5; i++) { // Kollision des UNIQUE-Codes ist praktisch ausgeschlossen, trotzdem wiederholen
      const id = randomUUID();
      try { await sql.run('INSERT INTO study_groups (id, name, code, created_at, created_by) VALUES (?, ?, ?, ?, ?)', [id, name, generateCode(), Date.now(), ownerId]); return id; } catch (e) { if (i === 4) throw e; }
    }
  },
  tests: async (gid) => (await sql.all(
    'SELECT id, title, kind, minutes, seed, starts_at, created_at FROM group_tests WHERE group_id = ? ORDER BY starts_at DESC, created_at DESC', [gid])).map(testRow),
  test: async (gid, tid) => (await sql.all(
    'SELECT id, title, kind, minutes, seed, starts_at, created_at FROM group_tests WHERE group_id = ? AND id = ?', [gid, tid])).map(testRow)[0],
  testCount: async (gid) => Number((await sql.all('SELECT COUNT(*) AS n FROM group_tests WHERE group_id = ?', [gid]))[0].n),
  createTest: async (gid, t) => {
    const id = randomUUID();
    await sql.run('INSERT INTO group_tests (id, group_id, title, kind, minutes, seed, starts_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, gid, t.title, t.kind, t.minutes, t.seed, t.startsAt, Date.now()]);
    return id;
  },
  removeTest: (gid, tid) => sql.run('DELETE FROM group_tests WHERE group_id = ? AND id = ?', [gid, tid]),
  // Prüfungsergebnisse der aktuellen Gruppenmitglieder mit einem der Seeds (Grundlage für die Auswertung der Tests)
  examEntries: async (gid, seeds) => (!seeds.length ? [] : (await sql.all(
    `SELECT user_id, ts, mode, type, correct, total, seconds, seed FROM history
     WHERE mode = 'exam' AND seed IN (${seeds.map(() => '?').join(', ')})
       AND user_id IN (SELECT user_id FROM study_group_members WHERE group_id = ?) ORDER BY ts`, [...seeds, gid])).map((e) => ({ ...e, ts: num(e.ts) }))),
  remove: async (gid) => {
    await sql.run('DELETE FROM group_tests WHERE group_id = ?', [gid]);
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

const average = (values) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) / 10 : null;

async function adminOverview() {
  const [users, buckets, examRows] = await Promise.all([
    sql.all('SELECT id, name, email FROM "user" ORDER BY name'),
    sql.all(`SELECT user_id, mode, type, COUNT(*) AS attempts, SUM(correct) AS correct, SUM(total) AS total,
      AVG(100.0 * correct / NULLIF(total, 0)) AS average, MAX(ts) AS last
      FROM history GROUP BY user_id, mode, type`),
    sql.all('SELECT user_id, ts, seed FROM history WHERE mode = ? ORDER BY user_id, ts', ['exam']),
  ]);
  const byUser = new Map(users.map((user) => [user.id, { buckets: [], exams: [] }]));
  for (const bucket of buckets) {
    const user = byUser.get(bucket.user_id);
    if (user) user.buckets.push({ ...bucket, attempts: Number(bucket.attempts), correct: Number(bucket.correct), total: Number(bucket.total), average: bucket.average == null ? null : Number(bucket.average), last: num(bucket.last) });
  }
  for (const row of examRows) byUser.get(row.user_id)?.exams.push({ mode: 'exam', ts: num(row.ts), seed: row.seed });

  const userStats = users.map((user) => {
    const data = byUser.get(user.id);
    const exams = data.buckets.filter((bucket) => bucket.mode === 'exam');
    const practices = data.buckets.filter((bucket) => bucket.mode === 'practice');
    const examAverage = average(exams.map((bucket) => bucket.average).filter((value) => value != null));
    const practiceAverage = percent({
      correct: practices.reduce((sum, bucket) => sum + bucket.correct, 0),
      total: practices.reduce((sum, bucket) => sum + bucket.total, 0),
    });
    const last = data.buckets.reduce((latest, bucket) => Math.max(latest, bucket.last ?? 0), 0) || null;
    return {
      ...user,
      exams: countExams(data.exams),
      practices: practices.reduce((sum, bucket) => sum + bucket.attempts, 0),
      examAverage,
      practiceAverage,
      last,
    };
  });

  const performance = { exam: {}, practice: {} };
  for (const mode of ['exam', 'practice']) {
    for (const type of TYPE_KEYS) {
      const entries = buckets.filter((bucket) => bucket.mode === mode && bucket.type === type);
      performance[mode][type] = percent({
        correct: entries.reduce((sum, bucket) => sum + Number(bucket.correct), 0),
        total: entries.reduce((sum, bucket) => sum + Number(bucket.total), 0),
      });
    }
  }
  const total = (mode, field) => buckets.filter((bucket) => bucket.mode === mode)
    .reduce((sum, bucket) => sum + Number(bucket[field]), 0);
  return {
    users: userStats,
    system: {
      users: users.length,
      activeUsers: userStats.filter((user) => user.last != null).length,
      exams: userStats.reduce((sum, user) => sum + user.exams, 0),
      practices: userStats.reduce((sum, user) => sum + user.practices, 0),
      examAverage: percent({ correct: total('exam', 'correct'), total: total('exam', 'total') }),
      practiceAverage: percent({ correct: total('practice', 'correct'), total: total('practice', 'total') }),
      lastActivity: userStats.reduce((latest, user) => Math.max(latest, user.last ?? 0), 0) || null,
      performance,
    },
  };
}

async function exportGroup(req, res, gid, group, sendCsv) {
  const raw = new URL(req.url, 'http://x').searchParams.get('kind') === 'raw';
  const stamp = new Date().toISOString().slice(0, 10);
  if (raw) {
    const members = new Map((await db.members(gid)).map((m) => [m.id, m]));
    const rows = (await db.entries(gid)).map((e) => {
      const m = members.get(e.user_id);
      return [m?.name, m?.email, utc(e.ts), e.mode === 'exam' ? 'Prüfung' : 'Übung', e.type, e.correct, e.total, percent(e), e.seconds, e.seed];
    });
    return sendCsv(res, `${slug(group.name)}-rohdaten-${stamp}.csv`,
      toCsv(['Name', 'E-Mail', 'Zeit (UTC)', 'Modus', 'Typ', 'Richtig', 'Gesamt', 'Prozent', 'Sekunden', 'Seed'], rows));
  }
  const pc = (x) => (x == null ? '' : x);
  const rows = (await groupOverview(gid)).map((m) => [
    m.name, m.email, m.exams, m.practices,
    ...TYPE_KEYS.map((t) => pc(m.exam[t])), ...TYPE_KEYS.map((t) => pc(m.practice[t])),
    m.last ? utc(m.last) : '', m.trend ? m.trend.delta : '',
  ]);
  return sendCsv(res, `${slug(group.name)}-uebersicht-${stamp}.csv`, toCsv(
    ['Name', 'E-Mail', 'Prüfungen', 'Übungen', ...TYPE_KEYS.map((t) => `Prüfung Ø % ${t}`), ...TYPE_KEYS.map((t) => `Übung Ø % ${t}`), 'Zuletzt aktiv (UTC)', 'Trend (Prozentpunkte)'], rows));
}

const slug = (s) => s.normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'gruppe';

/**
 * /api/groups/:id/tests[/:tid] – Gruppentests.
 * Mitglieder: nur die Liste lesen (Seed erst ab Startzeit). Gruppenleitung: planen, auswerten, löschen.
 */
async function testsApi({ req, res, gid, group, owner, user, tid, method, send, readJson }) {
  const now = Date.now();
  if (!tid) {
    if (method === 'GET') {
      const tests = await db.tests(gid);
      if (!owner) {
        const mine = await db.entries(gid, user.id);
        return send(res, 200, {
          group: { id: group.id, name: group.name }, role: 'member',
          tests: tests.map((t) => { const out = shapeTest(t, { now }); return out.released ? { ...out, result: testResult(t, mine) } : out; }),
        });
      }
      const [entries, members] = await Promise.all([db.examEntries(gid, tests.map((t) => t.seed)), db.members(gid)]);
      return send(res, 200, {
        group, role: 'owner', members: members.length,
        tests: tests.map((t) => ({ ...shapeTest(t, { owner: true, now }), completed: completedCount(t, entries) })),
      });
    }
    if (method === 'POST') {
      const parsed = parseTestInput(await readJson(req), now);
      if (parsed.error) return send(res, 400, { error: parsed.error });
      if ((await db.testCount(gid)) >= MAX_TESTS_PER_GROUP) return send(res, 400, { error: 'limit' });
      const id = await db.createTest(gid, parsed.test);
      return send(res, 200, { test: shapeTest({ ...parsed.test, id }, { owner: true, now }) });
    }
    return send(res, 405, { error: 'method' });
  }
  const test = await db.test(gid, tid);
  if (!test) return send(res, 404, { error: 'not_found' });
  if (method === 'GET') {
    const [entries, members] = await Promise.all([db.examEntries(gid, [test.seed]), db.members(gid)]);
    const byUser = new Map();
    for (const e of entries) (byUser.get(e.user_id) ?? byUser.set(e.user_id, []).get(e.user_id)).push(e);
    return send(res, 200, {
      test: shapeTest(test, { owner: true, now }),
      members: members.map((m) => ({ ...memberOut(m), result: testResult(test, byUser.get(m.id) ?? []) })),
    });
  }
  if (method === 'DELETE') { await db.removeTest(gid, tid); return send(res, 200, { ok: true }); }
  return send(res, 405, { error: 'method' });
}

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
    return send(res, 200, { user: { id: user.id, name: user.name, email: user.email }, admin: isAdmin(user), groups: await db.mine(user.id), createdGroups: await db.created(user.id) });
  }

  if (area === 'groups') {
    if (a === 'created' && method === 'GET') return send(res, 200, { groups: await db.created(user.id) });
    if (a && !ACTIONS.has(a) && ID.test(a)) {
      const owner = await db.isOwner(a, user.id);
      // Mitglieder dürfen nur die Testliste lesen (GET /api/groups/:id/tests); alles andere bleibt der Gruppenleitung vorbehalten
      const memberRead = !owner && b === 'tests' && !c && method === 'GET' && await db.isMember(a, user.id);
      if (!owner && !memberRead) return send(res, 403, { error: 'forbidden' });
      const group = await db.group(a);
      if (!group) return send(res, 404, { error: 'not_found' });
      if (b === 'tests') {
        if (c && !ID.test(c)) return send(res, 404, { error: 'not_found' });
        return testsApi({ req, res, gid: a, group, owner, user, tid: c, method, send, readJson });
      }
      if (!b) {
        if (method === 'GET') return send(res, 200, { group, members: await groupOverview(a) });
        if (method === 'DELETE') { await db.remove(a); return send(res, 200, { ok: true }); }
        return send(res, 405, { error: 'method' });
      }
      if (b === 'export' && method === 'GET') return exportGroup(req, res, a, group, sendCsv);
      if (b === 'members' && c && ID.test(c)) {
        if (!(await db.isMember(a, c))) return send(res, 404, { error: 'not_found' });
        if (method === 'GET') {
          const m = (await db.members(a)).find((x) => x.id === c);
          if (!m) return send(res, 404, { error: 'not_found' });
          const entries = await db.entries(a, c);
          return send(res, 200, { member: { ...memberOut(m), ...summarize(entries) }, entries: entries.map((e) => ({ ...e, percent: percent(e) })) });
        }
        if (method === 'DELETE') { await db.leave(a, c); return send(res, 200, { ok: true }); }
        return send(res, 405, { error: 'method' });
      }
      return send(res, 404, { error: 'not_found' });
    }
    if (method !== 'POST') return send(res, 405, { error: 'method' });
    if (a === 'create') {
      const name = String((await readJson(req)).name ?? '').trim().slice(0, 80);
      if (!name) return send(res, 400, { error: 'invalid' });
      const id = await db.create(name, user.id);
      return send(res, 200, { group: await db.group(id) });
    }
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
      if (group.created_by === user.id) return send(res, 400, { error: 'own_group' }); // eigene Gruppe: kein Beitritt als Mitglied
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
  if (a === 'overview' && method === 'GET') return send(res, 200, await adminOverview());
  if (a === 'users' && b && ID.test(b)) {
    const account = (await sql.all('SELECT id, name, email FROM "user" WHERE id = ?', [b]))[0];
    if (!account) return send(res, 404, { error: 'not_found' });
    if (method !== 'GET' || c) return send(res, 405, { error: 'method' });
    const entries = await db.entries(null, b);
    return send(res, 200, { user: account, summary: summarize(entries), entries: entries.map((entry) => ({ ...entry, percent: percent(entry) })) });
  }
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

  if (c === 'export' && method === 'GET') return exportGroup(req, res, b, group, sendCsv); // /api/admin/groups/:id/export?kind=summary|raw

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
