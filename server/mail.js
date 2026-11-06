// E-Mail-Versand über die Brevo-API (HTTPS, kein SMTP – Render sperrt auf dem Gratis-Tarif ausgehende SMTP-Ports).
// Umgebungsvariablen: BREVO_API_KEY, MAIL_FROM (in Brevo verifizierte Absenderadresse), MAIL_FROM_NAME.
// Ohne Schlüssel bleibt der Versand aus: keine Bestätigungspflicht, kein „Passwort vergessen“, keine Benachrichtigungen.
const clean = (value) => value?.trim() || '';
const KEY = clean(process.env.BREVO_API_KEY);
const FROM = clean(process.env.MAIL_FROM);
const FROM_NAME = clean(process.env.MAIL_FROM_NAME) || 'Test-AS Simulation';

const API_URL = clean(process.env.BREVO_API_URL) || 'https://api.brevo.com/v3/smtp/email'; // abweichend nur für Tests

export const mailEnabled = Boolean(KEY && FROM);
if (!mailEnabled) console.warn('BREVO_API_KEY/MAIL_FROM nicht gesetzt – es werden keine E-Mails gesendet.');

export const escHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

/** Einheitliches Aussehen: { heading, paragraphs[], button?: { label, url }, note? } → { html, text } */
export function mailTemplate({ heading, paragraphs, button, note }) {
  const html = `<!doctype html><html lang="de"><body style="margin:0;padding:24px;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#111">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:10px;padding:28px">
<h1 style="margin:0 0 16px;font-size:20px">${escHtml(heading)}</h1>
${paragraphs.map((p) => `<p style="margin:0 0 14px;line-height:1.5">${escHtml(p)}</p>`).join('\n')}
${button ? `<p style="margin:22px 0"><a href="${escHtml(button.url)}" style="background:#e6430f;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;display:inline-block;font-weight:bold">${escHtml(button.label)}</a></p>
<p style="margin:0 0 14px;font-size:12px;color:#666;word-break:break-all">Falls der Button nicht funktioniert: ${escHtml(button.url)}</p>` : ''}
${note ? `<p style="margin:18px 0 0;font-size:12px;color:#666;line-height:1.5">${escHtml(note)}</p>` : ''}
</div></body></html>`;
  const text = [heading, '', ...paragraphs, ...(button ? ['', `${button.label}: ${button.url}`] : []), ...(note ? ['', note] : [])].join('\n');
  return { html, text };
}

/** Sendet eine E-Mail. Gibt true/false zurück und wirft nie (ein Mailfehler darf keine Anfrage zum Absturz bringen). */
export async function sendMail({ to, subject, html, text }) {
  if (!mailEnabled || !to?.email) return false;
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'api-key': KEY, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: FROM_NAME, email: FROM },
        to: [{ email: to.email, ...(to.name ? { name: to.name } : {}) }],
        subject, htmlContent: html, textContent: text,
      }),
    });
    if (!res.ok) {
      console.error(`Brevo hat die E-Mail abgelehnt (${res.status}): ${(await res.text()).slice(0, 300)}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error('E-Mail konnte nicht gesendet werden:', error.message);
    return false;
  }
}

const greeting = (user) => `Hallo ${user.name || user.email},`;

export const verifyEmailMail = (user, url) => ({
  subject: 'Bitte bestätige deine E-Mail-Adresse',
  ...mailTemplate({
    heading: 'E-Mail-Adresse bestätigen',
    paragraphs: [greeting(user), 'bitte bestätige deine E-Mail-Adresse, um dein Konto beim TestAS Simulator zu nutzen.'],
    button: { label: 'E-Mail bestätigen', url },
    note: 'Wenn du dich nicht registriert hast, kannst du diese E-Mail ignorieren.',
  }),
});

export const resetPasswordMail = (user, url) => ({
  subject: 'Passwort zurücksetzen',
  ...mailTemplate({
    heading: 'Passwort zurücksetzen',
    paragraphs: [greeting(user), 'wir haben eine Anfrage erhalten, dein Passwort zurückzusetzen. Der Link ist eine Stunde gültig.'],
    button: { label: 'Neues Passwort festlegen', url },
    note: 'Wenn du das nicht angefordert hast, kannst du diese E-Mail ignorieren – dein Passwort bleibt unverändert.',
  }),
});

export const welcomeMail = (user, url) => ({
  subject: 'Willkommen beim TestAS Simulator',
  ...mailTemplate({
    heading: 'Willkommen beim TestAS Simulator!',
    paragraphs: [
      greeting(user),
      'vielen Dank für deine Registrierung! Dein Konto ist startklar.',
      'Du kannst jetzt Prüfungen simulieren, einzelne Aufgabentypen üben, deinen Verlauf verfolgen und mit Lerngruppen gemeinsam trainieren. Deine Ergebnisse werden in deinem Konto gespeichert.',
      'Wir wünschen dir viel Erfolg und gutes Üben!',
    ],
    button: { label: 'Jetzt loslegen', url },
    note: 'Du erhältst diese E-Mail einmalig nach deiner Registrierung.',
  }),
});

export const changeEmailMail = (user, url) => ({
  subject: 'Bitte bestätige deine neue E-Mail-Adresse',
  ...mailTemplate({
    heading: 'Neue E-Mail-Adresse bestätigen',
    paragraphs: [greeting(user), 'für dein Konto beim TestAS Simulator wurde diese E-Mail-Adresse als neue Adresse angegeben. Sie gilt erst, wenn du sie bestätigst – danach meldest du dich mit ihr an.'],
    button: { label: 'Neue Adresse bestätigen', url },
    note: 'Wenn du das nicht angefordert hast, kannst du diese E-Mail ignorieren – dein Konto bleibt unverändert.',
  }),
});

/** Ob eine Bestätigungsanfrage von Better Auth eine E-Mail-Änderung betrifft (Token-Inhalt; die Signatur prüft Better Auth selbst). */
export function isEmailChangeRequest(request) {
  try {
    const token = new URL(request.url, 'http://x').searchParams.get('token');
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    return String(payload.requestType ?? '').startsWith('change-email');
  } catch { return false; }
}

const fmtDateTime = (ms) => `${new Date(ms).toLocaleString('de-DE', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/Berlin' })} Uhr`;

export const newTestMail = (user, { groupName, title, kindLabel, minutes, count, difficulty, startsAt, endsAt, url }) => ({
  subject: `Neuer Test in „${groupName}“: ${title}`,
  ...mailTemplate({
    heading: `Neuer Test: ${title}`,
    paragraphs: [
      greeting(user),
      `in deiner Lerngruppe „${groupName}“ wurde ein Test geplant.`,
      `${kindLabel} · ${count ? `${count} Aufgaben · ` : ''}${difficulty ? `Schwierigkeit: ${difficulty} · ` : ''}${minutes} Minuten pro Subtest · ab ${fmtDateTime(startsAt)}${endsAt ? ` · bis ${fmtDateTime(endsAt)}` : ''}`,
    ],
    button: { label: 'Zur Lerngruppe', url },
    note: 'Du erhältst diese E-Mail, weil du Benachrichtigungen aktiviert hast. Du kannst sie jederzeit in den Kontoeinstellungen ausschalten.',
  }),
});
