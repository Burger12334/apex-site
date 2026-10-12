// Fills in a Discord event's guides, sherpas and Roblox servers from the announcement staff post about it.
// The bot reads the announcement channels it is allowed to see, finds the message that links the event, and
// reads its "Guides:", "Sherpas:" and server lines. Names without a mention are searched in the server.
import type { EventDetails, EventPerson } from './expeditions.server';

type Mention = { id: string; username: string; global_name?: string | null; avatar: string | null };
type RawMessage = { content: string; mentions?: Mention[] };
type Token = { id: string; name: string };

const EMPTY = /^(tbd|tba|n\/?a|none|no one|nobody|-+|\?+)$/i;

// The people named on a "Guides:" or "Sherpas:" line: mentions by ID, anything else as a typed name.
function people(content: string, label: string): Token[] {
  const line = new RegExp(`^[\\s>*_~#-]*${label}s?[\\s*_]*[:\\-][\\s*_]*(.+)$`, 'im').exec(content)?.[1] ?? '';
  const ids = [...line.matchAll(/<@!?(\d{17,20})>/g)].map(m => ({ id: m[1] ?? '', name: '' }));
  const names = line.replace(/<@!?\d{17,20}>/g, ',').replace(/\bn\/a\b/gi, ',').split(/,|&|\/|\band\b/i).map(s => s.replace(/[*_~`]/g, '').trim().replace(/^@/, '')).filter(s => s && !EMPTY.test(s)).map(name => ({ id: '', name }));
  return [...ids, ...names];
}
export function parseAnnouncement(content: string) {
  const servers = [...new Set([...content.matchAll(/https:\/\/(?:www\.)?roblox\.com\/[^\s<>)\]]+/g)].map(m => m[0]))].map(url => ({ url }));
  return { guides: people(content, 'guide'), sherpas: people(content, 'sherpa'), servers };
}

const TTL = 120000;
let channelCache: { at: number; guild: string; ids: string[] } | undefined;
let messageCache: { at: number; guild: string; messages: RawMessage[] } | undefined;
const blocked = new Map<string, number>();
const found = new Map<string, EventPerson | null>();

// Recent messages that link a Discord event, newest first, from the channels staff announce in.
async function eventMessages(guild: string): Promise<RawMessage[]> {
  if (messageCache && messageCache.guild === guild && Date.now() - messageCache.at < TTL) return messageCache.messages;
  const { discordFetch } = await import('./community.server');
  if (!channelCache || channelCache.guild !== guild || Date.now() - channelCache.at > 600000) {
    const all = await discordFetch(`guilds/${guild}/channels`) as { id: string; name: string; type: number }[];
    channelCache = { at: Date.now(), guild, ids: all.filter(c => (c.type === 0 || c.type === 5) && /event|exped|shout|announce/i.test(c.name) && !/log|command|cmd|staff/i.test(c.name)).slice(0, 6).map(c => c.id) };
  }
  const messages: RawMessage[] = [];
  for (const id of channelCache.ids) {
    // A channel the bot may not read is left alone for ten minutes rather than asked again on every refresh.
    if (Date.now() - (blocked.get(id) ?? 0) < 600000) continue;
    try { messages.push(...(await discordFetch(`channels/${id}/messages?limit=50`) as RawMessage[]).filter(m => /discord\.com\/events\//.test(m.content ?? ''))); }
    catch { blocked.set(id, Date.now()); }
  }
  messageCache = { at: Date.now(), guild, messages };
  return messages;
}

async function resolve(token: Token, mentions: Mention[], guild: string): Promise<EventPerson> {
  const { discordFetch, avatarUrl } = await import('./community.server');
  const mentioned = mentions.find(m => m.id === token.id);
  const key = token.id || `name:${token.name.toLowerCase()}`;
  if (!found.has(key)) {
    let person: EventPerson | null = null;
    try {
      if (token.id) {
        // Shown under the name they use in the server (their nickname) when they are still in it.
        const member = await (discordFetch(`guilds/${guild}/members/${token.id}`) as Promise<{ user: Mention; nick?: string | null }>).catch(() => null);
        const u = member?.user ?? mentioned ?? await discordFetch(`users/${token.id}`) as Mention;
        person = { id: u.id, username: member?.nick || u.global_name || u.username, avatar_url: avatarUrl(u) };
      }
      else {
        // A typed name: the server member whose username or nickname starts with it.
        const hits = await discordFetch(`guilds/${guild}/members/search?query=${encodeURIComponent(token.name)}&limit=5`) as { user: Mention; nick?: string | null }[];
        const exact = hits.find(h => [h.user.username, h.user.global_name, h.nick].some(n => n?.toLowerCase() === token.name.toLowerCase())) ?? (hits.length === 1 ? hits[0] : undefined);
        if (exact) person = { id: exact.user.id, username: exact.nick || exact.user.global_name || exact.user.username, avatar_url: avatarUrl(exact.user) };
      }
    } catch { /* shown as typed */ }
    found.set(key, person);
  }
  return found.get(key) ?? { id: '', username: token.name || 'Unknown', avatar_url: '' };
}

// What the newest announcement about this event says, or null when none was found (or none can be read).
export async function detailsFromAnnouncement(guild: string, eventId: string): Promise<EventDetails | null> {
  try {
    const message = (await eventMessages(guild)).find(m => m.content.includes(`/events/${guild}/${eventId}`));
    if (!message) return null;
    const parsed = parseAnnouncement(message.content); const mentions = message.mentions ?? [];
    const list = async (tokens: Token[]) => { const out: EventPerson[] = []; for (const t of tokens.slice(0, 20)) out.push(await resolve(t, mentions, guild)); return out; };
    return { guide_members: await list(parsed.guides), sherpa_members: await list(parsed.sherpas), servers: parsed.servers.slice(0, 8) };
  } catch { return null; }
}
