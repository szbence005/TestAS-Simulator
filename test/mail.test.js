import test from 'node:test';
import assert from 'node:assert/strict';
import { changeEmailMail, isEmailChangeRequest, mailTemplate, newTestMail, resetPasswordMail, welcomeMail, sendMail, mailEnabled } from '../server/mail.js';

test('Mail-Vorlage: Text wird maskiert, Button und Klartext-Variante vorhanden', () => {
  const { html, text } = mailTemplate({ heading: 'A <b>', paragraphs: ['x & "y"'], button: { label: 'Los', url: 'https://x.de/a?b=1&c=2' } });
  assert.ok(html.includes('A &lt;b&gt;') && html.includes('x &amp; &quot;y&quot;') && html.includes('b=1&amp;c=2'));
  assert.ok(!html.includes('<b>'));
  assert.ok(text.includes('Los: https://x.de/a?b=1&c=2'));
});

test('Mails: Betreff und Link', () => {
  const reset = resetPasswordMail({ name: 'Anna', email: 'a@x.de' }, 'https://x.de/reset');
  assert.equal(reset.subject, 'Passwort zurücksetzen');
  assert.ok(reset.text.includes('https://x.de/reset') && reset.text.includes('Hallo Anna'));
  const t = newTestMail({ name: 'B', email: 'b@x.de' }, { groupName: 'G', title: 'T', kindLabel: 'K', minutes: 20, startsAt: Date.UTC(2026, 10, 6, 11, 0), url: 'https://x.de/g' });
  assert.ok(t.subject.includes('„G“') && t.text.includes('12:00 Uhr'));
});

test('Ohne Brevo-Schlüssel wird nichts gesendet', async () => {
  assert.equal(mailEnabled, false);
  assert.equal(await sendMail({ to: { email: 'a@x.de' }, subject: 's', html: 'h', text: 't' }), false);
});

test('Willkommens-Mail: Dank, Gruß und Link', () => {
  const m = welcomeMail({ name: 'Anna', email: 'a@x.de' }, 'https://x.de');
  assert.equal(m.subject, 'Willkommen beim TestAS Simulator');
  assert.ok(m.text.includes('Hallo Anna') && m.text.includes('vielen Dank') && m.text.includes('gutes Üben'));
  assert.ok(m.text.includes('Jetzt loslegen: https://x.de') && m.html.includes('href="https://x.de"'));
});

test('E-Mail ändern: Bestätigungsmail für die neue Adresse; Token-Typ wird erkannt', () => {
  const m = changeEmailMail({ name: 'Anna', email: 'neu@x.de' }, 'https://x.de/verify');
  assert.equal(m.subject, 'Bitte bestätige deine neue E-Mail-Adresse');
  assert.ok(m.text.includes('Hallo Anna') && m.text.includes('https://x.de/verify'));
  const jwt = (payload) => `e30.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig`;
  assert.equal(isEmailChangeRequest({ url: `/api/auth/verify-email?token=${jwt({ requestType: 'change-email-verification' })}` }), true);
  assert.equal(isEmailChangeRequest({ url: `/api/auth/verify-email?token=${jwt({ requestType: 'change-email-confirmation' })}` }), true);
  assert.equal(isEmailChangeRequest({ url: `/api/auth/verify-email?token=${jwt({ email: 'a@x.de' })}` }), false); // Registrierung
  assert.equal(isEmailChangeRequest({ url: '/api/auth/verify-email' }), false);
  assert.equal(isEmailChangeRequest(undefined), false);
});

test('Neuer-Test-Mail nennt die Endzeit, wenn es eine gibt', () => {
  const base = { groupName: 'G', title: 'T', kindLabel: 'K', minutes: 20, startsAt: Date.UTC(2026, 10, 6, 11, 0), url: 'https://x.de/g' };
  assert.ok(newTestMail({ email: 'b@x.de' }, { ...base, endsAt: Date.UTC(2026, 10, 8, 17, 0) }).text.includes('bis Sonntag, 8. November 2026 um 18:00 Uhr') || newTestMail({ email: 'b@x.de' }, { ...base, endsAt: Date.UTC(2026, 10, 8, 17, 0) }).text.includes('18:00 Uhr'));
  assert.ok(!newTestMail({ email: 'b@x.de' }, base).text.includes(' bis '));
});
