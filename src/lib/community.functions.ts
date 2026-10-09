import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

const snowflake = z.string().regex(/^\d{17,20}$/, 'Enter a valid Discord ID');
export type DiscordRole = { name: string; color: string; icon_url: string; emoji: string };
export type TeamMember = { id: string; discord_id: string; username: string; avatar_url: string; title: string; sort_order: number; role?: DiscordRole | null };
export type Report = { id: string; reporter_username: string; reporter_discord_id: string; reported_name: string; reported_discord_id: string; reason: string; status: string; created_at: string; proof_url: string; notification_status: string; notification_error: string; reporter_avatar_url: string; reported_avatar_url: string; decision_reason?: string };
// A report before profile pictures are resolved; only local test reports store the reporter's picture.
export type ReportRow = Omit<Report, 'reporter_avatar_url' | 'reported_avatar_url'> & { reporter_avatar_url?: string };

export const getTeam = createServerFn({ method: 'GET' }).handler(async () => {
  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env['SUPABASE_URL']; const key = process.env['SUPABASE_PUBLISHABLE_KEY'];
  if (!url || !key) throw new Error('Connection unavailable');
  const client = createClient(url, key, { auth: { persistSession: false }, global: { fetch: (input, init) => { const h = new Headers(init?.headers); h.delete('Authorization'); h.set('apikey', key); return fetch(input, { ...init, headers: h }); } } });
  const { data, error } = await client.from('team_members').select('*').order('sort_order');
  if (error) throw new Error(error.message);
  const { localMode, readLocalTeam } = await import('./local-store.server');
  const team: TeamMember[] = localMode() ? [...(data as TeamMember[]), ...await readLocalTeam()].sort((a, b) => a.sort_order - b.sort_order) : data as TeamMember[];
  // Each member's current highest Discord role is looked up live, so it follows changes made in Discord.
  const { highestRole } = await import('./community.server');
  // One at a time, so a long team list does not trip Discord's rate limit.
  const withRoles: TeamMember[] = [];
  for (const member of team) withRoles.push({ ...member, role: await highestRole(member.discord_id).catch(() => null) });
  return withRoles;
});

export const lookupDiscord = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((d) => snowflake.parse(d)).handler(async ({ data, context }) => {
  const { data: role } = await context.supabase.rpc('apex_role');
  if (!['owner', 'editor'].includes(role ?? '')) throw new Error('Editor access required');
  const { discordFetch, avatarUrl } = await import('./community.server');
  const user = await discordFetch(`users/${data}`) as { id: string; username: string; avatar: string | null };
  return { discord_id: user.id, username: user.username, avatar_url: avatarUrl(user) };
});

export const getSupervisionAccess = createServerFn({ method: 'GET' }).handler(async () => {
  const { supervisor } = await import('./community.server'); return Boolean(await supervisor());
});

export const submitReport = createServerFn({ method: 'POST' }).inputValidator((d) => z.object({ discordId: snowflake, reason: z.string().trim().min(10).max(4000), image: z.object({ data: z.string().max(7000000), type: z.enum(['image/png', 'image/jpeg', 'image/webp']) }).optional() }).parse(d)).handler(async ({ data }) => {
  const { readSession, currentOrigin } = await import('./discord.server'); const me = await readSession();
  if (!me) throw new Error('Link Discord before submitting a report.');
  // The reported person's name comes from Discord, not from the form.
  const { findDiscordUser } = await import('./community.server');
  const target = await findDiscordUser(data.discordId).catch(() => undefined);
  if (target === null) throw new Error('No Discord user has that ID. Check it and try again.');
  const reportedName = target?.username ?? `User ${data.discordId}`;
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { localMode, addLocalReport } = await import('./local-store.server');
  const id = crypto.randomUUID(); let proof_path = '';
  let proof: { bytes: Uint8Array; type: string } | undefined;
  if (data.image) {
    const bytes = Uint8Array.from(atob(data.image.data), c => c.charCodeAt(0));
    if (bytes.length > 5 * 1024 * 1024) throw new Error('Image must be under 5 MB');
    const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
    const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const webp = String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
    if (!(data.image.type === 'image/png' ? png : data.image.type === 'image/jpeg' ? jpg : webp)) throw new Error('Invalid image file');
    proof = { bytes, type: data.image.type };
  }
  if (localMode()) {
    const { avatarUrl } = await import('./community.server');
    await addLocalReport({ id, reporter_discord_id: me.id, reporter_username: me.username, reporter_avatar_url: avatarUrl(me), reported_name: reportedName, reported_discord_id: data.discordId, reason: data.reason }, proof);
    const { notifyLocalReport } = await import('./community.server');
    await notifyLocalReport({ id, reporter_username: me.username, reporter_discord_id: me.id, reported_name: reportedName, reported_discord_id: data.discordId, reason: data.reason, has_proof: !!proof, created_at: new Date().toISOString() }, currentOrigin());
    const { logEvent, LOG_COLORS } = await import('./audit-log.server');
    await logEvent({ title: 'Report submitted', color: LOG_COLORS.warn, lines: [`**Reporter** <@${me.id}> (${me.username})`, `**Reported** <@${data.discordId}> (${reportedName})`, `**Proof** ${proof ? 'image attached' : 'none'}`, `**Report** ${id}`] });
    return { id, local: true };
  }
  if (proof) {
    proof_path = `${id}/proof.${proof.type.split('/')[1]}`;
    const { error } = await supabaseAdmin.storage.from('apex-report-proof').upload(proof_path, proof.bytes, { contentType: proof.type });
    if (error) throw new Error(error.message);
  }
  const { error } = await supabaseAdmin.from('reports').insert({ id, reporter_discord_id: me.id, reporter_username: me.username, reported_name: reportedName, reported_discord_id: data.discordId, reason: data.reason, proof_path });
  if (error) { if (proof_path) await supabaseAdmin.storage.from('apex-report-proof').remove([proof_path]); throw new Error(error.message); }
  const { notifyReport } = await import('./community.server'); await notifyReport(id, currentOrigin());
  const { logEvent, LOG_COLORS } = await import('./audit-log.server');
  await logEvent({ title: 'Report submitted', color: LOG_COLORS.warn, lines: [`**Reporter** <@${me.id}> (${me.username})`, `**Reported** <@${data.discordId}> (${reportedName})`, `**Proof** ${proof ? 'image attached' : 'none'}`, `**Report** ${id}`] });
  return { id, local: false };
});

