import * as Auth from './auth.js';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

export function renderAccountSettings({ app, setScreen, goHome, user, onUserUpdated }) {
  setScreen('settings');
  app.innerHTML = `
    <div class="row" style="margin-top:14px"><button type="button" id="settings-home">‹ Startseite</button></div>
    <h1>Kontoeinstellungen</h1>
    <p class="lead muted">Verwalte deine Profildaten und Zugangssicherheit.</p>
    <div class="grid settings-grid">
      <section class="card">
        <h2>Profil</h2>
        <form id="profile-form">
          <label for="profile-name">Anzeigename</label>
          <input id="profile-name" name="name" type="text" autocomplete="name" maxlength="120" required value="${esc(user.name)}">
          <label for="profile-email">E-Mail-Adresse</label>
          <input id="profile-email" type="email" value="${esc(user.email)}" readonly aria-describedby="email-note">
          <p id="email-note" class="form-note">Die E-Mail-Adresse ist dein Anmeldename und kann hier nicht geändert werden.</p>
          <p id="profile-status" class="form-note" role="status" aria-live="polite"></p>
          <p class="form-error" id="profile-error" role="alert"></p>
          <button type="submit" class="primary" id="profile-save">Änderungen speichern</button>
        </form>
      </section>
      <section class="card">
        <h2>Passwort</h2>
        <form id="password-form">
          <label for="current-password">Aktuelles Passwort</label>
          <input id="current-password" type="password" autocomplete="current-password" required>
          <label for="new-password">Neues Passwort</label>
          <input id="new-password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required>
          <label for="confirm-password">Neues Passwort wiederholen</label>
          <input id="confirm-password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required>
          <p class="form-note">Mindestens 8 Zeichen. Andere aktive Sitzungen werden nach der Änderung abgemeldet.</p>
          <p id="password-status" class="form-note" role="status" aria-live="polite"></p>
          <p class="form-error" id="password-error" role="alert"></p>
          <button type="submit" class="primary" id="password-save">Passwort ändern</button>
        </form>
      </section>
    </div>`;

  const $ = (id) => document.getElementById(id);
  $('settings-home').onclick = goHome;
  $('profile-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = $('profile-name').value.trim();
    $('profile-error').textContent = '';
    $('profile-status').textContent = '';
    if (!name) { $('profile-error').textContent = 'Bitte gib einen Anzeigenamen ein.'; return; }
    $('profile-save').disabled = true;
    const result = await Auth.updateProfile(name);
    $('profile-save').disabled = false;
    if (!result.ok) { $('profile-error').textContent = result.error; return; }
    onUserUpdated?.({ ...user, name });
    $('profile-status').textContent = 'Dein Anzeigename wurde gespeichert.';
  });

  $('password-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    $('password-error').textContent = '';
    $('password-status').textContent = '';
    const currentPassword = $('current-password').value;
    const newPassword = $('new-password').value;
    if (newPassword.length < 8) { $('password-error').textContent = 'Das neue Passwort braucht mindestens 8 Zeichen.'; return; }
    if (newPassword !== $('confirm-password').value) { $('password-error').textContent = 'Die neuen Passwörter stimmen nicht überein.'; return; }
    $('password-save').disabled = true;
    const result = await Auth.changePassword(currentPassword, newPassword);
    $('password-save').disabled = false;
    if (!result.ok) { $('password-error').textContent = result.error; return; }
    $('password-form').reset();
    $('password-status').textContent = 'Dein Passwort wurde geändert.';
  });
}