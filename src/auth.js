// Dünner Client für die Better-Auth-Endpunkte (/api/auth/*) und die Verlaufs-API (/api/history).
// Auf einem rein statischen Host (z. B. GitHub Pages) gibt es diese Endpunkte nicht –
// dann meldet getSession() { available: false } und die App läuft wie bisher nur lokal.

export async function call(path, options = {}) {
  const res = await fetch(path, { credentials: 'same-origin', ...options });
  let data;
  try { data = await res.json(); } catch { data = undefined; } // keine JSON-Antwort
  return { ok: res.ok, status: res.status, data };
}

export const post = (path, body) => call(path, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const ERRORS = {
  USER_ALREADY_EXISTS: 'Zu dieser E-Mail-Adresse gibt es schon ein Konto.',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'Zu dieser E-Mail-Adresse gibt es schon ein Konto.',
  INVALID_EMAIL_OR_PASSWORD: 'E-Mail oder Passwort stimmt nicht.',
  INVALID_EMAIL: 'Bitte eine gültige E-Mail-Adresse eingeben.',
  PASSWORD_TOO_SHORT: 'Das Passwort ist zu kurz (mindestens 8 Zeichen).',
  PASSWORD_TOO_LONG: 'Das Passwort ist zu lang.',
};
const errorText = (r) => ERRORS[r.data?.code] ?? (r.status === 429 ? 'Zu viele Versuche. Bitte kurz warten.' : `Das hat nicht geklappt (Fehler ${r.status}).`);

export async function getSession() {
  try {
    const r = await call('/api/auth/get-session');
    if (!r.ok || r.data === undefined) return { available: false, user: null };
    return { available: true, user: r.data?.user ?? null };
  } catch {
    return { available: false, user: null };
  }
}

export async function signUp(name, email, password) {
  try {
    const r = await post('/api/auth/sign-up/email', { name, email, password });
    return r.ok ? { ok: true } : { ok: false, error: errorText(r) };
  } catch { return { ok: false, error: 'Server nicht erreichbar.' }; }
}

export async function signIn(email, password) {
  try {
    const r = await post('/api/auth/sign-in/email', { email, password });
    return r.ok ? { ok: true } : { ok: false, error: errorText(r) };
  } catch { return { ok: false, error: 'Server nicht erreichbar.' }; }
}

export async function signOut() {
  try { await post('/api/auth/sign-out', {}); } catch { /* offline: Cookie läuft ohnehin ab */ }
}

export async function fetchHistory() {
  try {
    const r = await call('/api/history');
    return r.ok && Array.isArray(r.data?.entries) ? r.data.entries : null;
  } catch { return null; }
}

export async function pushHistory(entries) {
  if (!entries.length) return;
  try { await post('/api/history', { entries }); } catch { /* wird beim nächsten Login nachgeholt */ }
}

export async function getConfig() {
  try { const r = await call('/api/config'); return r.ok && r.data ? r.data : {}; } catch { return {}; }
}

// Weiterleitung zu GitHub; nach dem Login landet man wieder auf der Startseite
export async function signInGithub() {
  try {
    const r = await post('/api/auth/sign-in/social', { provider: 'github', callbackURL: '/' });
    if (r.ok && r.data?.url) { location.href = r.data.url; return { ok: true }; }
    return { ok: false, error: errorText(r) };
  } catch { return { ok: false, error: 'Server nicht erreichbar.' }; }
}
