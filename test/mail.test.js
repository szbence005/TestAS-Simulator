import test from 'node:test';
import assert from 'node:assert/strict';
import { mailTemplate, newTestMail, resetPasswordMail, welcomeMail, sendMail, mailEnabled } from '../server/mail.js';

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
