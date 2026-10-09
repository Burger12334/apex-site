// Local test mode: when the dev server has no SUPABASE_SERVICE_ROLE_KEY, reports are kept in
// .local-data/ on this computer instead of the database, so the report flow can be tried locally.
// Never active in a production build, and nothing stored here reaches the live site.
import type { ReportRow } from './community.functions';

type StoredReport = Omit<ReportRow, 'proof_url'> & { proof_file: string; proof_type: string; reviewed_by: string };

export const localMode = () => import.meta.env.DEV && !process.env['SUPABASE_SERVICE_ROLE_KEY'];

const dir = () => `${process.cwd()}/.local-data`;
const file = () => `${dir()}/reports.json`;

async function load(): Promise<StoredReport[]> {
  const { readFile } = await import('node:fs/promises');
  try { return JSON.parse(await readFile(file(), 'utf8')) as StoredReport[]; } catch { return []; }
}
async function save(rows: StoredReport[]) {
  const { mkdir, writeFile } = await import('node:fs/promises');
  await mkdir(`${dir()}/proof`, { recursive: true });
  await writeFile(file(), JSON.stringify(rows, null, 2));
}

export async function addLocalReport(row: Pick<ReportRow, 'id' | 'reporter_discord_id' | 'reporter_username' | 'reporter_avatar_url' | 'reported_name' | 'reported_discord_id' | 'reason'>, image?: { bytes: Uint8Array; type: string }) {
  const rows = await load();
  let proof_file = '';
  if (image) {
    proof_file = `${row.id}.${image.type.split('/')[1]}`;
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir(`${dir()}/proof`, { recursive: true });
    await writeFile(`${dir()}/proof/${proof_file}`, image.bytes);
  }
  rows.unshift({ ...row, status: 'open', created_at: new Date().toISOString(), reviewed_by: '', notification_status: 'not_configured', notification_error: '', proof_file, proof_type: image?.type ?? '' });
  await save(rows);
}

export async function readLocalReports(): Promise<ReportRow[]> {
  const { readFile } = await import('node:fs/promises');
  return Promise.all((await load()).map(async ({ proof_file, proof_type, ...row }) => {
    const proof = proof_file ? await readFile(`${dir()}/proof/${proof_file}`).catch(() => null) : null;
    return { ...row, proof_url: proof ? `data:${proof_type};base64,${proof.toString('base64')}` : '' };
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

// Discord alert settings for local test mode. A channel webhook lets the local copy post and ping
// roles without the Lovable bot connection.
export type LocalDiscord = { webhook_url: string; channel_id: string; ping_role_ids: string[]; app_role_ids: Record<string, string[]>; log_webhook_url: string; app_webhook_url: string; guild_id: string; app_webhooks: Record<string, string>; app_accept_roles: Record<string, string>; reapply_cooldown_days: number; events_webhook_url: string; log_visitors: boolean };
const discordFile = () => `${dir()}/discord-settings.json`;
export async function readLocalDiscord(): Promise<LocalDiscord> {
  const { readFile } = await import('node:fs/promises');
  try { return { webhook_url: '', channel_id: '', ping_role_ids: [], app_role_ids: {}, log_webhook_url: '', app_webhook_url: '', guild_id: '', app_webhooks: {}, app_accept_roles: {}, reapply_cooldown_days: 0, events_webhook_url: '', log_visitors: false, ...JSON.parse(await readFile(discordFile(), 'utf8')) as Partial<LocalDiscord> }; } catch { return { webhook_url: '', channel_id: '', ping_role_ids: [], app_role_ids: {}, log_webhook_url: '', app_webhook_url: '', guild_id: '', app_webhooks: {}, app_accept_roles: {}, reapply_cooldown_days: 0, events_webhook_url: '', log_visitors: false }; }
}
export async function saveLocalDiscord(config: LocalDiscord) {
  const { mkdir, writeFile } = await import('node:fs/promises');
  await mkdir(dir(), { recursive: true });
  await writeFile(discordFile(), JSON.stringify(config, null, 2));
}

export type LocalApplication = { form_id: string; form_title: string; discord_id: string; discord_username: string; answers: Record<string, string>; created_at: string };
export type StoredApplication = LocalApplication & { id: string; status: string; decision_reason?: string; dm_status?: string; decided_at?: string; role_status?: string };
const applicationsFile = () => `${dir()}/applications.json`;
export async function readLocalApplications(): Promise<StoredApplication[]> {
  const { readFile } = await import('node:fs/promises');
  let rows: Partial<StoredApplication>[] = [];
  try { rows = JSON.parse(await readFile(applicationsFile(), 'utf8')) as Partial<StoredApplication>[]; } catch { /* none yet */ }
  // Applications saved before reviews existed have no id or status; they get them on the next write.
  return rows.map(row => ({ ...(row as LocalApplication), id: row.id ?? crypto.randomUUID(), status: row.status ?? 'pending' }));
}
export async function writeLocalApplications(rows: StoredApplication[]) {
  const { mkdir, writeFile } = await import('node:fs/promises');
  await mkdir(dir(), { recursive: true });
  await writeFile(applicationsFile(), JSON.stringify(rows, null, 2));
}
export async function addLocalApplication(row: LocalApplication) {
  const rows = await readLocalApplications();
  if (rows.some(r => r.form_id === row.form_id && r.discord_id === row.discord_id && r.status === 'pending')) throw new Error('You already have a pending application for this.');
  await writeLocalApplications([{ ...row, id: crypto.randomUUID(), status: 'pending' }, ...rows]);
}
// Applications created on this computer in local test mode (the database only accepts them from a signed-in editor).
export type LocalForm = { id: string; title: string; description: string; questions: { id: string; label: string; type: 'short' | 'long'; required: boolean }[]; is_open: boolean; sort_order: number; ping_role_ids: string[] };
const formsFile = () => `${dir()}/forms.json`;
export async function readLocalForms(): Promise<LocalForm[]> {
  const { readFile } = await import('node:fs/promises');
  try { return JSON.parse(await readFile(formsFile(), 'utf8')) as LocalForm[]; } catch { return []; }
}
export async function writeLocalForms(forms: LocalForm[]) {
  const { mkdir, writeFile } = await import('node:fs/promises');
  await mkdir(dir(), { recursive: true });
  await writeFile(formsFile(), JSON.stringify(forms, null, 2));
}

// Team members added on this computer in local test mode.
export type LocalTeamMember = { id: string; discord_id: string; username: string; avatar_url: string; title: string; sort_order: number };
const teamFile = () => `${dir()}/team.json`;
export async function readLocalTeam(): Promise<LocalTeamMember[]> {
  const { readFile } = await import('node:fs/promises');
  try { return JSON.parse(await readFile(teamFile(), 'utf8')) as LocalTeamMember[]; } catch { return []; }
}
export async function writeLocalTeam(team: LocalTeamMember[]) {
  const { mkdir, writeFile } = await import('node:fs/promises');
  await mkdir(dir(), { recursive: true });
  await writeFile(teamFile(), JSON.stringify(team, null, 2));
}

// Generic list files for the newer local features (application notes, expeditions, hall of fame).
export async function readLocalList<T>(name: string): Promise<T[]> {
  const { readFile } = await import('node:fs/promises');
  try { return JSON.parse(await readFile(`${dir()}/${name}.json`, 'utf8')) as T[]; } catch { return []; }
}
export async function writeLocalList<T>(name: string, rows: T[]) {
  const { mkdir, writeFile } = await import('node:fs/promises');
  await mkdir(dir(), { recursive: true });
  await writeFile(`${dir()}/${name}.json`, JSON.stringify(rows, null, 2));
}