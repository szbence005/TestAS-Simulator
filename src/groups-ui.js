import * as G from './groups.js';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

export function renderGroupsPage({ app, setScreen, goHome, onOpenGroup }) {
  setScreen('groups');
  app.innerHTML = `
    <div class="row" style="margin-top:14px"><button type="button" id="groups-home">‹ Startseite</button></div>
    <h1>Lerngruppen</h1>
    <p class="lead muted">Erstelle eine eigene Gruppe oder tritt einer Lerngruppe mit einem Beitrittscode bei.</p>
    <div class="grid">
      <section class="card">
        <h2>Neue Gruppe</h2>
        <label for="grp-new-name">Gruppenname</label>
        <div class="row nowrap"><input id="grp-new-name" type="text" maxlength="80" placeholder="z. B. TestAS 2026 Frühling"><button type="button" class="primary" id="grp-create-btn">Erstellen</button></div>
        <p class="form-error" id="grp-create-error" role="alert"></p>
        <div id="grp-created" aria-live="polite"></div>
      </section>
      <section class="card">
        <h2>Gruppe beitreten</h2>
        <div id="grp-join">
          <label for="grp-code">Gruppencode</label>
          <div class="row nowrap"><input id="grp-code" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX" maxlength="12"><button type="button" id="grp-check">Weiter</button></div>
        </div>
        <div id="grp-consent" hidden>
          <p>Du trittst der Gruppe <b id="grp-name"></b> bei.</p>
          <p class="muted">Die Gruppenleitung sieht deinen Namen, deine E-Mail-Adresse und deine gespeicherten Ergebnisse (Prüfungen und Übungen mit Datum und Punktzahl, auch frühere). Andere Teilnehmer sehen nichts davon. Du kannst die Gruppe jederzeit verlassen.</p>
          <label class="check"><input type="checkbox" id="grp-agree"> Ich habe das gelesen und bin einverstanden.</label>
          <div class="row" style="margin-top:12px"><button type="button" id="grp-back">Zurück</button><button type="button" class="primary" id="grp-join-btn" disabled>Beitreten</button></div>
        </div>
        <p class="form-error" id="grp-error" role="alert"></p>
      </section>
    </div>
    <section class="groups-section">
      <h2>Meine Gruppen</h2>
      <div id="grp-list" aria-live="polite"><p class="muted">Wird geladen …</p></div>
    </section>
    <section class="groups-section">
      <h2>Von mir erstellt</h2>
      <div id="grp-owned" aria-live="polite"><p class="muted">Wird geladen …</p></div>
    </section>`;

  const $ = (id) => document.getElementById(id);
  const showError = (id, message = '') => { $(id).textContent = message; };
  let pendingCode = '';

  $('groups-home').onclick = goHome;

  const renderGroups = (groups) => {
    $('grp-list').innerHTML = groups.length
      ? `<ul class="grp-list">${groups.map((group) => `<li><span>${esc(group.name)}</span><button type="button" class="small" data-leave="${esc(group.id)}">Verlassen</button></li>`).join('')}</ul>`
      : '<p class="muted">Du bist noch keiner Gruppe beigetreten.</p>';
    $('grp-list').querySelectorAll('[data-leave]').forEach((button) => (button.onclick = async () => {
      if (!confirm('Gruppe wirklich verlassen? Die Gruppenleitung sieht deine Ergebnisse danach nicht mehr.')) return;
      const result = await G.leaveGroup(button.dataset.leave);
      if (result.ok) { showError('grp-error'); renderGroups(result.data.groups); }
      else showError('grp-error', G.errorText(result));
    }));
  };

  const renderOwnedGroups = (groups) => {
    $('grp-owned').innerHTML = groups.length
      ? `<ul class="grp-list">${groups.map((group) => `<li><span>${esc(group.name)} <span class="muted small-text">${group.members} Mitglieder · ${esc(group.code)}</span></span><span class="row"><button type="button" class="small" data-copy="${esc(group.code)}">Code kopieren</button><button type="button" class="small" data-statistics="${esc(group.id)}">Statistik</button></span></li>`).join('')}</ul>`
      : '<p class="muted">Du hast noch keine Gruppe erstellt.</p>';
    $('grp-owned').querySelectorAll('[data-statistics]').forEach((button) => (button.onclick = () => onOpenGroup?.(button.dataset.statistics)));
    $('grp-owned').querySelectorAll('[data-copy]').forEach((button) => (button.onclick = async () => {
      try { await navigator.clipboard.writeText(button.dataset.copy); button.textContent = 'Kopiert'; }
      catch { prompt('Beitrittscode:', button.dataset.copy); }
    }));
  };

  const refreshGroups = async () => {
    const account = await G.getAccount();
    if (!account) {
      $('grp-list').innerHTML = '<p class="form-error">Gruppen konnten nicht geladen werden.</p>';
      $('grp-owned').innerHTML = '';
      return;
    }
    renderGroups(account.groups);
    renderOwnedGroups(account.createdGroups ?? []);
  };

  $('grp-create-btn').onclick = async () => {
    const name = $('grp-new-name').value.trim();
    showError('grp-create-error');
    if (!name) { showError('grp-create-error', 'Bitte einen Gruppennamen eingeben.'); return; }
    $('grp-create-btn').disabled = true;
    const result = await G.createGroup(name);
    $('grp-create-btn').disabled = false;
    if (!result.ok) { showError('grp-create-error', G.errorText(result)); return; }
    $('grp-new-name').value = '';
    $('grp-created').innerHTML = `<p>Gruppe „${esc(result.data.group.name)}“ erstellt. Teile diesen Beitrittscode:</p>
      <p><code>${esc(result.data.group.code)}</code> <button type="button" class="small" id="grp-created-copy">Kopieren</button></p>`;
    $('grp-created-copy').onclick = async () => {
      try { await navigator.clipboard.writeText(result.data.group.code); $('grp-created-copy').textContent = 'Kopiert'; }
      catch { prompt('Beitrittscode:', result.data.group.code); }
    };
    await refreshGroups();
  };
  $('grp-new-name').addEventListener('keydown', (event) => { if (event.key === 'Enter') $('grp-create-btn').click(); });

  const showJoin = () => {
    $('grp-consent').hidden = true;
    $('grp-join').hidden = false;
    $('grp-agree').checked = false;
    $('grp-join-btn').disabled = true;
  };
  $('grp-check').onclick = async () => {
    showError('grp-error');
    const code = $('grp-code').value.trim();
    if (!code) { showError('grp-error', 'Bitte den Code eingeben.'); return; }
    $('grp-check').disabled = true;
    const result = await G.previewGroup(code);
    $('grp-check').disabled = false;
    if (!result.ok) { showError('grp-error', G.errorText(result)); return; }
    pendingCode = code;
    $('grp-name').textContent = `„${result.data.group.name}“`;
    $('grp-join').hidden = true;
    $('grp-consent').hidden = false;
    $('grp-agree').focus();
  };
  $('grp-code').addEventListener('keydown', (event) => { if (event.key === 'Enter') $('grp-check').click(); });
  $('grp-agree').onchange = () => { $('grp-join-btn').disabled = !$('grp-agree').checked; };
  $('grp-back').onclick = () => { showError('grp-error'); showJoin(); };
  $('grp-join-btn').onclick = async () => {
    $('grp-join-btn').disabled = true;
    const result = await G.joinGroup(pendingCode);
    if (!result.ok) { showError('grp-error', G.errorText(result)); $('grp-join-btn').disabled = false; return; }
    showError('grp-error');
    $('grp-code').value = '';
    showJoin();
    await refreshGroups();
  };

  refreshGroups();
}