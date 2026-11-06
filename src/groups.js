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
export const createGroup = (name) => safe(() => post('/api/groups/create', { name }));
export const ownedGroups = () => safe(() => call('/api/groups/created'));
export const ownedGroup = (gid) => safe(() => call(`/api/groups/${id(gid)}`));
export const ownedDeleteGroup = (gid) => safe(() => call(`/api/groups/${id(gid)}`, { method: 'DELETE' }));
export const ownedMember = (gid, uid) => safe(() => call(`/api/groups/${id(gid)}/members/${id(uid)}`));
export const ownedRemoveMember = (gid, uid) => safe(() => call(`/api/groups/${id(gid)}/members/${id(uid)}`, { method: 'DELETE' }));
export const ownedExportUrl = (gid, kind) => `/api/groups/${id(gid)}/export?kind=${kind}`;
// Gruppentests: Mitglieder lesen die Liste, die Gruppenleitung plant/wertet aus/löscht
export const groupTests = (gid) => safe(() => call(`/api/groups/${id(gid)}/tests`));
export const createTest = (gid, test) => safe(() => post(`/api/groups/${id(gid)}/tests`, test));
export const testDetails = (gid, tid) => safe(() => call(`/api/groups/${id(gid)}/tests/${id(tid)}`));
export const deleteTest = (gid, tid) => safe(() => call(`/api/groups/${id(gid)}/tests/${id(tid)}`, { method: 'DELETE' }));
export const previewGroup = (code) => safe(() => post('/api/groups/preview', { code }));
export const joinGroup = (code) => safe(() => post('/api/groups/join', { code, consent: true }));
export const leaveGroup = (groupId) => safe(() => post('/api/groups/leave', { groupId }));

export const adminGroups = () => safe(() => call('/api/admin/groups'));
export const adminOverview = () => safe(() => call('/api/admin/overview'));
export const adminUser = (uid) => safe(() => call(`/api/admin/users/${id(uid)}`));
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
  invalid: 'Bitte einen Gruppennamen eingeben.',
  invalid_test: 'Bitte Titel, Umfang, Zeit (1–120 Minuten) und Startzeit prüfen.',
  invalid_time: 'Die Startzeit darf höchstens einen Tag zurück und zwei Jahre voraus liegen.',
  limit: 'Diese Gruppe hat bereits die Höchstzahl an Tests (100).',
}[r.data?.error] ?? (r.status === 0 ? 'Server nicht erreichbar.' : `Das hat nicht geklappt (Fehler ${r.status}).`));
