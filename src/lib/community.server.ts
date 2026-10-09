import type { DiscordUser } from './discord.server';
import type { DiscordRole, Report, ReportRow } from './community.functions';
export function avatarUrl(user: { id: string; avatar: string | null }) {
  return user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${user.avatar.startsWith('a_') ? 'gif' : 'png'}?size=128` : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(user.id) >> 22n) % 6n)}.png`;
}
export async function discordFetch(path: string, body?: object, attempt = 0, method?: 'PUT' | 'DELETE'): Promise<unknown> {
  const key = process.env['DISCORD_API_KEY']; const auth = process.env['LOVABLE_API_KEY'];
  // Outside Lovable hosting there is no connector, so a bot token (DISCORD_BOT_TOKEN) is used directly if present.
  const bot = process.env['DISCORD_BOT_TOKEN'];
  if ((!key || !auth) && !bot) throw new Error('Discord is not connected');
  const direct = !key || !auth;
  const response = await fetch(direct ? `https://discord.com/api/v10/${path}` : `https://connector-gateway.lovable.dev/discord/${path}`, { method: method ?? (body ? 'POST' : 'GET'), headers: direct ? { Authorization: `Bot ${bot}`, 'Content-Type': 'application/json' } : { Authorization: `Bearer ${auth}`, 'X-Connection-Api-Key': key, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : null });
  // Discord asks callers to wait when they go too fast; wait as told (up to 3s) and try again, twice at most.
  if (response.status === 429 && attempt < 2) {
    const wait = Math.min(3, Number((await response.json().catch(() => ({})) as { retry_after?: number }).retry_after ?? 1));
    await new Promise(resolve => setTimeout(resolve, wait * 1000 + 100));
    return discordFetch(path, body, attempt + 1, method);
  }
  if (!response.ok) { const detail = await response.text(); console.error(`Discord [${response.status}]: ${detail}`); throw new Error(`Discord [${response.status}]: ${detail}`); }
  // Some calls (such as giving a role) succeed with an empty reply.
  if (response.status === 204) return null;
  return response.json();
}
// Looks a Discord user up by ID through the bot. Null means Discord has no such user; it throws when no bot is available.
export async function findDiscordUser(id: string) {
  try {
    const user = await discordFetch(`users/${id}`) as { id: string; username: string; global_name?: string | null; avatar: string | null };
    return { id: user.id, username: user.username, display_name: user.global_name ?? user.username, avatar_url: avatarUrl(user) };
  } catch (e) { if (e instanceof Error && /\[404\]/.test(e.message)) return null; throw e; }
}
// The Discord server members and roles are read from: the server ID saved in the Discord settings, or the
// Apex server when none is saved. DISCORD_GUILD_ID overrides the built-in default.
const APEX_GUILD = '1507797674668326973';
export async function roleGuild() {
  const { localMode } = await import('./local-store.server');
  if (localMode()) {
    const { readLocalDiscord } = await import('./local-store.server');
    return (await readLocalDiscord()).guild_id || process.env['DISCORD_GUILD_ID'] || APEX_GUILD;
  }
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data: settings } = await supabaseAdmin.from('discord_settings').select('guild_id').eq('id', 'main').maybeSingle();
  return settings?.guild_id || process.env['DISCORD_GUILD_ID'] || APEX_GUILD;
}
// A member's highest role in the Discord server, with the colour and icon Discord shows for it.
// Roles and memberships are cached for five minutes so pages do not query Discord on every view.
type GuildRole = { id: string; name: string; position: number; color: number; icon?: string | null; unicode_emoji?: string | null };
const ROLE_TTL = 300000;
let rolesCache: { guild: string; at: number; roles: GuildRole[] } | undefined;
const memberRoleCache = new Map<string, { at: number; role: DiscordRole | null }>();
async function guildRoles(guild: string) {
  if (rolesCache && rolesCache.guild === guild && Date.now() - rolesCache.at < ROLE_TTL) return rolesCache.roles;
  const roles = await discordFetch(`guilds/${guild}/roles`) as GuildRole[];
  rolesCache = { guild, at: Date.now(), roles };
  return roles;
}
// The IDs of every role a member holds in the Discord server (empty if they are not in it or no bot is available).
const memberIdsCache = new Map<string, { at: number; ids: string[] }>();
export async function memberRoleIds(userId: string): Promise<string[]> {
  const hit = memberIdsCache.get(userId); if (hit && Date.now() - hit.at < 60000) return hit.ids;
  try {
    const guild = await roleGuild(); if (!guild) return [];
    const member = await discordFetch(`guilds/${guild}/members/${userId}`) as { roles: string[] };
    memberIdsCache.set(userId, { at: Date.now(), ids: member.roles }); return member.roles;
  } catch { return []; }
}
export async function highestRole(userId: string): Promise<DiscordRole | null> {
  const hit = memberRoleCache.get(userId); if (hit && Date.now() - hit.at < ROLE_TTL) return hit.role;
  let role: DiscordRole | null = null;
  try {
    const guild = await roleGuild();
    if (!guild) return null;
    const [member, roles] = await Promise.all([discordFetch(`guilds/${guild}/members/${userId}`) as Promise<{ roles: string[] }>, guildRoles(guild)]);
    const top = roles.filter(r => member.roles.includes(r.id)).sort((x, y) => y.position - x.position)[0];
    role = top
      ? { name: top.name, color: top.color ? `#${top.color.toString(16).padStart(6, '0')}` : '', icon_url: top.icon ? `https://cdn.discordapp.com/role-icons/${top.id}/${top.icon}.png?size=64` : '', emoji: top.unicode_emoji ?? '' }
      : { name: 'Member', color: '', icon_url: '', emoji: '' };
  } catch (e) {
    // Someone who is not in the server has no role; that answer is remembered. Other failures are retried next time.
    if (!(e instanceof Error && /Unknown Member/.test(e.message))) return null;
  }
  memberRoleCache.set(userId, { at: Date.now(), role });
  return role;
}
export async function enrichIdentity(me: DiscordUser) {
  const role = await highestRole(me.id);
  return { ...me, avatar_url: avatarUrl(me), highest_role: role?.name ?? null, role };
}export async function supervisor() {
  const { readSession } = await import('./discord.server'); const me = await readSession(); if (!me) return null;
  // Without the database's supervision list, reviewers are staff and anyone with a supervision role.
  const { localMode } = await import('./local-store.server'); if (localMode()) return (await (await import('./staff.server')).accessFor(me)).supervisor ? me : null;
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server'); const { data, error } = await supabaseAdmin.from('supervision_members').select('id').eq('discord_id', me.id).maybeSingle();
  if (error) throw new Error(error.message); return data ? me : null;
}
// Profile pictures are looked up through the bot when reports are read. Without the bot (or for an
// unknown ID) the user's default Discord avatar is shown instead; failures are not cached.
const avatarCache = new Map<string, { url: string; at: number }>();
export async function lookupAvatar(id: string) {
  const hit = avatarCache.get(id); if (hit && Date.now() - hit.at < 600000) return hit.url;
  try {
    const url = avatarUrl(await discordFetch(`users/${id}`) as { id: string; avatar: string | null });
    avatarCache.set(id, { url, at: Date.now() }); return url;
  } catch { return /^\d+$/.test(id) ? avatarUrl({ id, avatar: null }) : ''; }
}
export async function readReports(): Promise<Report[]> {
  const rows = await readReportRows();
  // The viewer's own picture is known from their session even when the bot is unavailable.
  const { readSession } = await import('./discord.server'); const me = await readSession();
  return Promise.all(rows.map(async row => ({ ...row, reporter_avatar_url: row.reporter_avatar_url || (me?.id === row.reporter_discord_id ? avatarUrl(me) : await lookupAvatar(row.reporter_discord_id)), reported_avatar_url: await lookupAvatar(row.reported_discord_id) })));
}
async function readReportRows(): Promise<ReportRow[]> {
  const { localMode, readLocalReports } = await import('./local-store.server'); if (localMode()) return readLocalReports();
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data, error } = await supabaseAdmin.from('reports').select('*').order('created_at', { ascending: false }); if (error) throw new Error(error.message);
  return Promise.all((data ?? []).map(async ({ proof_path, ...row }) => {
    const proof = proof_path ? await supabaseAdmin.storage.from('apex-report-proof').createSignedUrl(proof_path, 300) : null;
    return { ...row, proof_url: proof?.data?.signedUrl ?? '' };
  }));
}
type AlertReport = { id: string; reporter_username: string; reporter_discord_id: string; reported_name: string; reported_discord_id: string; reason: string; has_proof: boolean; created_at: string };
const reportLink = (origin: string, id: string) => `${origin}/reports/reviews?report=${id}`;
const quote = (text: string) => text.split('\n').map(line => `> ${line}`).join('\n');
const ALERT_COLOR = 0x2dd4bf;
// The alert is two cards: who is involved, then the answers from the report form.
// Users appear as <@id> mentions so they are clickable; allowed_mentions only lists roles, so the users are not notified.
function alertEmbeds(r: AlertReport, origin: string) {
  const sent = Math.floor(new Date(r.created_at).getTime() / 1000);
  const reason = r.reason.length > 1500 ? `${r.reason.slice(0, 1500)}…` : r.reason;
  return [
    { color: ALERT_COLOR, title: '🚨 New Report', description: [
      `**Reported by** <@${r.reporter_discord_id}> · \`${r.reporter_username}\` · \`${r.reporter_discord_id}\``,
      `**Reported user** <@${r.reported_discord_id}> · \`${r.reported_name}\` · \`${r.reported_discord_id}\``,
      `Submitted <t:${sent}:F>`,
      '',
      `**[Open report](${reportLink(origin, r.id)})**`,
    ].join('\n') },
    { color: ALERT_COLOR, description: [
      `**1 · Their Discord user ID**\n${quote(`${r.reported_discord_id} (${r.reported_name})`)}`,
      `**2 · Why are you reporting this person?**\n${quote(reason)}`,
      `**3 · Proof**\n${quote(r.has_proof ? 'Image attached. Open the report to view it.' : 'No image attached.')}`,
    ].join('\n\n'), footer: { text: `Report ${r.id}` } },
  ];
}
export async function notifyReport(id: string, origin: string) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data: config } = await supabaseAdmin.from('discord_settings').select('*').eq('id', 'main').maybeSingle();
  if (!config?.channel_id) { await supabaseAdmin.from('reports').update({ notification_status: 'not_configured' }).eq('id', id); return; }
  const { data: report } = await supabaseAdmin.from('reports').select('id,reporter_username,reporter_discord_id,reported_name,reported_discord_id,reason,proof_path,created_at').eq('id', id).maybeSingle();
  const pings = config.ping_role_ids.map(r => `<@&${r}>`).join(' ');
  try {
    await discordFetch(`channels/${config.channel_id}/messages`, report
      ? { content: pings, embeds: alertEmbeds({ ...report, has_proof: !!report.proof_path }, origin), allowed_mentions: { parse: [], roles: config.ping_role_ids } }
      : { content: `${pings}\nA new Apex report has been opened.\nOpen report: ${reportLink(origin, id)}`, allowed_mentions: { parse: [], roles: config.ping_role_ids } });
    await supabaseAdmin.from('reports').update({ notification_status: 'sent', notification_error: '' }).eq('id', id);
  } catch (e) { await supabaseAdmin.from('reports').update({ notification_status: 'failed', notification_error: e instanceof Error ? e.message : 'Discord notification failed' }).eq('id', id); }
}

