// Gruppenseite (Unterseite „Lerngruppen“): Tests der Gruppe.
// Mitglieder sehen die geplanten Tests und starten sie ab der Startzeit; die Gruppenleitung plant Tests und wertet sie aus.
import * as G from './groups.js';
import { TYPES, EXAM } from './tasks.js';
import { esc, ICON, codeButton, bindCodeButtons } from './ui.js';

const kindLabel = (kind) => (kind === 'all' ? 'Kernmodul (alle drei Subtests)' : TYPES[kind]?.label ?? kind);
const fmtDate = (ms) => new Date(ms).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
const fmtTime = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
const pctText = (value) => (value == null ? '–' : `${String(value).replace('.', ',')} %`);
// Wert für <input type="datetime-local"> (lokale Zeit)
const localInput = (ms) => new Date(ms - new Date(ms).getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const POLL_MS = 30_000;

/** Zeichnet die Gruppenseite. Gibt eine Aufräumfunktion zurück (stoppt das Nachladen). */
export function renderGroupPage({ app, setScreen, groupId, goBack, onStatistics }) {
  setScreen('groups');
  app.innerHTML = `
    <div class="row" style="margin-top:14px"><button type="button" id="gp-back">‹ Lerngruppen</button></div>
    <div id="gp-body"><p class="muted">Wird geladen …</p></div>`;

  const $ = (id) => document.getElementById(id);
  $('gp-back').onclick = goBack;
  let alive = true;
  let timer = null;
  let shellFor = null;
  const stop = () => { alive = false; clearInterval(timer); };

  const testCard = (test, data) => {
    const owner = data.role === 'owner';
    const result = test.result;
    const complete = !owner && test.released && result?.complete;
    const [badge, cls] = !test.released ? ['Geplant', ''] : complete ? ['Abgeschlossen', 'ok'] : ['Verfügbar', 'ok'];
    const meta = `${esc(kindLabel(test.kind))} · ${test.minutes} Minuten pro Subtest · ab ${esc(fmtDate(test.startsAt))}${owner ? ` · Seed ${test.seed}` : ''}`;
    let inner;
    if (owner) {
      inner = `<p class="muted test-meta">${test.released ? `${test.completed} von ${data.members} Mitgliedern haben abgeschlossen.` : 'Die Mitglieder sehen den Test erst ab der Startzeit.'}</p>
        <div class="test-actions"><button type="button" class="small" data-results="${esc(test.id)}">Ergebnisse</button><button type="button" class="small" data-delete="${esc(test.id)}">Löschen</button></div>
        <div class="test-results" id="gt-res-${esc(test.id)}" hidden></div>`;
    } else if (!test.released) {
      inner = '<p class="muted test-meta">Die Aufgaben werden zur Startzeit freigeschaltet. Diese Seite aktualisiert sich automatisch.</p>';
    } else {
      const progress = result.done > 0
        ? `<p class="test-meta">Dein Ergebnis: <b>${result.correct} / ${result.total}</b> (${pctText(result.percent)})${result.complete ? '' : ` · ${result.done} von ${result.expected} Subtests`}</p>` : '';
      inner = `${progress}<p class="muted small-text test-meta">Es zählt dein erster Versuch ab der Startzeit.</p>
        <div class="test-actions"><button type="button" class="${complete ? '' : 'primary '}small" data-start="${esc(test.id)}">${complete ? 'Erneut üben' : result.done > 0 ? 'Weiter / starten' : 'Test starten'}</button></div>`;
    }
    return `<article class="card test-card"><div class="test-head"><h3>${esc(test.title)}</h3><span class="badge ${cls}">${badge}</span></div>
      <p class="muted test-meta">${meta}</p>${inner}</article>`;
  };

  const resultsTable = (details) => `<table><thead><tr><th>Name</th><th>Subtests</th><th>Ergebnis</th><th>Zeit</th></tr></thead><tbody>${details.members.map((m) => `<tr>
      <td>${esc(m.name)}</td><td>${m.result.done} / ${m.result.expected}</td>
      <td>${m.result.done ? `${m.result.correct} / ${m.result.total} (${pctText(m.result.percent)})` : '–'}</td>
      <td>${m.result.done ? fmtTime(m.result.seconds) : '–'}</td></tr>`).join('')}</tbody></table>`;

  const drawTests = (data) => {
    const box = $('gp-tests');
    if (!box) return;
    box.innerHTML = data.tests.length ? data.tests.map((test) => testCard(test, data)).join('')
      : `<p class="muted">${data.role === 'owner' ? 'Du hast noch keinen Test geplant.' : 'Die Gruppenleitung hat noch keinen Test geplant.'}</p>`;
    box.querySelectorAll('[data-start]').forEach((button) => (button.onclick = () => {
      location.href = `./?gruppentest=${encodeURIComponent(groupId)}~${encodeURIComponent(button.dataset.start)}`;
    }));
    box.querySelectorAll('[data-delete]').forEach((button) => (button.onclick = async () => {
      if (!confirm('Test wirklich löschen? Die Ergebnisse der Mitglieder bleiben in ihrem Verlauf erhalten.')) return;
      const result = await G.deleteTest(groupId, button.dataset.delete);
      if (result.ok) load(); else alert(G.errorText(result));
    }));
    box.querySelectorAll('[data-results]').forEach((button) => (button.onclick = async () => {
      const target = $(`gt-res-${button.dataset.results}`);
      if (!target.hidden) { target.hidden = true; return; }
      target.hidden = false;
      target.innerHTML = '<p class="muted">Wird geladen …</p>';
      const result = await G.testDetails(groupId, button.dataset.results);
      target.innerHTML = result.ok ? resultsTable(result.data) : `<p class="form-error" role="alert">${esc(G.errorText(result))}</p>`;
    }));
    // Mitglieder: solange ein Test noch nicht freigegeben ist, regelmäßig nachsehen (Freigabe entscheidet der Server)
    clearInterval(timer);
    if (data.role === 'member' && data.tests.some((test) => !test.released)) timer = setInterval(load, POLL_MS);
  };

  const drawShell = (data) => {
    const owner = data.role === 'owner';
    $('gp-body').innerHTML = `
      <h1>${esc(data.group.name)}</h1>
      ${owner
        ? `<p class="lead muted group-meta">${data.members} ${data.members === 1 ? 'Mitglied' : 'Mitglieder'} · Beitrittscode ${codeButton(data.group.code)}<button type="button" class="icon-btn" id="gp-stats" aria-label="Statistik ansehen" title="Statistik">${ICON.chart}</button></p>
           <section class="card">
             <h2>Test planen</h2>
             <p class="muted">Der Test erscheint für alle Mitglieder zur gewählten Startzeit hier unter der Gruppe. Davor sehen sie nur Titel und Zeitpunkt, nicht die Aufgaben.</p>
             <div class="grid">
               <div><label for="gt-title">Titel</label><input id="gt-title" type="text" maxlength="80" placeholder="z. B. Probeprüfung 1"></div>
               <div><label for="gt-kind">Umfang</label><select id="gt-kind">
                 <option value="all">Kernmodul (alle drei Subtests)</option>
                 <option value="figural">Nur Figurale Sequenzen</option>
                 <option value="gleichungen">Nur Mathematische Gleichungen</option>
                 <option value="quadrate">Nur Lateinische Quadrate</option>
               </select></div>
               <div><label for="gt-minutes">Zeit pro Subtest (Minuten)</label><input id="gt-minutes" type="number" min="1" max="120" step="1" value="${EXAM.minutes}"></div>
               <div><label for="gt-start">Startzeit</label><input id="gt-start" type="datetime-local" value="${localInput(Date.now() + 3_600_000)}"></div>
             </div>
             <p class="form-error" id="gt-error" role="alert"></p>
             <p><button type="button" class="primary" id="gt-create">Test planen</button></p>
           </section>`
        : `<p class="lead muted">Du bist Mitglied dieser Gruppe. Neue Tests der Gruppenleitung erscheinen hier.</p>`}
      <section class="groups-section"><h2>Tests</h2><div id="gp-tests" aria-live="polite"></div></section>
      ${owner ? '' : '<p><button type="button" class="small" id="gp-leave">Gruppe verlassen</button></p>'}`;

    if (owner) {
      $('gp-stats').onclick = () => onStatistics?.(groupId);
      bindCodeButtons($('gp-body'));
      $('gt-create').onclick = async () => {
        const startsAt = new Date($('gt-start').value).getTime();
        $('gt-error').textContent = '';
        if (!$('gt-title').value.trim()) { $('gt-error').textContent = 'Bitte einen Titel eingeben.'; return; }
        if (!Number.isFinite(startsAt)) { $('gt-error').textContent = 'Bitte eine Startzeit wählen.'; return; }
        $('gt-create').disabled = true;
        const result = await G.createTest(groupId, {
          title: $('gt-title').value.trim(), kind: $('gt-kind').value, minutes: Number($('gt-minutes').value), startsAt,
        });
        $('gt-create').disabled = false;
        if (!result.ok) { $('gt-error').textContent = G.errorText(result); return; }
        $('gt-title').value = '';
        load();
      };
    } else {
      $('gp-leave').onclick = async () => {
        if (!confirm('Gruppe wirklich verlassen? Die Gruppenleitung sieht deine Ergebnisse danach nicht mehr.')) return;
        const result = await G.leaveGroup(groupId);
        if (result.ok) goBack(); else alert(G.errorText(result));
      };
    }
    shellFor = data.role;
  };

  async function load() {
    const result = await G.groupTests(groupId);
    if (!alive) return;
    if (!result.ok) {
      if (shellFor) return; // beim Nachladen den Stand nicht durch einen Fehler überschreiben
      $('gp-body').innerHTML = `<p class="form-error" role="alert">${esc(result.status === 403 || result.status === 404 ? 'Diese Gruppe gibt es nicht, oder du bist kein Mitglied.' : G.errorText(result))}</p>`;
      return;
    }
    if (shellFor !== result.data.role) drawShell(result.data);
    else if (result.data.role === 'owner') { // Mitgliederzahl aktuell halten
      const meta = document.querySelector('.group-meta');
      if (meta) meta.firstChild.textContent = `${result.data.members} ${result.data.members === 1 ? 'Mitglied' : 'Mitglieder'} · Beitrittscode `;
    }
    drawTests(result.data);
  }
  const known = G.cached(`tests:${groupId}`);
  if (known) { drawShell(known); drawTests(known); } // sofort anzeigen, im Hintergrund aktualisieren
  load();
  return stop;
}
