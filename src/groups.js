// Client für Lerngruppen: Konto-Infos, Beitritt per Code, Admin-Ansicht (/api/account, /api/groups/*, /api/admin/*).
import { call, post } from './auth.js';

const safe = async (fn) => {
  try { return await fn(); } catch { return { ok: false, status: 0, data: undefined }; }
};
const id = encodeURIComponent;

export const getAccount = async () => {
  const r = await safe(() => call('/api/account'));
  return r.ok ? r.data : null;
};
export const previewGroup = (code) => safe(() => post('/api/groups/preview', { code }));
export const joinGroup = (code) => safe(() => post('/api/groups/join', { code, consent: true }));
export const leaveGroup = (groupId) => safe(() => post('/api/groups/leave', { groupId }));

export const adminGroups = () => safe(() => call('/api/admin/groups'));
export const adminCreate = (name) => safe(() => post('/api/admin/groups', { name }));
export const adminGroup = (gid) => safe(() => call(`/api/admin/groups/${id(gid)}`));
export const adminDeleteGroup = (gid) => safe(() => call(`/api/admin/groups/${id(gid)}`, { method: 'DELETE' }));
export const adminMember = (gid, uid) => safe(() => call(`/api/admin/groups/${id(gid)}/members/${id(uid)}`));
export const adminRemoveMember = (gid, uid) => safe(() => call(`/api/admin/groups/${id(gid)}/members/${id(uid)}`, { method: 'DELETE' }));
export const exportUrl = (gid, kind) => `/api/admin/groups/${id(gid)}/export?kind=${kind}`;

export const errorText = (r) => ({
  not_found: 'Diesen Code gibt es nicht. Bitte noch einmal prüfen.',
  rate_limit: 'Zu viele falsche Codes. Bitte in ein paar Minuten erneut versuchen.',
  unauthorized: 'Bitte erneut anmelden.',
  forbidden: 'Dafür fehlt die Berechtigung.',
  consent_required: 'Bitte der Weitergabe zustimmen.',
}[r.data?.error] ?? (r.status === 0 ? 'Server nicht erreichbar.' : `Das hat nicht geklappt (Fehler ${r.status}).`));
