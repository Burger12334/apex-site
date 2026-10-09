// The site's own storage. When there is no SUPABASE_SERVICE_ROLE_KEY the site keeps its records (reports,
// applications, team, settings and so on) itself instead of in the database: in a Cloudflare KV namespace
// on Cloudflare, or as JSON files in a data folder elsewhere (see storage.server.ts).
// Staff tools are limited to staff (see staff.server.ts).
import type { ReportRow } from './community.functions';
import { readBytes, readJson, toBase64, writeBytes, writeJson } from './storage.server';

type StoredReport = Omit<ReportRow, 'proof_url'> & { proof_file: string; proof_type: string; reviewed_by: string };

export const localMode = () => !process.env['SUPABASE_SERVICE_ROLE_KEY'];

const load = () => readJson<StoredReport[]>('reports.json', []);
const save = (rows: StoredReport[]) => writeJson('reports.json', rows);

export async function addLocalReport(row: Pick<ReportRow, 'id' | 'reporter_discord_id' | 'reporter_username' | 'reporter_avatar_url' | 'reported_name' | 'reported_discord_id' | 'reason'>, image?: { bytes: Uint8Array; type: string }) {
  const rows = await load();
  let proof_file = '';
  if (image) {
    proof_file = `${row.id}.${image.type.split('/')[1]}`;
    await writeBytes(`proof/${proof_file}`, image.bytes);
  }
  rows.unshift({ ...row, status: 'open', created_at: new Date().toISOString(), reviewed_by: '', notification_status: 'not_configured', notification_error: '', proof_file, proof_type: image?.type ?? '' });
  await save(rows);
}

export async function readLocalReports(): Promise<ReportRow[]> {
  return Promise.all((await load()).map(async ({ proof_file, proof_type, ...row }) => {
    const proof = proof_file ? await readBytes(`proof/${proof_file}`) : null;
    return { ...row, proof_url: proof ? `data:${proof_type};base64,${toBase64(proof)}` : '' };
  }));
}

export async function decideLocalReport(id: string, status: string, reviewed_by: string, reason = '') {
  const rows = await load();
  const row = rows.find(r => r.id === id);
  if (!row) throw new Error('Report not found');
  row.status = status; row.reviewed_by = reviewed_by; row.decision_reason = status === 'open' ? '' : reason;
  await save(rows);
}

export async function setLocalNotification(id: string, notification_status: string, notification_error = '') {
  const rows = await load();
  const row = rows.find(r => r.id === id);
  if (!row) return;
  row.notification_status = notification_status; row.notification_error = notification_error;
  await save(rows);
}

// Discord alert settings. A channel webhook lets the site post and ping roles; the bot token covers the rest.
export type LocalDiscord = { webhook_url: string; channel_id: string; ping_role_ids: string[]; app_role_ids: Record<string, string[]>; log_webhook_url: string; app_webhook_url: string; guild_id: string; app_webhooks: Record<string, string>; app_accept_roles: Record<string, string>; reapply_cooldown_days: number; events_webhook_url: string; log_visitors: boolean; staff_role_ids: string[]; supervision_role_ids: string[] };
const emptyDiscord = (): LocalDiscord => ({ webhook_url: '', channel_id: '', ping_role_ids: [], app_role_ids: {}, log_webhook_url: '', app_webhook_url: '', guild_id: '', app_webhooks: {}, app_accept_roles: {}, reapply_cooldown_days: 0, events_webhook_url: '', log_visitors: false, staff_role_ids: [], supervision_role_ids: [] });
export async function readLocalDiscord(): Promise<LocalDiscord> {
  return { ...emptyDiscord(), ...await readJson<Partial<LocalDiscord>>('discord-settings.json', {}) };
}
export const saveLocalDiscord = (config: LocalDiscord) => writeJson('discord-settings.json', config);

export type LocalApplication = { form_id: string; form_title: string; discord_id: string; discord_username: string; answers: Record<string, string>; created_at: string };
export type StoredApplication = LocalApplication & { id: string; status: string; decision_reason?: string; dm_status?: string; decided_at?: string; role_status?: string };
export async function readLocalApplications(): Promise<StoredApplication[]> {
  const rows = await readJson<Partial<StoredApplication>[]>('applications.json', []);
  // Applications saved before reviews existed have no id or status; they get them on the next write.
  return rows.map(row => ({ ...(row as LocalApplication), id: row.id ?? crypto.randomUUID(), status: row.status ?? 'pending' }));
}
export const writeLocalApplications = (rows: StoredApplication[]) => writeJson('applications.json', rows);
export async function addLocalApplication(row: LocalApplication) {
  const rows = await readLocalApplications();
  if (rows.some(r => r.form_id === row.form_id && r.discord_id === row.discord_id && r.status === 'pending')) throw new Error('You already have a pending application for this.');
  await writeLocalApplications([{ ...row, id: crypto.randomUUID(), status: 'pending' }, ...rows]);
}
// Applications created in the site's own storage (the database only accepts them from a signed-in editor).
export type LocalForm = { id: string; title: string; description: string; questions: { id: string; label: string; type: 'short' | 'long'; required: boolean }[]; is_open: boolean; sort_order: number; ping_role_ids: string[] };
export const readLocalForms = () => readJson<LocalForm[]>('forms.json', []);
export const writeLocalForms = (forms: LocalForm[]) => writeJson('forms.json', forms);

// Team members kept in the site's own storage.
export type LocalTeamMember = { id: string; discord_id: string; username: string; avatar_url: string; title: string; sort_order: number };
export const readLocalTeam = () => readJson<LocalTeamMember[]>('team.json', []);
export const writeLocalTeam = (team: LocalTeamMember[]) => writeJson('team.json', team);

// Generic lists for the newer features (application notes, expeditions, hall of fame).
export const readLocalList = <T,>(name: string) => readJson<T[]>(`${name}.json`, []);
export const writeLocalList = <T,>(name: string, rows: T[]) => writeJson(`${name}.json`, rows);
