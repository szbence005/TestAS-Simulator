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
export function openAccountDialog(user) {
  document.getElementById('account-dialog')?.remove();
  const dlg = document.createElement('dialog');
  dlg.id = 'account-dialog';
  dlg.setAttribute('aria-label', 'Konto');
  dlg.innerHTML = `<div class="auth-form">
      <h2 style="margin-top:0">Konto</h2>
      <p class="muted">${esc(user.name)} · ${esc(user.email)}</p>
      <h3 style="margin-top:18px">Lerngruppen</h3>
      <div id="grp-list" aria-live="polite"><p class="muted">Wird geladen …</p></div>
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
  G.getAccount().then((a) => { if (a) renderGroups(a.groups); else $('grp-list').innerHTML = '<p class="muted">Gruppen konnten nicht geladen werden.</p>'; });
}

/* ------------------------------------------------------------------ Admin-Ansicht */
export function renderAdmin({ app, setScreen, goHome }) {
  setScreen('admin');
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
    header('Gruppen', 'Startseite', goHome);
    const r = await G.adminGroups();
    if (!r.ok) return fail(r, goHome);
    const groups = r.data.groups;
    body().innerHTML = `
      <div class="card"><label for="gname" style="margin-top:0">Neue Gruppe</label>
        <div class="row nowrap"><input id="gname" type="text" maxlength="80" placeholder="z. B. TestAS 2026 Frühling"><button class="primary" id="gcreate">Erstellen</button></div>
        <p class="form-note">Der Beitrittscode wird automatisch vergeben.</p><p class="form-error" id="gerr" role="alert"></p></div>
      ${groups.length ? `<div class="card table-wrap"><table><thead><tr><th>Gruppe</th><th>Code</th><th>Mitglieder</th><th>Erstellt</th><th></th></tr></thead><tbody>
        ${groups.map((g) => `<tr><td><button class="link" data-open="${esc(g.id)}">${esc(g.name)}</button></td>
          <td><code>${esc(g.code)}</code> <button class="small" data-copy="${esc(g.code)}">Kopieren</button></td>
          <td>${g.members}</td><td>${day(g.createdAt)}</td><td><button class="small" data-open="${esc(g.id)}">Öffnen</button></td></tr>`).join('')}
        </tbody></table></div>` : '<p class="lead muted">Noch keine Gruppe – legen Sie die erste an.</p>'}`;
    body().querySelectorAll('[data-open]').forEach((b) => (b.onclick = () => showGroup(b.dataset.open)));
    body().querySelectorAll('[data-copy]').forEach((b) => copy(b, b.dataset.copy));
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
    header('Gruppe', 'Alle Gruppen', showList);
    const r = await G.adminGroup(gid);
    if (!r.ok) return fail(r, showList);
    const { group, members } = r.data;
    document.querySelector('#app h1').textContent = group.name;
    body().innerHTML = `
      <div class="row" style="margin-bottom:10px">
        <span>Beitrittscode: <code class="code">${esc(group.code)}</code></span><button class="small" id="copy">Kopieren</button>
        <span class="grow"></span>
        <a class="btn small" href="${G.exportUrl(gid, 'summary')}" download>Übersicht (CSV)</a>
        <a class="btn small" href="${G.exportUrl(gid, 'raw')}" download>Alle Ergebnisse (CSV)</a>
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
      const d = await G.adminDeleteGroup(gid);
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

  async function showMember(gid, groupName, uid) {
    header('Teilnehmer', groupName, () => showGroup(gid));
    const r = await G.adminMember(gid, uid);
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
      const d = await G.adminRemoveMember(gid, uid);
      if (d.ok) showGroup(gid); else fail(d, () => showGroup(gid));
    };
  }

  showList();
}
