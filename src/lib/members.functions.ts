import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

// Who may open the member search: staff and signed-in admins always; otherwise anyone when staff made it
// public, or people who linked a Discord account that is in the server (the same people who can already see
// the member list inside Discord).
async function viewer(): Promise<{ ok: boolean; why: '' | 'link' | 'not-member' }> {
  const { readSession } = await import('./discord.server'); const { accessFor } = await import('./staff.server');
  const { localMode, readLocalDiscord } = await import('./local-store.server');
  const me = await readSession();
  if (localMode()) { if ((await accessFor(me)).staff || (await readLocalDiscord()).members_public) return { ok: true, why: '' }; }
  if (!me) return { ok: false, why: 'link' };
  const { isServerMember } = await import('./members.server');
  return await isServerMember(me.id) ? { ok: true, why: '' } : { ok: false, why: 'not-member' };
}

// The whole server grouped by role, highest first.
export const getMembers = createServerFn({ method: 'GET' }).handler(async () => {
  const access = await viewer();
  if (!access.ok) return { ...access, listed: false, groups: [], total: 0 };
  const { memberGroups } = await import('./members.server');
  try { return { ...access, ...await memberGroups() }; } catch { return { ...access, listed: false, groups: [], total: 0 }; }
});

export const searchMembers = createServerFn({ method: 'POST' }).inputValidator((d) => z.string().trim().min(2).max(40).parse(d)).handler(async ({ data }) => {
  if (!(await viewer()).ok) return [];
  const { findMembers } = await import('./members.server');
  try { return await findMembers(data); } catch { return []; }
});

// Turns a Discord user ID into that person's name and picture, for the ID boxes around the site.
// Open to staff and to anyone who has linked their own Discord.
export const discordPerson = createServerFn({ method: 'POST' }).inputValidator((d) => z.string().regex(/^\d{17,20}$/, 'Enter a valid Discord ID').parse(d)).handler(async ({ data }) => {
  const { readSession } = await import('./discord.server'); const { accessFor } = await import('./staff.server');
  const me = await readSession();
  if (!me && !(await accessFor(null)).staff) throw new Error('Link your Discord to look people up.');
  const { findDiscordUser } = await import('./community.server');
  const user = await findDiscordUser(data);
  return user ? { id: user.id, username: user.username, name: user.display_name, avatar_url: user.avatar_url } : null;
});
