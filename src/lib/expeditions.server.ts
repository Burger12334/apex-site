// Storage for expeditions, their sign-ups and the hall of fame.
// Local test mode: JSON files in .local-data/. Live: tables from migration 0011, read with the service role.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Climber, Expedition } from './expeditions.functions';

export type Signup = { expedition_id: string; discord_id: string; discord_username: string; created_at: string };

async function db() {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  return supabaseAdmin as unknown as SupabaseClient;
}
async function local() { return import('./local-store.server'); }

// Until migration 0011 has run the live tables do not exist; the pages then simply show nothing yet.
async function rows<T>(table: string, order: string): Promise<T[]> {
  const { data, error } = await (await db()).from(table).select('*').order(order);
  if (error) { console.error(`${table}: ${error.message}`); return []; }
  return (data ?? []) as T[];
}

export async function listExpeditions(): Promise<Expedition[]> {
  const store = await local();
  const all = store.localMode() ? await store.readLocalList<Expedition>('expeditions') : await rows<Expedition>('expeditions', 'starts_at');
  return all.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}
export async function listSignups(): Promise<Signup[]> {
  const store = await local();
  return store.localMode() ? store.readLocalList<Signup>('expedition-signups') : rows<Signup>('expedition_signups', 'created_at');
}
export async function setSignup(expeditionId: string, me: { id: string; username: string }, join: boolean) {
  const store = await local();
  if (store.localMode()) {
    const others = (await store.readLocalList<Signup>('expedition-signups')).filter(s => !(s.expedition_id === expeditionId && s.discord_id === me.id));
    await store.writeLocalList('expedition-signups', join ? [...others, { expedition_id: expeditionId, discord_id: me.id, discord_username: me.username, created_at: new Date().toISOString() }] : others);
    return;
  }
  const client = await db();
  const { error } = join
    ? await client.from('expedition_signups').upsert({ expedition_id: expeditionId, discord_id: me.id, discord_username: me.username }, { onConflict: 'expedition_id,discord_id' })
    : await client.from('expedition_signups').delete().eq('expedition_id', expeditionId).eq('discord_id', me.id);
  if (error) throw new Error(error.message);
}

export async function listClimbers(): Promise<Climber[]> {
  const store = await local();
  const all = store.localMode() ? await store.readLocalList<Climber>('hall-of-fame') : await rows<Climber>('hall_of_fame', 'summits');
  return all.sort((a, b) => b.summits - a.summits || a.username.localeCompare(b.username));
}

