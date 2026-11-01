// Oberfläche für Lerngruppen: Konto-Dialog (Gruppe beitreten/verlassen) und Admin-Ansicht (Gruppen, Mitglieder, Verlauf).
import * as G from './groups.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const dt = (ts) => new Date(ts).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
const day = (ts) => new Date(ts).toLocaleDateString('de-DE', { dateStyle: 'short' });
const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
const TYPE = { figural: 'Figurale Sequenzen', gleichungen: 'Mathematische Gleichungen', quadrate: 'Lateinische Quadrate' };
const SHORT = { figural: 'Figural', gleichungen: 'Gleichungen', quadrate: 'Quadrate' };
const TYPES = Object.keys(TYPE);

/* ------------------------------------------------------------------ Konto-Dialog (Teilnehmer) */
export function openAccountDialog(user, onOpenGroup) {
  document.getElementById('account-dialog')?.remove();
  const dlg = document.createElement('dialog');
  dlg.id = 'account-dialog';
  dlg.setAttribute('aria-label', 'Konto');
  dlg.innerHTML = `<div class="auth-form">
      <h2 style="margin-top:0">Konto</h2>
      <p class="muted">${esc(user.name)} · ${esc(user.email)}</p>
      <h3 style="margin-top:18px">Lerngruppen</h3>
      <div id="grp-list" aria-live="polite"><p class="muted">Wird geladen …</p></div>
      <div id="grp-owned" aria-live="polite"></div>
      <div style="margin-top:16px">
        <h3>Neue Gruppe</h3>
        <label for="grp-new-name">Gruppenname</label>
        <div class="row nowrap"><input id="grp-new-name" type="text" maxlength="80" placeholder="z. B. TestAS 2026 Frühling"><button type="button" class="primary" id="grp-create-btn">Erstellen</button></div>
        <p class="form-error" id="grp-create-error" role="alert"></p>
        <div id="grp-created" aria-live="polite"></div>
      </div>
      <div id="grp-join">
        <label for="grp-code">Gruppencode</label>
        <div class="row nowrap"><input id="grp-code" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX" maxlength="12">
          <button type="button" id="grp-check">Weiter</button></div>
      </div>
      <div id="grp-consent" hidden>
        <p>Sie treten der Gruppe <b id="grp-name"></b> bei.</p>
        <p class="muted">Die Gruppenleitung sieht dann Ihren Namen, Ihre E-Mail-Adresse und Ihre gespeicherten Ergebnisse
          (Prüfungen und Übungen mit Datum und Punktzahl, auch frühere). Andere Teilnehmer sehen nichts davon.
          Sie können die Gruppe jederzeit verlassen – danach hat die Leitung keinen Zugriff mehr.</p>
        <label class="check"><input type="checkbox" id="grp-agree"> Ich habe das gelesen und bin einverstanden.</label>
        <div class="row" style="margin-top:12px"><button type="button" id="grp-back">Zurück</button><button type="button" class="primary" id="grp-join-btn" disabled>Beitreten</button></div>
      </div>
      <p class="form-error" id="grp-error" role="alert"></p>
      <div class="row" style="margin-top:12px;justify-content:flex-end"><button type="button" id="grp-close">Schließen</button></div>
    </div>`;
  document.body.appendChild(dlg);
  const $ = (id) => dlg.querySelector(`#${id}`);
  const err = (m = '') => { $('grp-error').textContent = m; };
  let pendingCode = '';

  const create = async () => {
    const name = $('grp-new-name').value.trim();
    $('grp-create-error').textContent = '';
    if (!name) { $('grp-create-error').textContent = 'Bitte einen Namen eingeben.'; return; }
    $('grp-create-btn').disabled = true;
    const r = await G.createGroup(name);
    $('grp-create-btn').disabled = false;
    if (!r.ok) { $('grp-create-error').textContent = G.errorText(r); return; }
    const { group } = r.data;
    $('grp-new-name').value = '';
    $('grp-created').innerHTML = `<p>Gruppe „${esc(group.name)}“ erstellt. Teilen Sie diesen Beitrittscode:</p>
      <p><code>${esc(group.code)}</code> <button type="button" class="small" id="grp-created-copy">Kopieren</button></p>`;
    $('grp-created-copy').onclick = async () => {
      try { await navigator.clipboard.writeText(group.code); $('grp-created-copy').textContent = 'Kopiert'; }
      catch { prompt('Beitrittscode:', group.code); }
    };
    G.ownedGroups().then((owned) => { if (owned.ok) renderOwnedGroups(owned.data.groups); });
  };
  $('grp-create-btn').onclick = create;
  $('grp-new-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') create(); });

  const renderOwnedGroups = (groups) => {
    $('grp-owned').innerHTML = groups.length
      ? `<h3>Ihre Gruppen</h3><ul class="grp-list">${groups.map((g) => `<li><span>${esc(g.name)} <span class="muted small-text">${g.members} Mitglieder</span></span><button type="button" class="small" data-owned="${esc(g.id)}">Statistik</button></li>`).join('')}</ul>`
      : '';
    $('grp-owned').querySelectorAll('[data-owned]').forEach((b) => (b.onclick = () => {
      if (!onOpenGroup || onOpenGroup(b.dataset.owned) === false) return;
      dlg.close();
    }));
  };

  const renderGroups = (groups) => {
    $('grp-list').innerHTML = groups.length
      ? `<ul class="grp-list">${groups.map((g) => `<li><span>${esc(g.name)}</span><button type="button" class="small" data-leave="${esc(g.id)}">Verlassen</button></li>`).join('')}</ul>`
      : '<p class="muted">Sie sind in keiner Gruppe.</p>';
    $('grp-list').querySelectorAll('[data-leave]').forEach((b) => (b.onclick = async () => {
      if (!confirm('Gruppe wirklich verlassen? Die Leitung sieht Ihre Ergebnisse dann nicht mehr.')) return;
      const r = await G.leaveGroup(b.dataset.leave);
      if (r.ok) { err(); renderGroups(r.data.groups); } else err(G.errorText(r));
    }));
  };
  const showJoin = () => { $('grp-consent').hidden = true; $('grp-join').hidden = false; $('grp-agree').checked = false; $('grp-join-btn').disabled = true; $('grp-code').focus(); };

  $('grp-check').onclick = async () => {
    err();
    const code = $('grp-code').value.trim();
    if (!code) { err('Bitte den Code eingeben.'); return; }
    $('grp-check').disabled = true;
    const r = await G.previewGroup(code);
    $('grp-check').disabled = false;
    if (!r.ok) { err(G.errorText(r)); return; }
    pendingCode = code;
    $('grp-name').textContent = `„${r.data.group.name}“`;
    $('grp-join').hidden = true;
    $('grp-consent').hidden = false;
    $('grp-agree').focus();
  };
  $('grp-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('grp-check').click(); } });
  $('grp-agree').onchange = () => { $('grp-join-btn').disabled = !$('grp-agree').checked; };
  $('grp-back').onclick = () => { err(); showJoin(); };
  $('grp-join-btn').onclick = async () => {
    $('grp-join-btn').disabled = true;
    const r = await G.joinGroup(pendingCode);
    if (!r.ok) { err(G.errorText(r)); $('grp-join-btn').disabled = false; return; }
    err(); $('grp-code').value = ''; renderGroups(r.data.groups); showJoin();
  };
  $('grp-close').onclick = () => dlg.close();
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();
  G.getAccount().then((a) => {
    if (a) { renderGroups(a.groups); renderOwnedGroups(a.createdGroups ?? []); }
    else $('grp-list').innerHTML = '<p class="muted">Gruppen konnten nicht geladen werden.</p>';
  });
}

