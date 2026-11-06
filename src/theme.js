// Darstellung: automatisch (Systemeinstellung), hell oder dunkel. Die Wahl wird nur auf diesem Gerät gespeichert.
// Die HTML-Seiten setzen data-theme bereits im <head> (kein Aufblitzen); hier steht die gemeinsame Logik.
const KEY = 'testas-theme';
export const THEMES = ['auto', 'light', 'dark'];

export function getTheme() {
  try { const value = localStorage.getItem(KEY); return value === 'light' || value === 'dark' ? value : 'auto'; } catch { return 'auto'; }
}

export function applyTheme(theme = getTheme()) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme; else delete root.dataset.theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const light = theme === 'light' || (theme === 'auto' && window.matchMedia?.('(prefers-color-scheme: light)').matches);
    meta.setAttribute('content', light ? '#f7f6f3' : '#0b0b0c');
  }
}

export function setTheme(theme) {
  try { if (theme === 'light' || theme === 'dark') localStorage.setItem(KEY, theme); else localStorage.removeItem(KEY); } catch { /* privater Modus o. Ä. */ }
  applyTheme(theme);
}

window.matchMedia?.('(prefers-color-scheme: light)').addEventListener?.('change', () => applyTheme());