export const supervisorReports = createServerFn({ method: 'GET' }).handler(async () => {
  const { supervisor, readReports } = await import('./community.server');
  if (!await supervisor()) throw new Error('Supervision access required'); return readReports();
});
export const editorReports = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data: role } = await context.supabase.rpc('apex_role'); if (!['owner', 'editor'].includes(role ?? '')) throw new Error('Editor access required');
  const { readReports } = await import('./community.server'); return readReports();
});
const decision = z.object({ id: z.string().uuid(), status: z.enum(['open', 'resolved', 'dismissed']), reason: z.string().trim().max(1000).default('') });
export const supervisorDecision = createServerFn({ method: 'POST' }).inputValidator((d) => decision.parse(d)).handler(async ({ data }) => {
  const { supervisor } = await import('./community.server'); const me = await supervisor(); if (!me) throw new Error('Supervision access required');
  const { reportSummary } = await import('./report-chat.server'); const report = await reportSummary(data.id); if (!report) throw new Error('Report not found.');
  const { localMode, decideLocalReport } = await import('./local-store.server');
  if (localMode()) await decideLocalReport(data.id, data.status, me.id, data.reason);
  else {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server'); const { error } = await supabaseAdmin.from('reports').update({ status: data.status, reviewed_by: me.id }).eq('id', data.id); if (error) throw new Error(error.message);
    // decision_reason arrives with migration 0007; until then the reason still reaches the reporter by DM.
    await (supabaseAdmin as unknown as SupabaseClient).from('reports').update({ decision_reason: data.reason }).eq('id', data.id);
  }
  // The reporter is told by DM when their report is closed; reopening is silent.
  let dm = '';
  if (data.status !== 'open') { const { sendDm, reportDm } = await import('./decisions.server'); const { currentOrigin } = await import('./discord.server'); dm = await sendDm(report.reporter_discord_id, reportDm(report, data.status, data.reason, currentOrigin())); }
  const { logEvent, LOG_COLORS } = await import('./audit-log.server');
  await logEvent({ title: data.status === 'open' ? 'Report reopened' : data.status === 'resolved' ? 'Report resolved' : 'Report dismissed', color: data.status === 'resolved' ? LOG_COLORS.good : data.status === 'dismissed' ? LOG_COLORS.bad : LOG_COLORS.info, lines: [`**Report about** ${report.reported_name}`, `**Reporter** <@${report.reporter_discord_id}>`, data.reason && `**Reason** ${data.reason}`, dm && `**DM to reporter** ${dm}`, `**Report** ${report.id}`], by: `<@${me.id}> (${me.username})` });
  return { dm };
});