/* ------------------------------------------------------------------ Admin-Ansicht */
export function renderAdmin({ app, setScreen, goHome, ownerMode = false, groupId = null }) {
  setScreen('admin');
  const groupList = () => ownerMode ? G.ownedGroups() : G.adminGroups();
  const groupDetails = (id) => ownerMode ? G.ownedGroup(id) : G.adminGroup(id);
  const deleteGroup = (id) => ownerMode ? G.ownedDeleteGroup(id) : G.adminDeleteGroup(id);
  const memberDetails = (gid, uid) => ownerMode ? G.ownedMember(gid, uid) : G.adminMember(gid, uid);
  const removeMember = (gid, uid) => ownerMode ? G.ownedRemoveMember(gid, uid) : G.adminRemoveMember(gid, uid);
  const groupExportUrl = (gid, kind) => ownerMode ? G.ownedExportUrl(gid, kind) : G.exportUrl(gid, kind);
  const percentLabel = (value) => value == null ? '–' : `${String(value).replace('.', ',')} %`;
  const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const header = (title, backLabel, back, extra = '') => {
    app.innerHTML = `<div class="row spread" style="margin-top:14px"><button id="adm-back">‹ ${esc(backLabel)}</button>${extra}</div><h1>${esc(title)}</h1><div id="adm-body"><p class="muted">Wird geladen …</p></div>`;
    document.getElementById('adm-back').onclick = back;
  };
  const body = () => document.getElementById('adm-body');
  const fail = (r, back) => {
    body().innerHTML = `<p class="form-error" role="alert">${esc(G.errorText(r))}</p>`;
    if (r.status === 401 || r.status === 403) document.getElementById('adm-back').onclick = goHome; else document.getElementById('adm-back').onclick = back;
  };
  const copy = (btn, text) => btn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(text); btn.textContent = 'Kopiert'; setTimeout(() => (btn.textContent = 'Kopieren'), 1500); } catch { prompt('Code:', text); }
  });

  /* --- Gruppenliste */
  async function showList() {
    header(ownerMode ? 'Eigene Gruppen' : 'Gruppen', 'Startseite', goHome,
      ownerMode ? '' : '<button type="button" class="small" id="adm-overview">Systemübersicht</button>');
    if (!ownerMode) document.getElementById('adm-overview').onclick = showOverview;
    const r = await groupList();
    if (!r.ok) return fail(r, goHome);
    const groups = r.data.groups;
    body().innerHTML = `
      ${ownerMode ? '' : `<div class="card"><label for="gname" style="margin-top:0">Neue Gruppe</label>
        <div class="row nowrap"><input id="gname" type="text" maxlength="80" placeholder="z. B. TestAS 2026 Frühling"><button class="primary" id="gcreate">Erstellen</button></div>
        <p class="form-note">Der Beitrittscode wird automatisch vergeben.</p><p class="form-error" id="gerr" role="alert"></p></div>`}
      ${groups.length ? `<div class="card table-wrap"><table><thead><tr><th>Gruppe</th><th>Code</th><th>Mitglieder</th><th>Erstellt</th><th></th></tr></thead><tbody>
        ${groups.map((g) => `<tr><td><button class="link" data-open="${esc(g.id)}">${esc(g.name)}</button></td>
          <td><code>${esc(g.code)}</code> <button class="small" data-copy="${esc(g.code)}">Kopieren</button></td>
          <td>${g.members}</td><td>${day(g.createdAt)}</td><td><button class="small" data-open="${esc(g.id)}">Öffnen</button></td></tr>`).join('')}
        </tbody></table></div>` : ownerMode ? '<p class="lead muted">Sie haben noch keine Gruppe erstellt.</p>' : '<p class="lead muted">Noch keine Gruppe – legen Sie die erste an.</p>'}`;
    body().querySelectorAll('[data-open]').forEach((b) => (b.onclick = () => showGroup(b.dataset.open)));
    body().querySelectorAll('[data-copy]').forEach((b) => copy(b, b.dataset.copy));
    if (ownerMode) return;
    const create = async () => {
      const name = document.getElementById('gname').value.trim();
      if (!name) { document.getElementById('gerr').textContent = 'Bitte einen Namen eingeben.'; return; }
      const c = await G.adminCreate(name);
      if (!c.ok) { document.getElementById('gerr').textContent = G.errorText(c); return; }
      showGroup(c.data.group.id);
    };
    document.getElementById('gcreate').onclick = create;
    document.getElementById('gname').addEventListener('keydown', (e) => { if (e.key === 'Enter') create(); });
  }

  /* --- Mitgliedertabelle einer Gruppe */
  const pctCell = (m, t) => {
    const e = m.exam[t]; const p = m.practice[t];
    if (e == null && p == null) return '<span class="muted">–</span>';
    return `${e == null ? '<span class="muted">–</span>' : `${Math.round(e)} %`}${p == null ? '' : ` <span class="muted">(Üb. ${Math.round(p)} %)</span>`}`;
  };
  const trendCell = (t) => {
    if (!t) return '<span class="muted" title="Trend ab 4 Ergebnissen">–</span>';
    const sym = { up: '↗', down: '↘', flat: '→' }[t.dir];
    const label = { up: 'steigend', down: 'fallend', flat: 'gleichbleibend' }[t.dir];
    return `<span class="trend ${t.dir}" title="${t.delta > 0 ? '+' : ''}${String(t.delta).replace('.', ',')} Prozentpunkte" aria-label="${label}">${sym}</span>`;
  };

  async function showGroup(gid) {
    header('Gruppe', ownerMode ? 'Eigene Gruppen' : 'Alle Gruppen', showList);
    const r = await groupDetails(gid);
    if (!r.ok) return fail(r, showList);
    const { group, members } = r.data;
    document.querySelector('#app h1').textContent = group.name;
    body().innerHTML = `
      <div class="row" style="margin-bottom:10px">
        <span>Beitrittscode: <code class="code">${esc(group.code)}</code></span><button class="small" id="copy">Kopieren</button>
        <span class="grow"></span>
        <a class="btn small" href="${groupExportUrl(gid, 'summary')}" download>Übersicht (CSV)</a>
        <a class="btn small" href="${groupExportUrl(gid, 'raw')}" download>Alle Ergebnisse (CSV)</a>
        <button class="small danger" id="del">Gruppe löschen</button>
      </div>
      ${members.length ? `<div class="card table-wrap"><table><thead><tr><th>Name</th><th>Prüf.</th><th>Üb.</th>
        ${TYPES.map((t) => `<th>${SHORT[t]} Ø</th>`).join('')}<th>Zuletzt aktiv</th><th>Trend</th></tr></thead><tbody>
        ${members.map((m) => `<tr><td><button class="link" data-m="${esc(m.id)}">${esc(m.name)}</button><div class="muted small-text">${esc(m.email)}</div></td>
          <td>${m.exams}</td><td>${m.practices}</td>${TYPES.map((t) => `<td>${pctCell(m, t)}</td>`).join('')}
          <td>${m.last ? day(m.last) : '<span class="muted">–</span>'}</td><td>${trendCell(m.trend)}</td></tr>`).join('')}
        </tbody></table></div>
        <p class="muted">Prüf. = Anzahl Prüfungen (ein komplettes Kernmodul zählt einmal), Üb. = Übungssitzungen. Ø = Durchschnitt der Prüfungsergebnisse je Subtest, in Klammern der Durchschnitt der Übungen.
        Trend: letzte Ergebnisse gegenüber den davor (ab 4 Ergebnissen; ±3 Prozentpunkte gelten als Veränderung). Es erscheinen nur Teilnehmer, die angemeldet waren und der Gruppe beigetreten sind.</p>`
        : '<p class="lead muted">Noch keine Mitglieder. Teilen Sie den Code – Teilnehmer geben ihn im Konto-Menü ein.</p>'}`;
    copy(document.getElementById('copy'), group.code);
    document.getElementById('del').onclick = async () => {
      if (!confirm(`Gruppe „${group.name}“ löschen? Alle Mitglieder verlieren die Zuordnung (ihre Ergebnisse bleiben in ihren Konten).`)) return;
      const d = await deleteGroup(gid);
      if (d.ok) showList(); else fail(d, showList);
    };
    body().querySelectorAll('[data-m]').forEach((b) => (b.onclick = () => showMember(gid, group.name, b.dataset.m)));
  }

  /* --- Verlauf eines Teilnehmers */
  const DASH = { figural: '', gleichungen: '6 4', quadrate: '2 4' };
  const COLOR = { figural: 'var(--accent)', gleichungen: 'var(--ok)', quadrate: 'var(--focus)' };

  function chartSVG(entries) {
    const W = 640; const H = 240; const L = 40; const R = 14; const T = 12; const B = 28;
    const t0 = entries[0].ts; const span = entries.at(-1).ts - t0;
    const x = (ts) => L + (span ? (ts - t0) / span : 0.5) * (W - L - R);
    const y = (p) => T + (1 - p / 100) * (H - T - B);
    const grid = [0, 25, 50, 75, 100].map((p) => `<line class="gl" x1="${L}" x2="${W - R}" y1="${y(p)}" y2="${y(p)}"/><text x="${L - 6}" y="${y(p) + 4}" text-anchor="end">${p}</text>`).join('');
    const series = TYPES.map((t) => {
      const es = entries.filter((e) => e.type === t);
      if (!es.length) return '';
      const line = es.length > 1 ? `<polyline fill="none" stroke="${COLOR[t]}" stroke-width="2" stroke-dasharray="${DASH[t]}" points="${es.map((e) => `${x(e.ts).toFixed(1)},${y(e.percent).toFixed(1)}`).join(' ')}"/>` : '';
      const dots = es.map((e) => (e.mode === 'exam'
        ? `<circle cx="${x(e.ts).toFixed(1)}" cy="${y(e.percent).toFixed(1)}" r="4.5" fill="${COLOR[t]}"><title>${esc(SHORT[t])}, Prüfung: ${e.correct}/${e.total} (${dt(e.ts)})</title></circle>`
        : `<circle cx="${x(e.ts).toFixed(1)}" cy="${y(e.percent).toFixed(1)}" r="4" fill="var(--surface)" stroke="${COLOR[t]}" stroke-width="2"><title>${esc(SHORT[t])}, Übung: ${e.correct}/${e.total} (${dt(e.ts)})</title></circle>`)).join('');
      return line + dots;
    }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Ergebnisse in Prozent über die Zeit">${grid}
      <text x="${L}" y="${H - 8}">${day(t0)}</text><text x="${W - R}" y="${H - 8}" text-anchor="end">${day(t0 + span)}</text>${series}</svg>
      <div class="legend">${TYPES.map((t) => `<span><svg width="30" height="10" aria-hidden="true"><line x1="0" x2="30" y1="5" y2="5" stroke="${COLOR[t]}" stroke-width="2" stroke-dasharray="${DASH[t]}"/></svg> ${esc(TYPE[t])}</span>`).join('')}
        <span>● Prüfung</span><span>○ Übung</span></div>`;
  }

  async function showOverview() {
    header('Systemübersicht', 'Startseite', goHome, '<button type="button" class="small" id="adm-groups">Gruppenverwaltung</button>');
    document.getElementById('adm-groups').onclick = showList;
    const r = await G.adminOverview();
    if (!r.ok) return fail(r, goHome);
    const { system, users } = r.data;
    body().innerHTML = `
      <div class="stats">
        <div><span class="score">${system.users}</span><span class="muted">Registrierte Nutzer</span></div>
        <div><span class="score">${system.activeUsers}</span><span class="muted">Mit gespeicherten Ergebnissen</span></div>
        <div><span class="score">${system.exams}</span><span class="muted">Prüfungen</span></div>
        <div><span class="score">${system.practices}</span><span class="muted">Übungssitzungen</span></div>
        <div><span class="score">${percentLabel(system.examAverage)}</span><span class="muted">Prüfungsdurchschnitt</span></div>
        <div><span class="score">${percentLabel(system.practiceAverage)}</span><span class="muted">Übungsdurchschnitt</span></div>
        <div><span class="score">${system.lastActivity ? day(system.lastActivity) : '–'}</span><span class="muted">Letzte Aktivität</span></div>
      </div>
      <h2>Leistung nach Aufgabentyp</h2>
      <div class="card table-wrap"><table><thead><tr><th>Aufgabentyp</th><th>Prüfungen</th><th>Übungen</th></tr></thead><tbody>
        ${TYPES.map((type) => `<tr><td>${esc(TYPE[type])}</td><td>${percentLabel(system.performance.exam[type])}</td><td>${percentLabel(system.performance.practice[type])}</td></tr>`).join('')}
      </tbody></table></div>
      <h2>Nutzer</h2>
      <label for="admin-user-search">Nutzer suchen</label><input id="admin-user-search" type="search" placeholder="Name oder E-Mail">
      <div class="card table-wrap"><table><thead><tr><th>Name</th><th>E-Mail</th><th>Prüfungen</th><th>Ø Prüfung</th><th>Übungen</th><th>Ø Übung</th><th>Zuletzt aktiv</th></tr></thead><tbody>
        ${users.map((user) => `<tr data-admin-user data-search="${esc(`${user.name} ${user.email}`.toLowerCase())}">
          <td><button type="button" class="link" data-user="${esc(user.id)}">${esc(user.name)}</button></td><td>${esc(user.email)}</td>
          <td>${user.exams}</td><td>${percentLabel(user.examAverage)}</td><td>${user.practices}</td><td>${percentLabel(user.practiceAverage)}</td>
          <td>${user.last ? day(user.last) : '<span class="muted">–</span>'}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Keine Nutzer registriert.</td></tr>'}
      </tbody></table></div>`;
    document.getElementById('admin-user-search').oninput = (event) => {
      const query = event.target.value.trim().toLowerCase();
      body().querySelectorAll('[data-admin-user]').forEach((row) => { row.hidden = !row.dataset.search.includes(query); });
    };
    body().querySelectorAll('[data-user]').forEach((button) => (button.onclick = () => showUser(button.dataset.user)));
  }

  async function showUser(uid) {
    header('Nutzer', 'Systemübersicht', showOverview);
    const r = await G.adminUser(uid);
    if (!r.ok) return fail(r, showOverview);
    const { user, summary, entries } = r.data;
    document.querySelector('#app h1').textContent = user.name;
    const examAverage = mean(Object.values(summary.exam).filter((value) => value != null));
    const practiceAverage = mean(Object.values(summary.practice).filter((value) => value != null));
    const plotted = entries.filter((entry) => entry.percent != null);
    body().innerHTML = `
      <p class="muted">${esc(user.email)}</p>
      <div class="stats">
        <div><span class="score">${summary.exams}</span><span class="muted">Prüfungen</span></div>
        <div><span class="score">${summary.practices}</span><span class="muted">Übungen</span></div>
        <div><span class="score">${percentLabel(examAverage)}</span><span class="muted">Ø Prüfung</span></div>
        <div><span class="score">${percentLabel(practiceAverage)}</span><span class="muted">Ø Übung</span></div>
        <div><span class="score">${trendCell(summary.trend)}</span><span class="muted">Trend</span></div>
      </div>
      ${plotted.length ? `<div class="card">${chartSVG(plotted)}</div>` : '<p class="lead muted">Noch keine Ergebnisse.</p>'}
      ${entries.length ? `<div class="card table-wrap"><table><thead><tr><th>Datum</th><th>Modus</th><th>Typ</th><th>Ergebnis</th><th>%</th><th>Zeit</th><th>Seed</th></tr></thead><tbody>
        ${[...entries].reverse().map((entry) => `<tr><td>${esc(dt(entry.ts))}</td><td>${entry.mode === 'exam' ? 'Prüfung' : 'Übung'}</td><td>${esc(TYPE[entry.type] ?? entry.type)}</td>
          <td>${entry.correct}/${entry.total}</td><td>${percentLabel(entry.percent)}</td><td>${entry.seconds ? mmss(entry.seconds) : '–'}</td><td>${entry.seed ?? '–'}</td></tr>`).join('')}
        </tbody></table></div>` : ''}`;
  }

  async function showMember(gid, groupName, uid) {
    header('Teilnehmer', groupName, () => showGroup(gid));
    const r = await memberDetails(gid, uid);
    if (!r.ok) return fail(r, () => showGroup(gid));
    const { member: m, entries } = r.data;
    document.querySelector('#app h1').textContent = m.name;
    const plotted = entries.filter((e) => e.percent != null);
    body().innerHTML = `
      <p class="muted">${esc(m.email)} · beigetreten ${day(m.joinedAt)}</p>
      <div class="stats">
        <div><span class="score">${m.exams}</span><span class="muted">Prüfungen</span></div>
        <div><span class="score">${m.practices}</span><span class="muted">Übungen</span></div>
        <div><span class="score">${trendCell(m.trend)}</span><span class="muted">Trend</span></div>
      </div>
      ${plotted.length ? `<div class="card">${chartSVG(plotted)}</div>` : '<p class="lead muted">Noch keine Ergebnisse.</p>'}
      ${entries.length ? `<div class="card table-wrap"><table><thead><tr><th>Datum</th><th>Modus</th><th>Typ</th><th>Ergebnis</th><th>%</th><th>Zeit</th><th>Seed</th></tr></thead><tbody>
        ${[...entries].reverse().map((e) => `<tr><td>${esc(dt(e.ts))}</td><td>${e.mode === 'exam' ? 'Prüfung' : 'Übung'}</td><td>${esc(TYPE[e.type] ?? e.type)}</td>
          <td>${e.correct}/${e.total}</td><td>${e.percent == null ? '–' : `${Math.round(e.percent)} %`}</td><td>${e.seconds ? mmss(e.seconds) : '–'}</td><td>${e.seed ?? '–'}</td></tr>`).join('')}
        </tbody></table></div>` : ''}
      <p><button class="danger" id="rm">Aus der Gruppe entfernen</button></p>`;
    document.getElementById('rm').onclick = async () => {
      if (!confirm(`${m.name} aus der Gruppe entfernen? Die Ergebnisse bleiben im Konto der Person.`)) return;
      const d = await removeMember(gid, uid);
      if (d.ok) showGroup(gid); else fail(d, () => showGroup(gid));
    };
  }

  if (groupId) showGroup(groupId); else if (ownerMode) showList(); else showOverview();
}
