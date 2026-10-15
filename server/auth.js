// Better Auth: Konten mit E-Mail + Passwort und optional GitHub, gespeichert in Postgres (DATABASE_URL) oder SQLite.
// Umgebungsvariablen: BETTER_AUTH_SECRET, BETTER_AUTH_URL, DATABASE_URL, DB_PATH, PORT, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { betterAuth } from 'better-auth';

const port = Number(process.env.PORT) || 8080;
const COLS = 'ts, mode, type, correct, total, seconds, seed';

let database;
let history; // { list(uid), add(uid, rows) } – gleiche Schnittstelle für beide Datenbanken

if (process.env.DATABASE_URL) {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(`CREATE TABLE IF NOT EXISTS history (
    user_id TEXT NOT NULL, ts BIGINT NOT NULL, mode TEXT NOT NULL, type TEXT NOT NULL,
    correct INTEGER NOT NULL, total INTEGER NOT NULL, seconds INTEGER, seed INTEGER,
    PRIMARY KEY (user_id, ts, mode, type))`);
  database = pool;
  history = {
    async list(uid) {
      const r = await pool.query(`SELECT ${COLS} FROM history WHERE user_id = $1 ORDER BY ts DESC LIMIT 200`, [uid]);
      return r.rows.map((x) => ({ ...x, ts: Number(x.ts) })); // BIGINT kommt als String
    },
    async add(uid, rows) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        for (const e of rows) {
          await c.query(`INSERT INTO history (user_id, ${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
            [uid, e.ts, e.mode, e.type, e.correct, e.total, e.seconds ?? null, e.seed ?? null]);
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
  const list = db.prepare(`SELECT ${COLS} FROM history WHERE user_id = ? ORDER BY ts DESC LIMIT 200`);
  const ins = db.prepare(`INSERT OR IGNORE INTO history (user_id, ${COLS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  database = db;
  history = {
    async list(uid) { return list.all(uid); },
    async add(uid, rows) { db.transaction(() => rows.forEach((e) => ins.run(uid, e.ts, e.mode, e.type, e.correct, e.total, e.seconds ?? null, e.seed ?? null)))(); },
  };
}

export { history };
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
const baseURL = validUrl('BETTER_AUTH_URL') ?? validUrl('RENDER_EXTERNAL_URL') ?? `http://localhost:${port}`;

export const auth = betterAuth({
  database,
  baseURL,
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: { enabled: true, minPasswordLength: 8 },
  socialProviders: githubEnabled
    ? { github: { clientId: process.env.GITHUB_CLIENT_ID, clientSecret: process.env.GITHUB_CLIENT_SECRET } }
    : undefined,
});