// Local test mode: post the alert through the saved webhook (or the bot token and channel ID).
// Reports and applications each have their own webhook; applications fall back to the reports one.
// Returns false when nothing is configured.
export async function sendLocalAlert(text: string, embeds: object[] = [], roles?: string[], kind: 'reports' | 'applications' = 'reports', ownWebhook = '') {
  const { readLocalDiscord } = await import('./local-store.server'); const config = await readLocalDiscord();
  const pings = roles ?? config.ping_role_ids;
  const body = { content: [pings.map(r => `<@&${r}>`).join(' '), text].filter(Boolean).join('\n'), embeds, allowed_mentions: { parse: [], roles: pings } };
  // An application's own webhook wins, then the shared applications webhook, then the reports one.
  const webhook = ownWebhook || (kind === 'applications' ? config.app_webhook_url || config.webhook_url : config.webhook_url);
  if (webhook) {
    const response = await fetch(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`Discord [${response.status}]: ${await response.text()}`);
    return true;
  }
  if (config.channel_id) { await discordFetch(`channels/${config.channel_id}/messages`, body); return true; }
  return false;
}
export async function notifyLocalReport(report: AlertReport, origin: string) {
  const { setLocalNotification } = await import('./local-store.server');
  try {
    const sent = await sendLocalAlert('', alertEmbeds(report, origin));
    await setLocalNotification(report.id, sent ? 'sent' : 'not_configured');
  } catch (e) {
    const reason = e instanceof Error ? e.message : 'Discord notification failed';
    await setLocalNotification(report.id, 'failed', reason);
    const { logEvent, LOG_COLORS } = await import('./audit-log.server');
    await logEvent({ title: 'Report alert failed to send', color: LOG_COLORS.bad, lines: [`**Report** ${report.id}`, `**Why** ${reason.slice(0, 300)}`] });
  }
}
// Sends the same cards as a real report, filled with sample answers, so the look can be checked.
export async function sendLocalTestAlert(me: { id: string; username: string } | null, origin: string) {
  return sendLocalAlert('', alertEmbeds({ id: 'test-alert', reporter_username: me?.username ?? 'example', reporter_discord_id: me?.id ?? '0', reported_name: 'Example user', reported_discord_id: me?.id ?? '0', reason: 'This is a test alert from the Apex report system.\nNo report was created.', has_proof: false, created_at: new Date().toISOString() }, origin));
}

