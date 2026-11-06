// Profil-Symbol mit Menü im Seitenkopf (Unterseiten). Die Startseite zeichnet dasselbe Markup selbst (app.js).
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

export function profileAvatar(person) {
  const palettes = [['#e6430f', '#fff'], ['#13794a', '#fff'], ['#0b63ce', '#fff'], ['#a55f00', '#fff']];
  const identity = person.name || person.email || person.id || '?';
  const hash = [...identity].reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 7);
  const [background, foreground] = palettes[hash % palettes.length];
  const initials = identity.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  return `<svg class="profile-avatar" viewBox="0 0 40 40" role="img" aria-label="${esc(`Profilbild von ${identity}`)}">
    <rect width="40" height="40" rx="20" fill="${background}"/><path d="M0 25 25 0h8L8 40H0zM23 40l17-17v8L31 40z" fill="${foreground}" opacity=".14"/>
    <text x="20" y="23" text-anchor="middle" dominant-baseline="middle" fill="${foreground}">${esc(initials)}</text>
  </svg>`;
}

export function renderProfileControl(slot, user, { isAdmin = false } = {}) {
  slot.innerHTML = `<div class="profile-control">
    <button type="button" class="profile-trigger" id="profile-trigger" aria-expanded="false" aria-controls="profile-menu" aria-label="Profilmenü öffnen">
      ${profileAvatar(user)}<span class="profile-name">${esc(user.name || user.email)}</span><span class="profile-chevron" aria-hidden="true">⌄</span>
    </button>
    <nav class="profile-menu" id="profile-menu" aria-label="Profilmenü" hidden>
      <a href="./#kontoinformationen">Kontoinformationen</a>
      <a href="./#einstellungen">Einstellungen</a>
      ${isAdmin ? '<a href="./#admin">Admin-Dashboard</a>' : ''}
    </nav>
  </div>`;
  const menu = slot.querySelector('#profile-menu');
  const trigger = slot.querySelector('#profile-trigger');
  const close = () => { menu.hidden = true; trigger.setAttribute('aria-expanded', 'false'); };
  trigger.onclick = () => { menu.hidden = !menu.hidden; trigger.setAttribute('aria-expanded', String(!menu.hidden)); };
  document.addEventListener('click', (event) => { if (!event.target.closest('.profile-control')) close(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
}