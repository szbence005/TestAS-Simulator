// Better Auth: Konten mit E-Mail + Passwort und optional GitHub, gespeichert in Postgres (DATABASE_URL) oder SQLite.
// Umgebungsvariablen: BETTER_AUTH_SECRET, BETTER_AUTH_URL, DATABASE_URL, DB_PATH, PORT, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, ADMIN_EMAILS
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { betterAuth } from 'better-auth';
import { mailEnabled, sendMail, verifyEmailMail, changeEmailMail, isEmailChangeRequest, resetPasswordMail, welcomeMail } from './mail.js';

const port = Number(process.env.PORT) || 8080;
const COLS = 'ts, mode, type, correct, total, seconds, seed, detail';
// Spalten für die serverseitige Prüfung: verified (1 = nachgerechnet; ältere Zeilen gelten als geprüft), Aufgabenzahl und Schwierigkeit der Prüfung
const CHECK_COLS = 'verified, exam_count, exam_difficulty';
const checkValues = (e) => [e.verified ?? 1, e.examCount ?? null, e.examDifficulty ?? null];
const parseDetail = (text) => { try { return text ? JSON.parse(text) : null; } catch { return null; } };

let database;
let history; // { list(uid), add(uid, rows) } – gleiche Schnittstelle für beide Datenbanken
let sql;     // { all(text, params), run(text, params), bigint } – SQL mit ?-Platzhaltern für beide Datenbanken

