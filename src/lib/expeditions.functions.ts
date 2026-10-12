import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export type ExpeditionServer = { url: string };
// Someone picked by Discord ID (id set, with their picture) or typed as a plain name (id empty).
export type ExpeditionPerson = { id: string; username: string; avatar_url: string };
// guides and sherpas (who is running it), servers (Roblox private server links) and event_url (the Discord
// event) are optional extras. leader is the older single-name field and is still shown when it is all there is.
export type Expedition = { id: string; title: string; description: string; starts_at: string; leader: string; max_spots: number; created_at: string; guides?: string; sherpas?: string; guide_members?: ExpeditionPerson[]; sherpa_members?: ExpeditionPerson[]; servers?: ExpeditionServer[]; event_url?: string };
export type ExpeditionView = Expedition & { climbers: string[]; joined: boolean; full: boolean };
export type Climber = { id: string; discord_id: string; username: string; avatar_url: string; summits: number; note: string };

const snowflake = z.string().regex(/^\d{17,20}$/, 'Enter a valid Discord ID');
const person = z.object({ id: z.string().regex(/^(\d{17,20})?$/), username: z.string().trim().min(1).max(60), avatar_url: z.string().max(300).regex(/^(https:\/\/cdn\.discordapp\.com\/\S+)?$/) });
const expeditionInput = z.object({
  title: z.string().trim().min(1).max(120), description: z.string().trim().max(2000),
  starts_at: z.string().refine(v => !Number.isNaN(new Date(v).getTime()), 'Enter a valid date and time'),
  leader: z.string().trim().max(80), max_spots: z.number().int().min(0).max(500),
  guides: z.string().trim().max(200).default(''), sherpas: z.string().trim().max(200).default(''),
  guide_members: z.array(person).max(20).default([]), sherpa_members: z.array(person).max(20).default([]),
  servers: z.array(z.object({ url: z.string().trim().regex(/^https:\/\/(www\.)?roblox\.com\/\S+$/, 'Server links must be roblox.com links') })).max(8).default([]),
  event_url: z.string().trim().regex(/^(https:\/\/(www\.)?discord\.com\/events\/\d+\/\d+)?$/, 'Paste the Discord event link (discord.com/events/...)').default(''),
});

