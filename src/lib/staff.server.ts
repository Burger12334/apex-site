// Who counts as staff when the site runs on its own storage (no database service key).
// Staff are Discord accounts: the owner IDs in APEX_ADMIN_DISCORD_IDS, plus anyone holding one of the
// staff roles chosen in the Discord settings. Supervision (report reviewers) is staff plus the supervision roles.
// An admin signed in with Google (an email listed in APEX_ADMIN_EMAILS) has full access too.
import type { DiscordUser } from './discord.server';

export type Access = { staff: boolean; supervisor: boolean };

const ownerIds = () => (process.env['APEX_ADMIN_DISCORD_IDS'] ?? '').split(/[\s,]+/).filter(Boolean);

export async function accessFor(me: DiscordUser | null): Promise<Access> {
  const { readLocalDiscord } = await import('./local-store.server');
  const config = await readLocalDiscord();
  const owners = ownerIds();
  // On a developer's own computer, before any owner or staff role is set up, everything is open so the
  // site can be tried out. This never applies to a production build.
  if (import.meta.env.DEV && owners.length === 0 && config.staff_role_ids.length === 0) return { staff: true, supervisor: true };
  const { readAdmin } = await import('./admin.server');
  if (await readAdmin()) return { staff: true, supervisor: true };
  if (!me) return { staff: false, supervisor: false };
  if (owners.includes(me.id)) return { staff: true, supervisor: true };
  const { memberRoleIds } = await import('./community.server');
  const roles = await memberRoleIds(me.id);
  const staff = roles.some(id => config.staff_role_ids.includes(id));
  return { staff, supervisor: staff || roles.some(id => config.supervision_role_ids.includes(id)) };
}

async function current() {
  const { readSession } = await import('./discord.server');
  const me = await readSession();
  return { me, access: await accessFor(me) };
}
export async function isStaff() { return (await current()).access.staff; }
// Stops anyone who is not staff. Used by every action that changes the site or reads private records.
export async function requireStaff() {
  const { me, access } = await current();
  if (!access.staff) throw new Error(me ? 'Staff access required.' : 'Sign in as an admin or link your Discord to use the staff tools.');
  return me;
}