// Local test mode only: Discord alert settings kept on this computer. Returns null outside test mode.
export const getLocalDiscordConfig = createServerFn({ method: 'GET' }).handler(async () => {
  const { localMode, readLocalDiscord } = await import('./local-store.server');
  // Holds webhook addresses, so only staff may read it.
  if (!localMode() || !await (await import('./staff.server')).isStaff()) return null;
  return readLocalDiscord();
});
const localDiscord = z.object({
  webhook_url: z.string().trim().regex(/^(https:\/\/(ptb\.|canary\.)?discord(app)?\.com\/api\/webhooks\/\d+\/[\w-]+)?$/, 'Enter a Discord webhook URL'),
  channel_id: z.string().trim().regex(/^(\d{17,20})?$/, 'Enter a valid channel ID'),
  ping_role_ids: z.array(snowflake).max(20),
  app_role_ids: z.record(z.string().uuid(), z.array(snowflake).max(20)),
  app_accept_roles: z.record(z.string().uuid(), z.string().trim().regex(/^(\d{17,20})?$/, 'Enter a valid role ID')),
  reapply_cooldown_days: z.number().int().min(0).max(365),
  staff_role_ids: z.array(snowflake).max(20),
  supervision_role_ids: z.array(snowflake).max(20),
  log_visitors: z.boolean(),
  events_webhook_url: z.string().trim().regex(/^(https:\/\/(ptb\.|canary\.)?discord(app)?\.com\/api\/webhooks\/\d+\/[\w-]+)?$/, 'Enter a Discord webhook URL for expeditions'),
  app_webhooks: z.record(z.string().uuid(), z.string().trim().regex(/^(https:\/\/(ptb\.|canary\.)?discord(app)?\.com\/api\/webhooks\/\d+\/[\w-]+)?$/, 'Enter a Discord webhook URL for each application')),
  guild_id: z.string().trim().regex(/^(\d{17,20})?$/, 'Enter a valid Discord server ID'),
  app_webhook_url: z.string().trim().regex(/^(https:\/\/(ptb\.|canary\.)?discord(app)?\.com\/api\/webhooks\/\d+\/[\w-]+)?$/, 'Enter a Discord webhook URL for applications'),
  log_webhook_url: z.string().trim().regex(/^(https:\/\/(ptb\.|canary\.)?discord(app)?\.com\/api\/webhooks\/\d+\/[\w-]+)?$/, 'Enter a Discord webhook URL for the log'),
});
export const saveLocalDiscordConfig = createServerFn({ method: 'POST' }).inputValidator((d) => localDiscord.parse(d)).handler(async ({ data }) => {
  const { localMode, saveLocalDiscord } = await import('./local-store.server');
  if (!localMode()) throw new Error('Not available while the site is connected to the database.');
  await (await import('./staff.server')).requireStaff();
  await saveLocalDiscord(data);
  const { logEvent, LOG_COLORS, actorName } = await import('./audit-log.server');
  await logEvent({ title: 'Discord settings updated', color: LOG_COLORS.edit, lines: [`**Report roles** ${data.ping_role_ids.length}`, `**Reports webhook** ${data.webhook_url ? 'set' : 'not set'}`, `**Applications webhook** ${data.app_webhook_url ? 'set' : 'not set'}`, `**Log webhook** ${data.log_webhook_url ? 'set' : 'not set'}`], by: await actorName() });
});
export const testLocalDiscord = createServerFn({ method: 'POST' }).handler(async () => {
  const { localMode } = await import('./local-store.server');
  if (!localMode()) throw new Error('Not available while the site is connected to the database.');
  await (await import('./staff.server')).requireStaff();
  const { sendLocalTestAlert } = await import('./community.server'); const { readSession, currentOrigin } = await import('./discord.server');
  if (!await sendLocalTestAlert(await readSession(), currentOrigin())) throw new Error('Add a webhook URL and save first.');
});

// Shown on the report form as soon as an ID is typed, so the reporter can check they have the right person.
export const findReportTarget = createServerFn({ method: 'POST' }).inputValidator((d) => snowflake.parse(d)).handler(async ({ data }) => {
  const { readSession } = await import('./discord.server');
  if (!await readSession()) throw new Error('Link Discord first.');
  const { findDiscordUser } = await import('./community.server');
  try {
    const user = await findDiscordUser(data);
    return user ? { status: 'found' as const, user } : { status: 'missing' as const, user: null };
  } catch { return { status: 'unavailable' as const, user: null }; }
});
export const testLocalLog = createServerFn({ method: 'POST' }).handler(async () => {
  const { localMode } = await import('./local-store.server');
  if (!localMode()) throw new Error('Not available while the site is connected to the database.');
  await (await import('./staff.server')).requireStaff();
  const { logEvent, actorName } = await import('./audit-log.server');
  if (!await logEvent({ title: 'Test log entry', lines: ['The Apex activity log is connected to this channel.'], by: await actorName() })) throw new Error('Could not post to the log webhook. Check the URL and save first.');
});

