// Kleine gemeinsame UI-Bausteine der Lerngruppen-Seiten: Symbole, Code zum Kopieren, Dropdown-Menü.
export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

const svg = (body) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
export const ICON = {
  eye: svg('<path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z"/><circle cx="12" cy="12" r="3"/>'),
  chart: svg('<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>'),
  download: svg('<path d="M12 3v12"/><path d="M7 11l5 5 5-5"/><path d="M4 20h16"/>'),
};

/** Code als fetter Text: Klick kopiert ihn sofort (mit kurzer Rückmeldung). */
export const codeButton = (code) => `<button type="button" class="code-copy" data-code="${esc(code)}" title="Zum Kopieren klicken" aria-label="Beitrittscode ${esc(code)} kopieren"><b>${esc(code)}</b><span class="code-copy-hint" aria-live="polite"></span></button>`;

export function bindCodeButtons(root) {
  root.querySelectorAll('.code-copy').forEach((button) => (button.onclick = async () => {
    const hint = button.querySelector('.code-copy-hint');
    try { await navigator.clipboard.writeText(button.dataset.code); } catch { prompt('Beitrittscode:', button.dataset.code); return; }
    hint.textContent = 'Kopiert ✓';
    clearTimeout(button._t);
    button._t = setTimeout(() => { hint.textContent = ''; }, 1500);
  }));
}

/** Symbol-Button, der ein kleines Menü öffnet. items: [{ label, href?, download? }] */
export const menuButton = (id, icon, label, items) => `<span class="menu-wrap"><button type="button" class="icon-btn" id="${id}" aria-haspopup="true" aria-expanded="false" aria-label="${esc(label)}" title="${esc(label)}">${icon}</button>
  <nav class="pop-menu" id="${id}-menu" aria-label="${esc(label)}" hidden>${items.map((item) => `<a href="${esc(item.href)}"${item.download ? ' download' : ''}>${esc(item.label)}</a>`).join('')}</nav></span>`;

export function bindMenuButton(id) {
  const button = document.getElementById(id);
  const menu = document.getElementById(`${id}-menu`);
  if (!button || !menu) return;
  const close = () => { menu.hidden = true; button.setAttribute('aria-expanded', 'false'); };
  button.onclick = (event) => { event.stopPropagation(); menu.hidden = !menu.hidden; button.setAttribute('aria-expanded', String(!menu.hidden)); };
  menu.onclick = close;
  document.addEventListener('click', (event) => { if (!event.target.closest(`#${id}-menu`)) close(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
}