// The Discord server's members for the member search page, read with the bot.
// Listing everyone needs the bot's "Server Members Intent" (Discord developer portal -> Bot); without it only
// searching by name or ID works, and `listed` is false so the page can say so.
import type { DiscordRole } from './community.functions';

export type Member = { id: string; username: string; name: string; avatar_url: string; group: string; role: DiscordRole | null };
export type MemberGroup = { id: string; name: string; color: string; icon_url: string; emoji: string; members: Member[] };

type RawRole = { id: string; name: string; position: number; color: number; hoist: boolean; icon?: string | null; unicode_emoji?: string | null };
type RawMember = { user?: { id: string; username: string; global_name?: string | null; avatar: string | null; bot?: boolean }; nick?: string | null; roles: string[] };

const TTL = 600000;
let roleCache: { at: number; guild: string; roles: RawRole[] } | undefined;
let memberCache: { at: number; guild: string; members: RawMember[] | null } | undefined;

async function api() { const { discordFetch, roleGuild, avatarUrl } = await import('./community.server'); return { discordFetch, avatarUrl, guild: await roleGuild() }; }

async function roles() {
  const { discordFetch, guild } = await api();
  if (roleCache && roleCache.guild === guild && Date.now() - roleCache.at < TTL) return roleCache.roles;
  const all = (await discordFetch(`guilds/${guild}/roles`) as RawRole[]).sort((a, b) => b.position - a.position);
  roleCache = { at: Date.now(), guild, roles: all };
  return all;
}

// Everyone in the server, or null when Discord refuses the list (the members intent is off).
async function everyone(): Promise<RawMember[] | null> {
  const { discordFetch, guild } = await api();
  if (memberCache && memberCache.guild === guild && Date.now() - memberCache.at < TTL) return memberCache.members;
  let members: RawMember[] | null = [];
  try {
    let after = '0';
    for (let page = 0; page < 25; page++) {
      const batch = await discordFetch(`guilds/${guild}/members?limit=1000&after=${after}`) as RawMember[];
      members.push(...batch);
      if (batch.length < 1000) break;
      after = batch[batch.length - 1]?.user?.id ?? after;
    }
  } catch (e) {
    if (!(e instanceof Error && /\[403\]/.test(e.message))) throw e;
    members = null;
  }
  memberCache = { at: Date.now(), guild, members };
  return members;
}

const hex = (color: number) => color ? `#${color.toString(16).padStart(6, '0')}` : '';
const badge = (r: RawRole): DiscordRole => ({ name: r.name, color: hex(r.color), icon_url: r.icon ? `https://cdn.discordapp.com/role-icons/${r.id}/${r.icon}.png?size=64` : '', emoji: r.unicode_emoji ?? '' });

async function shape(raw: RawMember[]): Promise<{ members: Member[]; all: RawRole[] }> {
  const all = await roles(); const { avatarUrl } = await api();
  const members = raw.filter(m => m.user && !m.user.bot).map(m => {
    const user = m.user!; const held = all.filter(r => m.roles.includes(r.id));
    // Like Discord's own member list: grouped under the highest role that is set to display separately.
    return { id: user.id, username: user.username, name: m.nick || user.global_name || user.username, avatar_url: avatarUrl(user), group: held.find(r => r.hoist)?.id ?? '', role: held[0] ? badge(held[0]) : null };
  });
  return { members, all };
}

// Everyone grouped by role, highest role first. `listed` is false when Discord would not hand over the list.
export async function memberGroups(): Promise<{ listed: boolean; groups: MemberGroup[]; total: number }> {
  const raw = await everyone();
  if (!raw) return { listed: false, groups: [], total: 0 };
  const { members, all } = await shape(raw);
  const byName = (a: Member, b: Member) => a.name.localeCompare(b.name);
  const groups: MemberGroup[] = all.filter(r => r.hoist).map(r => ({ id: r.id, ...badge(r), members: members.filter(m => m.group === r.id).sort(byName) })).filter(g => g.members.length > 0);
  const rest = members.filter(m => !m.group).sort(byName);
  if (rest.length) groups.push({ id: 'none', name: 'Members', color: '', icon_url: '', emoji: '', members: rest });
  return { listed: true, groups, total: members.length };
}

// Search by Discord ID, or by the start of a username or nickname.
export async function findMembers(query: string): Promise<Member[]> {
  const { discordFetch, guild } = await api();
  let raw: RawMember[] = [];
  if (/^\d{17,20}$/.test(query)) {
    try { raw = [await discordFetch(`guilds/${guild}/members/${query}`) as RawMember]; } catch (e) { if (!(e instanceof Error && /\[404\]/.test(e.message))) throw e; }
  } else raw = await discordFetch(`guilds/${guild}/members/search?query=${encodeURIComponent(query)}&limit=50`) as RawMember[];
  return (await shape(raw)).members;
}

export async function isServerMember(userId: string) {
  const { discordFetch, guild } = await api();
  try { await discordFetch(`guilds/${guild}/members/${userId}`); return true; } catch { return false; }
}
