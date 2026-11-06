// Unterseite „Lerngruppen“ (gruppen.html): Gruppenübersicht (#), Gruppenseite mit Tests (#<Gruppen-ID>).
import * as Auth from './src/auth.js';
import { renderGroupsPage } from './src/groups-ui.js';
import { renderGroupPage } from './src/group-page.js';
import { renderAdmin } from './src/admin.js';

const app = document.getElementById('app');
const ID = /^[\w-]{1,64}$/;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let user = null;
let screen = '';
let cleanup = null;

function setScreen(name) {
  const changed = screen !== name;
  screen = name;
  document.body.dataset.screen = name;
  if (changed) window.scrollTo(0, 0);
}

// Ohne hashchange-Ereignis wechseln (pushState löst keines aus) und neu zeichnen
const go = (hash = '') => {
  history.pushState(null, '', location.pathname + (hash ? `#${hash}` : ''));
  route();
};

function renderMessage(html) {
  setScreen('groups');
  app.innerHTML = `<h1>Lerngruppen</h1><section class="card">${html}</section>`;
}

function route() {
  cleanup?.();
  cleanup = null;
  if (!user) return;
  const groupId = decodeURIComponent(location.hash.slice(1));
  if (groupId && ID.test(groupId)) {
    const stats = (gid) => renderAdmin({ app, setScreen, goHome: () => go(gid), ownerMode: true, groupId: gid, homeLabel: 'Gruppe' });
    cleanup = renderGroupPage({ app, setScreen, groupId, goBack: () => go(), onStatistics: stats });
    return;
  }
  renderGroupsPage({
    app, setScreen, goHome: () => { location.href = './'; },
    onStatistics: (gid) => renderAdmin({ app, setScreen, goHome: () => go(), ownerMode: true, groupId: gid, homeLabel: 'Lerngruppen' }),
  });
}

window.addEventListener('hashchange', route);

const session = await Auth.getSession();
user = session.user;
const slot = document.getElementById('auth-slot');
if (user) slot.innerHTML = `<a class="auth-link" href="./">${esc(user.name || user.email)}</a>`;
if (!session.available) renderMessage('<p>Der Konto-Server ist nicht erreichbar. Lerngruppen brauchen eine Anmeldung.</p><p><a href="./">Zur Startseite</a></p>');
else if (!user) renderMessage('<p>Bitte melde dich an, um Lerngruppen zu nutzen.</p><p><a class="btn" href="./">Zur Startseite zum Anmelden</a></p>');
else route();