if (process.env.DATABASE_URL) {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(`CREATE TABLE IF NOT EXISTS history (
    user_id TEXT NOT NULL, ts BIGINT NOT NULL, mode TEXT NOT NULL, type TEXT NOT NULL,
    correct INTEGER NOT NULL, total INTEGER NOT NULL, seconds INTEGER, seed INTEGER,
    PRIMARY KEY (user_id, ts, mode, type))`);
  await pool.query('ALTER TABLE history ADD COLUMN IF NOT EXISTS detail TEXT'); // Antworten je Aufgabe (JSON) für die Detailansicht
  await pool.query('ALTER TABLE history ADD COLUMN IF NOT EXISTS verified INTEGER NOT NULL DEFAULT 1');
  await pool.query('ALTER TABLE history ADD COLUMN IF NOT EXISTS exam_count INTEGER');
  await pool.query('ALTER TABLE history ADD COLUMN IF NOT EXISTS exam_difficulty TEXT');
  database = pool;
  const toPg = (text) => { let i = 0; return text.replace(/\?/g, () => `$${++i}`); };
  sql = {
    bigint: 'BIGINT',
    async all(text, params = []) { return (await pool.query(toPg(text), params)).rows; },
    async run(text, params = []) { return (await pool.query(toPg(text), params)).rowCount; },
  };
  history = {
    async list(uid) {
      const r = await pool.query(`SELECT ${COLS} FROM history WHERE user_id = $1 ORDER BY ts DESC LIMIT 200`, [uid]);
      return r.rows.map((x) => ({ ...x, ts: Number(x.ts), detail: parseDetail(x.detail) })); // BIGINT kommt als String
    },
    async add(uid, rows) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        for (const e of rows) {
          await c.query(`INSERT INTO history (user_id, ${COLS}, ${CHECK_COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT DO NOTHING`,
            [uid, e.ts, e.mode, e.type, e.correct, e.total, e.seconds ?? null, e.seed ?? null, e.detail ? JSON.stringify(e.detail) : null, ...checkValues(e)]);
        }
        await c.query('COMMIT');
      } catch (err) { await c.query('ROLLBACK'); throw err; } finally { c.release(); }
    },
  };
} else {
  const { default: Database } = await import('better-sqlite3');
  const dbPath = process.env.DB_PATH ?? 'data/testas.db';
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`CREATE TABLE IF NOT EXISTS history (
    user_id TEXT NOT NULL, ts INTEGER NOT NULL, mode TEXT NOT NULL, type TEXT NOT NULL,
    correct INTEGER NOT NULL, total INTEGER NOT NULL, seconds INTEGER, seed INTEGER,
    PRIMARY KEY (user_id, ts, mode, type))`);
  for (const column of ['detail TEXT', 'verified INTEGER NOT NULL DEFAULT 1', 'exam_count INTEGER', 'exam_difficulty TEXT']) {
    try { db.exec(`ALTER TABLE history ADD COLUMN ${column}`); }
    catch (error) { if (!/duplicate column name/i.test(error.message)) throw error; }
  }
  const list = db.prepare(`SELECT ${COLS} FROM history WHERE user_id = ? ORDER BY ts DESC LIMIT 200`);
  const ins = db.prepare(`INSERT OR IGNORE INTO history (user_id, ${COLS}, ${CHECK_COLS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  database = db;
  sql = {
    bigint: 'INTEGER',
    async all(text, params = []) { return db.prepare(text).all(...params); },
    async run(text, params = []) { return db.prepare(text).run(...params).changes; },
  };
  history = {
    async list(uid) { return list.all(uid).map((x) => ({ ...x, detail: parseDetail(x.detail) })); },
    async add(uid, rows) { db.transaction(() => rows.forEach((e) => ins.run(uid, e.ts, e.mode, e.type, e.correct, e.total, e.seconds ?? null, e.seed ?? null, e.detail ? JSON.stringify(e.detail) : null, ...checkValues(e))))(); },
  };
}

export { history, sql };
export const githubEnabled = Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);

// Reihenfolge: eigene Angabe (z. B. eigene Domain) → von Render automatisch gesetzte URL → lokal.
// Ungültige Werte (z. B. ein vergessener Platzhalter) werden übersprungen statt den Start abzubrechen.
const validUrl = (name) => {
  const v = process.env[name]?.trim().replace(/\/+$/, '');
  if (!v) return null;
  try { return ['http:', 'https:'].includes(new URL(v).protocol) ? v : null; } catch { /* ungültig */ }
  console.warn(`${name}="${v}" ist keine gültige URL (https://… erwartet) und wird ignoriert.`);
  return null;
};
export const baseURL = validUrl('BETTER_AUTH_URL') ?? validUrl('RENDER_EXTERNAL_URL') ?? `http://localhost:${port}`;

export const auth = betterAuth({
  database,
  baseURL,
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // Nur mit funktionierendem Mailversand verlangen – sonst könnte sich niemand mehr anmelden
    requireEmailVerification: mailEnabled,
    resetPasswordTokenExpiresIn: 3600,
    revokeSessionsOnPasswordReset: true,
    ...(mailEnabled ? { sendResetPassword: async ({ user, url }) => { void sendMail({ to: user, ...resetPasswordMail(user, url) }); } } : {}),
  },
  ...(mailEnabled ? {
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true, // bestehende Konten ohne Bestätigung bekommen beim Anmelden einen neuen Link
      autoSignInAfterVerification: true,
      // Willkommens-Mail, sobald die Adresse bestätigt ist (E-Mail-Registrierung)
      // (nicht, wenn nur eine geänderte E-Mail-Adresse bestätigt wurde)
      afterEmailVerification: async (user, request) => { if (!isEmailChangeRequest(request)) void sendMail({ to: user, ...welcomeMail(user, baseURL) }); },
      // Bei einer Adressänderung ist user.email die NEUE Adresse (die gespeicherte ist noch die alte) – die Mail geht an die neue Adresse
      sendVerificationEmail: async ({ user, url }) => {
        const stored = (await sql.all('SELECT email FROM "user" WHERE id = ?', [user.id]))[0]?.email;
        const changing = stored != null && stored.toLowerCase() !== user.email.toLowerCase();
        void sendMail({ to: user, ...(changing ? changeEmailMail(user, url) : verifyEmailMail(user, url)) });
      },
    },
  } : {}),
  // GitHub-Konten sind bei der Registrierung schon bestätigt: Willkommens-Mail direkt beim Anlegen
  ...(mailEnabled ? {
    databaseHooks: {
      user: { create: { after: async (user) => { if (user.emailVerified) void sendMail({ to: user, ...welcomeMail(user, baseURL) }); } } },
    },
  } : {}),
  user: {
    // E-Mail ändern: Bestätigungslink an die neue Adresse; erst nach dem Klick gilt sie. Ohne Mailversand nicht möglich.
    changeEmail: { enabled: mailEnabled },
    deleteUser: {
      enabled: true,
      afterDelete: async (deletedUser) => {
        await sql.run('DELETE FROM group_tests WHERE group_id IN (SELECT id FROM study_groups WHERE created_by = ?)', [deletedUser.id]);
        await sql.run('DELETE FROM study_group_members WHERE group_id IN (SELECT id FROM study_groups WHERE created_by = ?)', [deletedUser.id]);
        await sql.run('DELETE FROM study_groups WHERE created_by = ?', [deletedUser.id]);
        await sql.run('DELETE FROM study_group_members WHERE user_id = ?', [deletedUser.id]);
        await sql.run('DELETE FROM history WHERE user_id = ?', [deletedUser.id]);
        await sql.run('DELETE FROM user_mail_prefs WHERE user_id = ?', [deletedUser.id]);
      },
    },
  },
  socialProviders: githubEnabled
    ? { github: { clientId: process.env.GITHUB_CLIENT_ID, clientSecret: process.env.GITHUB_CLIENT_SECRET } }
    : undefined,
});
