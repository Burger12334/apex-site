// Admin sign-in with Google, run by the site itself (no Lovable, no database sign-in).
// GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET come from a Google Cloud OAuth client; APEX_ADMIN_EMAILS lists
// the Google accounts allowed in. A signed cookie remembers the admin for a week.
import { getCookie, setCookie, deleteCookie } from '@tanstack/react-start/server';

export const ADMIN_COOKIE = 'apex_admin';
export const GOOGLE_STATE_COOKIE = 'apex_google_state';
const cookieOpts = { httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/' };

export const adminEmails = () => (process.env['APEX_ADMIN_EMAILS'] ?? '').toLowerCase().split(/[\s,]+/).filter(Boolean);
export const googleReady = () => !!(process.env['GOOGLE_CLIENT_ID'] && process.env['GOOGLE_CLIENT_SECRET'] && adminEmails().length);

export async function setAdmin(email: string) {
  const { signPayload } = await import('./discord.server');
  setCookie(ADMIN_COOKIE, await signPayload({ email, exp: Date.now() + 1000 * 60 * 60 * 24 * 7 }), { ...cookieOpts, maxAge: 60 * 60 * 24 * 7 });
}
export function clearAdmin() { deleteCookie(ADMIN_COOKIE, cookieOpts); }
// The signed-in admin's email, or null. An email removed from APEX_ADMIN_EMAILS loses access straight away.
export async function readAdmin(): Promise<string | null> {
  const { readPayload } = await import('./discord.server');
  const data = await readPayload<{ email: string; exp: number }>(getCookie(ADMIN_COOKIE));
  return data && adminEmails().includes(data.email) ? data.email : null;
}

export function setGoogleState(state: string) { setCookie(GOOGLE_STATE_COOKIE, state, { ...cookieOpts, maxAge: 600 }); }
export function readGoogleState() { const v = getCookie(GOOGLE_STATE_COOKIE); deleteCookie(GOOGLE_STATE_COOKIE, cookieOpts); return v; }
