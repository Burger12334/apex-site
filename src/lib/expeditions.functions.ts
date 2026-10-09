import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export type Expedition = { id: string; title: string; description: string; starts_at: string; leader: string; max_spots: number; created_at: string };
export type ExpeditionView = Expedition & { climbers: string[]; joined: boolean; full: boolean };
export type Climber = { id: string; discord_id: string; username: string; avatar_url: string; summits: number; note: string };

const snowflake = z.string().regex(/^\d{17,20}$/, 'Enter a valid Discord ID');
const expeditionInput = z.object({
  title: z.string().trim().min(1).max(120), description: z.string().trim().max(2000),
  starts_at: z.string().refine(v => !Number.isNaN(new Date(v).getTime()), 'Enter a valid date and time'),
  leader: z.string().trim().max(80), max_spots: z.number().int().min(0).max(500),
});

// Upcoming expeditions (and ones that started in the last six hours) with who has signed up.
// `local` tells the page whether staff changes are saved on this computer or in the database.
export const getExpeditions = createServerFn({ method: 'GET' }).handler(async () => {
  const { listExpeditions, listSignups } = await import('./expeditions.server');
  const { readSession } = await import('./discord.server'); const { localMode } = await import('./local-store.server');
  const [expeditions, signups, me] = await Promise.all([listExpeditions(), listSignups(), readSession()]);
  const cutoff = Date.now() - 6 * 3600000;
  const upcoming: ExpeditionView[] = expeditions.filter(e => new Date(e.starts_at).getTime() >= cutoff).map(e => {
    const mine = signups.filter(s => s.expedition_id === e.id);
    return { ...e, climbers: mine.map(s => s.discord_username), joined: !!me && mine.some(s => s.discord_id === me.id), full: e.max_spots > 0 && mine.length >= e.max_spots };
  });
  return { expeditions: upcoming, local: localMode() };
});

// Sign the linked Discord account up for an expedition, or take it off again.
export const toggleExpeditionSignup = createServerFn({ method: 'POST' }).inputValidator((d) => z.object({ id: z.string().uuid(), join: z.boolean() }).parse(d)).handler(async ({ data }) => {
  const { readSession } = await import('./discord.server');
  const me = await readSession();
  if (!me) throw new Error('Link your Discord to sign up.');
  const { listExpeditions, listSignups, setSignup } = await import('./expeditions.server');
  const expedition = (await listExpeditions()).find(e => e.id === data.id);
  if (!expedition) throw new Error('That expedition no longer exists.');
  if (data.join && expedition.max_spots > 0) {
    const taken = (await listSignups()).filter(s => s.expedition_id === data.id && s.discord_id !== me.id).length;
    if (taken >= expedition.max_spots) throw new Error('This expedition is full.');
  }
  await setSignup(data.id, me, data.join);
  const { logEvent, LOG_COLORS } = await import('./audit-log.server');
  await logEvent({ title: data.join ? 'Expedition sign-up' : 'Expedition sign-up cancelled', color: data.join ? LOG_COLORS.good : LOG_COLORS.info, lines: [`**Expedition** ${expedition.title}`, `**Climber** <@${me.id}> (${me.username})`] });
});

// Local test mode only: expeditions kept on this computer. Creating one announces it on Discord.
export const saveLocalExpedition = createServerFn({ method: 'POST' }).inputValidator((d) => expeditionInput.parse(d)).handler(async ({ data }) => {
  const { localMode, readLocalList, writeLocalList } = await import('./local-store.server');
  if (!localMode()) throw new Error('Only available in local test mode');
  const expedition: Expedition = { ...data, starts_at: new Date(data.starts_at).toISOString(), id: crypto.randomUUID(), created_at: new Date().toISOString() };
  await writeLocalList('expeditions', [...await readLocalList<Expedition>('expeditions'), expedition]);
  const { announceLocally } = await import('./expeditions.server'); const { currentOrigin } = await import('./discord.server');
  let announced = 'not set up';
  try { announced = await announceLocally(expedition, currentOrigin()) ? 'sent' : 'not set up'; } catch (e) { announced = `failed: ${e instanceof Error ? e.message.slice(0, 160) : 'unknown error'}`; }
  const { logEvent, LOG_COLORS, actorName } = await import('./audit-log.server');
  await logEvent({ title: 'Expedition created', color: LOG_COLORS.edit, lines: [`**Expedition** ${expedition.title}`, `**Announcement** ${announced}`], by: await actorName() });
  return { announced };
});
export const deleteLocalExpedition = createServerFn({ method: 'POST' }).inputValidator((d) => z.string().uuid().parse(d)).handler(async ({ data }) => {
  const { localMode, readLocalList, writeLocalList } = await import('./local-store.server');
  if (!localMode()) throw new Error('Only available in local test mode');
  const all = await readLocalList<Expedition>('expeditions');
  await writeLocalList('expeditions', all.filter(e => e.id !== data));
  await writeLocalList('expedition-signups', (await readLocalList<{ expedition_id: string }>('expedition-signups')).filter(s => s.expedition_id !== data));
  const { logEvent, LOG_COLORS, actorName } = await import('./audit-log.server');
  await logEvent({ title: 'Expedition deleted', color: LOG_COLORS.bad, lines: [`**Expedition** ${all.find(e => e.id === data)?.title ?? data}`], by: await actorName() });
});