// Application alerts use the same channel as reports, with their own roles to ping per application.
type AlertApplication = { form_id: string; form_title: string; discord_id: string; discord_username: string; answers: Record<string, string>; created_at: string };
const APPLICATION_COLOR = 0x6366f1;
function applicationEmbeds(a: AlertApplication, origin: string) {
  const sent = Math.floor(new Date(a.created_at).getTime() / 1000);
  let answers = Object.entries(a.answers).map(([question, answer], i) => `**${i + 1} · ${question}**\n${quote(answer.length > 900 ? `${answer.slice(0, 900)}…` : answer || '—')}`).join('\n\n');
  if (answers.length > 3900) answers = `${answers.slice(0, 3900)}…`;
  return [
    { color: APPLICATION_COLOR, title: `📝 New ${a.form_title}`, description: [
      `**Applicant** <@${a.discord_id}> · \`${a.discord_username}\` · \`${a.discord_id}\``,
      `Submitted <t:${sent}:F>`,
      '',
      `**[Review applications](${origin}/apply/reviews)**`,
    ].join('\n') },
    { color: APPLICATION_COLOR, description: answers || 'No answers.' },
  ];
}
export async function notifyApplication(application: AlertApplication, roles: string[], origin: string, ownChannel = '') {
  try {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    // application_channel_id arrives with migration 0009; until then applications post to the reports channel.
    const { data } = await supabaseAdmin.from('discord_settings').select('*').eq('id', 'main').maybeSingle();
    // An application's own channel (migration 0010) wins over the shared applications channel.
    const channel = ownChannel || (data as { application_channel_id?: string } | null)?.application_channel_id || data?.channel_id;
    if (!channel) return;
    await discordFetch(`channels/${channel}/messages`, { content: roles.map(r => `<@&${r}>`).join(' '), embeds: applicationEmbeds(application, origin), allowed_mentions: { parse: [], roles } });
  } catch (e) {
    console.error('Application alert failed', e); // The application itself is already saved.
    const { logEvent, LOG_COLORS } = await import('./audit-log.server');
    await logEvent({ title: 'Application alert failed to send', color: LOG_COLORS.bad, lines: [`**Application** ${application.form_title}`, `**Why** ${(e instanceof Error ? e.message : 'unknown error').slice(0, 300)}`] });
  }
}
export async function notifyLocalApplication(application: AlertApplication, origin: string, formRoles?: string[]) {
  try {
    const { readLocalDiscord } = await import('./local-store.server');
    const config = await readLocalDiscord();
    await sendLocalAlert('', applicationEmbeds(application, origin), formRoles?.length ? formRoles : config.app_role_ids[application.form_id] ?? [], 'applications', config.app_webhooks[application.form_id] ?? '');
  } catch (e) {
    console.error('Application alert failed', e);
    const { logEvent, LOG_COLORS } = await import('./audit-log.server');
    await logEvent({ title: 'Application alert failed to send', color: LOG_COLORS.bad, lines: [`**Application** ${application.form_title}`, `**Why** ${(e instanceof Error ? e.message : 'unknown error').slice(0, 300)}`] });
  }
}
export async function sendLocalTestApplicationAlert(me: { id: string; username: string } | null, origin: string) {
  return sendLocalAlert('', applicationEmbeds({ form_id: 'test', form_title: 'Example Application', discord_id: me?.id ?? '0', discord_username: me?.username ?? 'example', answers: { 'Example question': 'This is a test alert from the Apex application system.\nNo application was created.' }, created_at: new Date().toISOString() }, origin), [], 'applications');
}