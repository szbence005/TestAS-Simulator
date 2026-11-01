import * as Auth from './auth.js';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

export function renderAccountInfo({ app, setScreen, goHome, user, onOpenSettings }) {
  setScreen('account-info');
  const createdAt = user.createdAt ? new Date(user.createdAt).toLocaleDateString('de-DE') : '–';
  app.innerHTML = `
    <div class="row" style="margin-top:14px"><button type="button" id="info-home">‹ Startseite</button></div>
    <h1>Kontoinformationen</h1>
    <p class="lead muted">Die persönlichen Daten deines Kontos.</p>
    <section class="card account-info">
      <div class="account-info-row"><span class="muted">Anzeigename</span><strong>${esc(user.name)}</strong></div>
      <div class="account-info-row"><span class="muted">E-Mail-Adresse</span><strong>${esc(user.email)}</strong></div>
      <div class="account-info-row"><span class="muted">Konto erstellt</span><strong>${createdAt}</strong></div>
      <div class="account-info-row"><span class="muted">Konto-ID</span><code>${esc(user.id)}</code></div>
      <button type="button" class="primary" id="info-settings">Einstellungen öffnen</button>
    </section>`;
  document.getElementById('info-home').onclick = goHome;
  document.getElementById('info-settings').onclick = onOpenSettings;
}

export function renderAccountSettings({ app, setScreen, goHome, user, onUserUpdated, onAccountDeleted, onLogout }) {
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
    </div>
    <div class="row settings-actions"><button type="button" id="settings-logout">Abmelden</button></div>
    <section class="account-danger">
      <h2>Konto löschen</h2>
      <p class="muted">Dein Konto, deine gespeicherten Ergebnisse und deine Gruppen werden dauerhaft gelöscht. Das kann nicht rückgängig gemacht werden.</p>
      <form id="delete-account-form">
        <label for="delete-password">Aktuelles Passwort (falls vorhanden)</label>
        <input id="delete-password" type="password" autocomplete="current-password">
        <label for="delete-confirm">Zur Bestätigung LÖSCHEN eingeben</label>
        <div class="row nowrap"><input id="delete-confirm" type="text" autocomplete="off"><button type="submit" class="danger" id="delete-account" disabled>Konto endgültig löschen</button></div>
        <p class="form-error" id="delete-error" role="alert"></p>
      </form>
    </section>`;

  const $ = (id) => document.getElementById(id);
  $('settings-home').onclick = goHome;
  $('settings-logout').onclick = onLogout;
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

  $('delete-confirm').addEventListener('input', () => { $('delete-account').disabled = $('delete-confirm').value !== 'LÖSCHEN'; });
  $('delete-account-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if ($('delete-confirm').value !== 'LÖSCHEN') return;
    if (!confirm('Möchtest du dein Konto und alle zugehörigen Daten wirklich endgültig löschen?')) return;
    $('delete-error').textContent = '';
    $('delete-account').disabled = true;
    const result = await Auth.deleteAccount($('delete-password').value);
    if (!result.ok) {
      $('delete-error').textContent = result.error;
      $('delete-account').disabled = false;
      return;
    }
    onAccountDeleted?.();
  });
}