// The Discord post announcing a new expedition.
export function expeditionAnnouncement(expedition: Expedition, origin: string) {
  const at = Math.floor(new Date(expedition.starts_at).getTime() / 1000);
  return { embeds: [{ color: 0xf59e0b, title: `🏔️ New expedition: ${expedition.title}`.slice(0, 250), description: [
    `**When** <t:${at}:F> (<t:${at}:R>)`,
    expedition.leader && `**Leader** ${expedition.leader}`,
    `**Spots** ${expedition.max_spots > 0 ? expedition.max_spots : 'Open to everyone'}`,
    expedition.description && `\n${expedition.description.slice(0, 1500)}`,
    `\n**[Sign up on the site](${origin}/expeditions)**`,
  ].filter(Boolean).join('\n') }], allowed_mentions: { parse: [] } };
}
// Local test mode: posts to the expeditions webhook from the Discord settings. False when none is set.
// Own storage: the announcement as a plain message, the way staff write it by hand: a big title, the ping,
// each server link, then the Discord event and invite links. Discord turns the event
// link into its own event card with the Join button.
// People picked by Discord ID show as mentions (nobody is pinged by them); typed names stay as text.
const crew = (members: { id: string; username: string }[] | undefined, fallback: string) => members?.length ? members.map(p => p.id ? `<@${p.id}>` : p.username).join(', ') : fallback;
export function expeditionMessage(expedition: Expedition, origin: string, kind: 'new' | 'starting', roles: string[], invite: string) {
  const at = Math.floor(new Date(expedition.starts_at).getTime() / 1000);
  const servers = (expedition.servers ?? []).map((s, i) => `Server ${i + 1}: ${s.url}`);
  return [
    `# ${expedition.title}${kind === 'starting' ? ' Starting Now!' : ''}`,
    roles.map(r => `<@&${r}>`).join(' '),
    kind === 'new' && `Starts <t:${at}:F> (<t:${at}:R>)`,
    kind === 'new' && expedition.guides && `Guides: ${crew(expedition.guide_members, expedition.guides)}`,
    kind === 'new' && expedition.sherpas && `Sherpas: ${crew(expedition.sherpa_members, expedition.sherpas)}`,
    kind === 'new' && !expedition.guides && !expedition.sherpas && expedition.leader && `Led by ${expedition.leader}`,
    kind === 'new' && expedition.description && expedition.description.slice(0, 1200),
    servers.join('\n'),
    expedition.event_url,
    invite,
    kind === 'new' && `Sign up: ${origin}/expeditions`,
  ].filter(Boolean).join('\n').slice(0, 1990);
}
// The server invite from the site settings (control room), for the end of the announcement.
async function discordInvite() {
  try {
    const saved = await (await import('./storage.server')).readJson<{ settings?: { discord_url?: string } } | null>('site.json', null);
    if (saved?.settings) return saved.settings.discord_url ?? '';
    const url = process.env['SUPABASE_URL']; const key = process.env['SUPABASE_PUBLISHABLE_KEY'];
    if (!url || !key) return '';
    const response = await fetch(`${url}/rest/v1/site_settings?id=eq.main&select=discord_url`, { headers: { apikey: key } });
    return response.ok ? ((await response.json()) as { discord_url?: string }[])[0]?.discord_url ?? '' : '';
  } catch { return ''; }
}
let pingRoles: { at: number; ids: string[] } | undefined;
async function expeditionPingRoles() {
  if (pingRoles && Date.now() - pingRoles.at < 600000) return pingRoles.ids;
  try {
    const { discordFetch, roleGuild } = await import('./community.server');
    const all = await discordFetch(`guilds/${await roleGuild()}/roles`) as { id: string; name: string }[];
    pingRoles = { at: Date.now(), ids: all.filter(r => /^expedition pings?$/i.test(r.name.trim())).map(r => r.id) };
    return pingRoles.ids;
  } catch { return pingRoles?.ids ?? []; }
}
export async function announceLocally(expedition: Expedition, origin: string, kind: 'new' | 'starting' = 'new') {
  const config = await (await local()).readLocalDiscord();
  const rule = (await import('./notify')).notifyRule(config, 'expedition_new');
  const url = config.events_webhook_url;
  if (!url || !rule.on) return false;
  // Expeditions always ping the server's "Expedition Pings" role (found by name), unless quiet mode is on.
  const roles = config.quiet ? [] : await expeditionPingRoles();
  const body = { content: expeditionMessage(config.event_links ? expedition : { ...expedition, event_url: '' }, origin, kind, roles, await discordInvite()), allowed_mentions: { parse: [], roles } };
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Discord [${response.status}]: ${await response.text()}`);
  return true;
}

// The Discord server's own scheduled events (the ones made with "Create Event"), shown on the Expeditions page
// when that option is on. Read with the bot; kept for a minute so page loads do not hammer Discord.
export type EventPerson = { id: string; username: string; avatar_url: string };
// What staff add to a Discord event on the site, since Discord has no place for it.
export type EventDetails = { guide_members: EventPerson[]; sherpa_members: EventPerson[]; servers: { url: string }[] };
export type DiscordEvent = { id: string; name: string; description: string; starts_at: string; live: boolean; interested: number; image_url: string; url: string; location: string; attendees: EventPerson[] } & EventDetails;
const noDetails = (): EventDetails => ({ guide_members: [], sherpa_members: [], servers: [] });
// What staff saved on the site wins; anything they left empty is filled from the Discord announcement.
async function mergedDetails(guild: string, id: string, saved: EventDetails | undefined): Promise<EventDetails> {
  const auto = await (await import('./announcements.server')).detailsFromAnnouncement(guild, id) ?? noDetails();
  const pick = <T,>(mine: T[] | undefined, theirs: T[]) => mine?.length ? mine : theirs;
  return { guide_members: pick(saved?.guide_members, auto.guide_members), sherpa_members: pick(saved?.sherpa_members, auto.sherpa_members), servers: pick(saved?.servers, auto.servers) };
}
export async function readEventDetails() { return (await import('./storage.server')).readJson<Record<string, EventDetails>>('event-details.json', {}); }
export async function saveEventDetails(id: string, details: EventDetails) {
  const all = await readEventDetails(); all[id] = details;
  await (await import('./storage.server')).writeJson('event-details.json', all);
  // The copy in memory is updated in place, so the change shows without asking Discord again.
  const cached = eventCache?.events.find(e => e.id === id); if (cached) Object.assign(cached, details);
}
let eventCache: { at: number; events: DiscordEvent[] } | undefined;
let eventFailedAt = 0; let eventPending: Promise<DiscordEvent[]> | undefined;
export async function listDiscordEvents(): Promise<DiscordEvent[]> {
  const { localMode, readLocalDiscord } = await import('./local-store.server');
  if (!localMode() || !(await readLocalDiscord()).discord_events) return [];
  if (eventCache && Date.now() - eventCache.at < 120000) return eventCache.events;
  // Discord limits this lookup tightly: after a refusal the last good copy is shown for half a minute before
  // asking again, and page loads that arrive together share one request.
  if (Date.now() - eventFailedAt < 30000) return eventCache?.events ?? [];
  if (eventPending) return eventPending;
  eventPending = (async () => {
  try {
    const { discordFetch, roleGuild, avatarUrl } = await import('./community.server');
    const guild = await roleGuild(); const details = await readEventDetails();
    const raw = await discordFetch(`guilds/${guild}/scheduled-events?with_user_count=true`) as { id: string; name: string; description?: string | null; scheduled_start_time: string; status: number; user_count?: number; image?: string | null; entity_metadata?: { location?: string } | null }[];
    // Status 1 is scheduled and 2 is live; finished and cancelled events are left out.
    const events: DiscordEvent[] = [];
    for (const e of raw.filter(e => e.status === 1 || e.status === 2)) {
      // Everyone who pressed "Interested" on the event in Discord (the first hundred).
      let attendees: EventPerson[] = [];
      try {
        const users = await discordFetch(`guilds/${guild}/scheduled-events/${e.id}/users?limit=100&with_member=true`) as { user: { id: string; username: string; global_name?: string | null; avatar: string | null }; member?: { nick?: string | null } }[];
        attendees = users.map(u => ({ id: u.user.id, username: u.member?.nick || u.user.global_name || u.user.username, avatar_url: avatarUrl(u.user) }));
      } catch { /* the count still shows */ }
      events.push({ id: e.id, name: e.name, description: e.description ?? '', starts_at: e.scheduled_start_time, live: e.status === 2, interested: e.user_count ?? attendees.length, image_url: e.image ? `https://cdn.discordapp.com/guild-events/${e.id}/${e.image}.png?size=512` : '', url: `https://discord.com/events/${guild}/${e.id}`, location: e.entity_metadata?.location ?? '', attendees, ...await mergedDetails(guild, e.id, details[e.id]) });
    }
    events.sort((a, b) => Number(b.live) - Number(a.live) || a.starts_at.localeCompare(b.starts_at));
    eventCache = { at: Date.now(), events };
    return events;
  } catch { eventFailedAt = Date.now(); return eventCache?.events ?? []; } finally { eventPending = undefined; }
  })();
  return eventPending;
}