// Local test mode only: team members kept on this computer (the database only accepts them from a signed-in editor).
export const addLocalTeamMember = createServerFn({ method: 'POST' }).inputValidator((d) => z.object({ discord_id: snowflake, title: z.string().trim().min(1).max(100) }).parse(d)).handler(async ({ data }) => {
  const { localMode, readLocalTeam, writeLocalTeam } = await import('./local-store.server');
  if (!localMode()) throw new Error('Not available while the site is connected to the database.');
  await (await import('./staff.server')).requireStaff();
  const { findDiscordUser } = await import('./community.server');
  const user = await findDiscordUser(data.discord_id);
  if (!user) throw new Error('No Discord user has that ID.');
  const team = await readLocalTeam();
  if (team.some(m => m.discord_id === user.id)) throw new Error('That person is already on the team.');
  await writeLocalTeam([...team, { id: crypto.randomUUID(), discord_id: user.id, username: user.display_name, avatar_url: user.avatar_url, title: data.title, sort_order: team.length }]);
  const { logEvent, LOG_COLORS, actorName } = await import('./audit-log.server');
  await logEvent({ title: 'Team member added', color: LOG_COLORS.good, lines: [`**Member** <@${user.id}> (${user.username})`, `**Title** ${data.title}`], by: await actorName() });
});
export const removeLocalTeamMember = createServerFn({ method: 'POST' }).inputValidator((d) => z.string().uuid().parse(d)).handler(async ({ data }) => {
  const { localMode, readLocalTeam, writeLocalTeam } = await import('./local-store.server');
  if (!localMode()) throw new Error('Not available while the site is connected to the database.');
  await (await import('./staff.server')).requireStaff();
  const team = await readLocalTeam();
  const member = team.find(m => m.id === data);
  if (!member) throw new Error('That member is from the live site and can only be removed there.');
  await writeLocalTeam(team.filter(m => m.id !== data));
  const { logEvent, LOG_COLORS, actorName } = await import('./audit-log.server');
  await logEvent({ title: 'Team member removed', color: LOG_COLORS.bad, lines: [`**Member** <@${member.discord_id}> (${member.username})`], by: await actorName() });
});
export const updateLocalTeamMember = createServerFn({ method: 'POST' }).inputValidator((d) => z.object({ id: z.string().uuid(), title: z.string().trim().min(1).max(100) }).parse(d)).handler(async ({ data }) => {
  const { localMode, readLocalTeam, writeLocalTeam } = await import('./local-store.server');
  if (!localMode()) throw new Error('Not available while the site is connected to the database.');
  await (await import('./staff.server')).requireStaff();
  const team = await readLocalTeam();
  const member = team.find(m => m.id === data.id);
  if (!member) throw new Error('That member is from the live site and can only be edited there.');
  await writeLocalTeam(team.map(m => m.id === data.id ? { ...m, title: data.title } : m));
  const { logEvent, LOG_COLORS, actorName } = await import('./audit-log.server');
  await logEvent({ title: 'Team member edited', color: LOG_COLORS.edit, lines: [`**Member** <@${member.discord_id}> (${member.username})`, `**Title** ${member.title} → ${data.title}`], by: await actorName() });
});
// Takes every team member's id in the wanted order; each local member's position becomes its place in that list.
export const reorderLocalTeam = createServerFn({ method: 'POST' }).inputValidator((d) => z.array(z.string().uuid()).max(200).parse(d)).handler(async ({ data }) => {
  const { localMode, readLocalTeam, writeLocalTeam } = await import('./local-store.server');
  if (!localMode()) throw new Error('Not available while the site is connected to the database.');
  await (await import('./staff.server')).requireStaff();
  const team = await readLocalTeam();
  await writeLocalTeam(team.map(m => ({ ...m, sort_order: data.includes(m.id) ? data.indexOf(m.id) : m.sort_order })).sort((a, b) => a.sort_order - b.sort_order));
  const { logEvent, LOG_COLORS, actorName } = await import('./audit-log.server');
  await logEvent({ title: 'Team order changed', color: LOG_COLORS.edit, by: await actorName() });
});
export const testLocalApplicationAlert = createServerFn({ method: 'POST' }).handler(async () => {
  const { localMode } = await import('./local-store.server');
  if (!localMode()) throw new Error('Not available while the site is connected to the database.');
  await (await import('./staff.server')).requireStaff();
  const { sendLocalTestApplicationAlert } = await import('./community.server'); const { readSession, currentOrigin } = await import('./discord.server');
  if (!await sendLocalTestApplicationAlert(await readSession(), currentOrigin())) throw new Error('Add a webhook URL and save first.');
});

// What the current visitor may do: `store` is true when the site keeps its own data (no database service key),
// `staff` opens the staff tools and `supervisor` the report reviews. Decided from the linked Discord account.
export const getAccess = createServerFn({ method: 'GET' }).handler(async () => {
  const { localMode } = await import('./local-store.server');
  if (!localMode()) return { store: false, staff: false, supervisor: false };
  const { readSession } = await import('./discord.server'); const { accessFor } = await import('./staff.server');
  return { store: true, ...await accessFor(await readSession()) };
});