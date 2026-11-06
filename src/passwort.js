// Seite „Neues Passwort“ (passwort.html): Ziel des Links aus der E-Mail zum Zurücksetzen (?token=… oder ?error=…).
import * as Auth from './auth.js';
import { esc } from './ui.js';

const app = document.getElementById('app');
const params = new URLSearchParams(location.search);
const token = params.get('token');

const message = (title, html) => { app.innerHTML = `<h1>${esc(title)}</h1><section class="card">${html}</section>`; };

if (!token || params.get('error')) {
  message('Link ungültig', '<p>Dieser Link ist ungültig oder abgelaufen. Bitte fordere auf der Startseite über „Anmelden → Passwort vergessen?“ einen neuen an.</p><p><a class="btn" href="./">Zur Startseite</a></p>');
} else {
  history.replaceState(null, '', location.pathname); // Token aus der Adresszeile entfernen
  app.innerHTML = `<h1>Neues Passwort festlegen</h1>
    <section class="card">
      <form id="pw-form">
        <label for="pw-new">Neues Passwort</label>
        <input id="pw-new" type="password" autocomplete="new-password" minlength="8" maxlength="128" required>
        <label for="pw-repeat">Neues Passwort wiederholen</label>
        <input id="pw-repeat" type="password" autocomplete="new-password" minlength="8" maxlength="128" required>
        <p class="form-note">Mindestens 8 Zeichen. Auf anderen Geräten wirst du danach abgemeldet.</p>
        <p class="form-error" id="pw-error" role="alert"></p>
        <button type="submit" class="primary" id="pw-save">Passwort speichern</button>
      </form>
    </section>`;
  const $ = (id) => document.getElementById(id);
  $('pw-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    $('pw-error').textContent = '';
    const password = $('pw-new').value;
    if (password.length < 8) { $('pw-error').textContent = 'Das Passwort braucht mindestens 8 Zeichen.'; return; }
    if (password !== $('pw-repeat').value) { $('pw-error').textContent = 'Die Passwörter stimmen nicht überein.'; return; }
    $('pw-save').disabled = true;
    const result = await Auth.resetPassword(password, token);
    if (!result.ok) { $('pw-error').textContent = result.error; $('pw-save').disabled = false; return; }
    message('Passwort geändert', '<p>Dein Passwort wurde geändert. Du kannst dich jetzt anmelden.</p><p><a class="btn primary" href="./#login">Zur Anmeldung</a></p>');
  });
}