// Live site: an editor announces an expedition they just created. Posts to the expeditions channel
// (discord_settings.events_channel_id, migration 0011) through the bot; does nothing if no channel is set.
export const announceExpedition = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((d) => z.string().uuid().parse(d)).handler(async ({ data, context }) => {
  const { data: role } = await context.supabase.rpc('apex_role');
  if (!['owner', 'editor'].includes(role ?? '')) throw new Error('Editor access required');
  const { listExpeditions, expeditionAnnouncement } = await import('./expeditions.server');
  const expedition = (await listExpeditions()).find(e => e.id === data);
  if (!expedition) throw new Error('Expedition not found.');
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data: settings } = await supabaseAdmin.from('discord_settings').select('*').eq('id', 'main').maybeSingle();
  const channel = (settings as { events_channel_id?: string } | null)?.events_channel_id;
  if (!channel) return { announced: 'not set up' };
  const { discordFetch } = await import('./community.server'); const { currentOrigin } = await import('./discord.server');
  await discordFetch(`channels/${channel}/messages`, expeditionAnnouncement(expedition, currentOrigin()));
  return { announced: 'sent' };
});

// The hall of fame: climbers ranked by summits.
export const getHallOfFame = createServerFn({ method: 'GET' }).handler(async () => {
  const { listClimbers } = await import('./expeditions.server');
  return listClimbers();
});
// Local test mode only: add a climber by Discord ID, or update their summit count if they are already listed.
export const saveLocalClimber = createServerFn({ method: 'POST' }).inputValidator((d) => z.object({ discord_id: snowflake, summits: z.number().int().min(0).max(100000), note: z.string().trim().max(120) }).parse(d)).handler(async ({ data }) => {
  const { localMode, readLocalList, writeLocalList } = await import('./local-store.server');
  if (!localMode()) throw new Error('Only available in local test mode');
  const { findDiscordUser } = await import('./community.server');
  const user = await findDiscordUser(data.discord_id);
  if (!user) throw new Error('No Discord user has that ID.');
  const all = await readLocalList<Climber>('hall-of-fame');
  const existing = all.find(c => c.discord_id === user.id);
  const climber: Climber = { id: existing?.id ?? crypto.randomUUID(), discord_id: user.id, username: user.display_name, avatar_url: user.avatar_url, summits: data.summits, note: data.note };
  await writeLocalList('hall-of-fame', existing ? all.map(c => c.id === existing.id ? climber : c) : [...all, climber]);
  const { logEvent, LOG_COLORS, actorName } = await import('./audit-log.server');
  await logEvent({ title: existing ? 'Hall of fame updated' : 'Added to the hall of fame', color: LOG_COLORS.edit, lines: [`**Climber** <@${user.id}> (${user.username})`, `**Summits** ${data.summits}`], by: await actorName() });
});
export const deleteLocalClimber = createServerFn({ method: 'POST' }).inputValidator((d) => z.string().uuid().parse(d)).handler(async ({ data }) => {
  const { localMode, readLocalList, writeLocalList } = await import('./local-store.server');
  if (!localMode()) throw new Error('Only available in local test mode');
  const all = await readLocalList<Climber>('hall-of-fame');
  await writeLocalList('hall-of-fame', all.filter(c => c.id !== data));
  const { logEvent, LOG_COLORS, actorName } = await import('./audit-log.server');
  await logEvent({ title: 'Removed from the hall of fame', color: LOG_COLORS.bad, lines: [`**Climber** ${all.find(c => c.id === data)?.username ?? data}`], by: await actorName() });
});