// Upcoming expeditions (and ones that started in the last six hours) with who has signed up.
// `local` tells the page whether staff changes are saved on this computer or in the database.
export const getExpeditions = createServerFn({ method: 'GET' }).handler(async () => {
  const { listExpeditions, listSignups, listDiscordEvents } = await import('./expeditions.server');
  const { readSession } = await import('./discord.server'); const { localMode, readLocalDiscord } = await import('./local-store.server');
  const [expeditions, signups, me, events] = await Promise.all([listExpeditions(), listSignups(), readSession(), listDiscordEvents()]);
  // Staff can switch Discord event links off for the whole site.
  const eventLinks = !localMode() || (await readLocalDiscord()).event_links;
  const cutoff = Date.now() - 6 * 3600000;
  const upcoming: ExpeditionView[] = expeditions.filter(e => new Date(e.starts_at).getTime() >= cutoff).map(e => {
    const mine = signups.filter(s => s.expedition_id === e.id);
    return { ...e, event_url: eventLinks ? e.event_url ?? '' : '', climbers: mine.map(s => s.discord_username), joined: !!me && mine.some(s => s.discord_id === me.id), full: e.max_spots > 0 && mine.length >= e.max_spots };
  });
  return { expeditions: upcoming, events, eventLinks, local: localMode() };
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
  if (!localMode()) throw new Error('Not available while the site is connected to the database.');
  await (await import('./staff.server')).requireStaff();
  const names = (list: ExpeditionPerson[]) => list.map(p => p.username).join(', ');
  const expedition: Expedition = { ...data, guides: data.guides || names(data.guide_members), sherpas: data.sherpas || names(data.sherpa_members), starts_at: new Date(data.starts_at).toISOString(), id: crypto.randomUUID(), created_at: new Date().toISOString() };
  await writeLocalList('expeditions', [...await readLocalList<Expedition>('expeditions'), expedition]);
  const { announceLocally } = await import('./expeditions.server'); const { currentOrigin } = await import('./discord.server');
  let announced = 'not set up';
  try { announced = await announceLocally(expedition, currentOrigin()) ? 'sent' : 'not set up'; } catch (e) { announced = `failed: ${e instanceof Error ? e.message.slice(0, 160) : 'unknown error'}`; }
  const { logEvent, LOG_COLORS, actorName } = await import('./audit-log.server');
  await logEvent({ title: 'Expedition created', color: LOG_COLORS.edit, lines: [`**Expedition** ${expedition.title}`, `**Announcement** ${announced}`], by: await actorName() });
  return { announced };
});
// Own storage: staff post the "Starting Now!" message for an expedition, with its server links and Discord event.
export const announceExpeditionStart = createServerFn({ method: 'POST' }).inputValidator((d) => z.string().uuid().parse(d)).handler(async ({ data }) => {
  const { localMode, readLocalList } = await import('./local-store.server');
  if (!localMode()) throw new Error('Not available while the site is connected to the database.');
  await (await import('./staff.server')).requireStaff();
  const expedition = (await readLocalList<Expedition>('expeditions')).find(e => e.id === data);
  if (!expedition) throw new Error('That expedition no longer exists.');
  const { announceLocally } = await import('./expeditions.server'); const { currentOrigin } = await import('./discord.server');
  let announced = 'not set up';
  try { announced = await announceLocally(expedition, currentOrigin(), 'starting') ? 'sent' : 'not set up'; } catch (e) { announced = `failed: ${e instanceof Error ? e.message.slice(0, 160) : 'unknown error'}`; }
  const { logEvent, LOG_COLORS, actorName } = await import('./audit-log.server');
  await logEvent({ title: 'Expedition start announced', color: LOG_COLORS.good, lines: [`**Expedition** ${expedition.title}`, `**Announcement** ${announced}`], by: await actorName() });
  return { announced };
});
// Own storage: staff add guides, sherpas and Roblox server links to an event that was made in Discord.
const eventDetails = z.object({ id: z.string().regex(/^\d{17,20}$/), guide_members: z.array(person).max(20), sherpa_members: z.array(person).max(20), servers: z.array(z.object({ url: z.string().trim().regex(/^https:\/\/(www\.)?roblox\.com\/\S+$/, 'Server links must be roblox.com links') })).max(8) });
export const saveDiscordEventDetails = createServerFn({ method: 'POST' }).inputValidator((d) => eventDetails.parse(d)).handler(async ({ data: { id, ...details } }) => {
  const { localMode } = await import('./local-store.server');
  if (!localMode()) throw new Error('Not available while the site is connected to the database.');
  await (await import('./staff.server')).requireStaff();
  const { saveEventDetails, listDiscordEvents } = await import('./expeditions.server');
  const event = (await listDiscordEvents()).find(e => e.id === id);
  await saveEventDetails(id, details);
  const { logEvent, LOG_COLORS, actorName } = await import('./audit-log.server');
  await logEvent({ title: 'Discord event details updated', color: LOG_COLORS.edit, lines: [`**Event** ${event?.name ?? id}`, `**Guides** ${details.guide_members.length}`, `**Sherpas** ${details.sherpa_members.length}`, `**Servers** ${details.servers.length}`], by: await actorName() });
});
// Own storage: the "Starting Now!" post for an event that was made in Discord.
export const announceDiscordEventStart = createServerFn({ method: 'POST' }).inputValidator((d) => z.string().regex(/^\d{17,20}$/).parse(d)).handler(async ({ data }) => {
  const { localMode } = await import('./local-store.server');
  if (!localMode()) throw new Error('Not available while the site is connected to the database.');
  await (await import('./staff.server')).requireStaff();
  const { announceLocally, listDiscordEvents } = await import('./expeditions.server'); const { currentOrigin } = await import('./discord.server');
  const event = (await listDiscordEvents()).find(e => e.id === data);
  if (!event) throw new Error('That Discord event is no longer listed.');
  const expedition: Expedition = { id: event.id, title: event.name, description: event.description, starts_at: event.starts_at, leader: '', max_spots: 0, created_at: '', servers: event.servers, event_url: event.url };
  let announced = 'not set up';
  try { announced = await announceLocally(expedition, currentOrigin(), 'starting') ? 'sent' : 'not set up'; } catch (e) { announced = `failed: ${e instanceof Error ? e.message.slice(0, 160) : 'unknown error'}`; }
  const { logEvent, LOG_COLORS, actorName } = await import('./audit-log.server');
  await logEvent({ title: 'Expedition start announced', color: LOG_COLORS.good, lines: [`**Discord event** ${event.name}`, `**Announcement** ${announced}`], by: await actorName() });
  return { announced };
});
export const deleteLocalExpedition = createServerFn({ method: 'POST' }).inputValidator((d) => z.string().uuid().parse(d)).handler(async ({ data }) => {
  const { localMode, readLocalList, writeLocalList } = await import('./local-store.server');
  if (!localMode()) throw new Error('Not available while the site is connected to the database.');
  await (await import('./staff.server')).requireStaff();
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
  if (!localMode()) throw new Error('Not available while the site is connected to the database.');
  await (await import('./staff.server')).requireStaff();
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
  if (!localMode()) throw new Error('Not available while the site is connected to the database.');
  await (await import('./staff.server')).requireStaff();
  const all = await readLocalList<Climber>('hall-of-fame');
  await writeLocalList('hall-of-fame', all.filter(c => c.id !== data));
  const { logEvent, LOG_COLORS, actorName } = await import('./audit-log.server');
  await logEvent({ title: 'Removed from the hall of fame', color: LOG_COLORS.bad, lines: [`**Climber** ${all.find(c => c.id === data)?.username ?? data}`], by: await actorName() });
});
