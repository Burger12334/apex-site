import { getCookie, setCookie, deleteCookie, getRequest } from '@tanstack/react-start/server';

export const SESSION_COOKIE = 'apex_discord';
export const STATE_COOKIE = 'apex_discord_state';
const cookieOpts = { httpOnly: true, secure: true, sameSite: 'none' as const, path: '/' };

export type DiscordUser = { id: string; username: string; avatar: string | null };

const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = ''; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64url = (s: string) => atob(s.replace(/-/g, '+').replace(/_/g, '/'));

async function hmac(data: string) {
  const secret = process.env['DISCORD_SESSION_SECRET'];
  if (!secret) throw new Error('Discord sign-in is not configured');
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function requestOrigin(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? url.host;
  const proto = request.headers.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto.split(',')[0]}://${host.split(',')[0]}`;
}

// Pages a Discord sign-in may return to; anything else falls back to the homepage.
const NEXT_PAGES = ['/', '/apply', '/reports', '/reports/reviews'];
export function safeNext(next: string | null | undefined) {
  return next && NEXT_PAGES.includes(next) ? next : '/';
}

// Address the current request came in on, used to build links back to the site.
export function currentOrigin() { return requestOrigin(getRequest()); }

export function randomState() {
  return b64url(crypto.getRandomValues(new Uint8Array(24)));
}

export function setStateCookie(state: string) {
  setCookie(STATE_COOKIE, state, { ...cookieOpts, maxAge: 600 });
}
export function readStateCookie() {
  const v = getCookie(STATE_COOKIE); deleteCookie(STATE_COOKIE, cookieOpts); return v;
}

export async function setSession(user: DiscordUser) {
  const payload = b64url(enc.encode(JSON.stringify({ ...user, exp: Date.now() + 1000 * 60 * 60 * 24 * 7 })));
  setCookie(SESSION_COOKIE, `${payload}.${await hmac(payload)}`, { ...cookieOpts, maxAge: 60 * 60 * 24 * 7 });
}

export function clearSession() { deleteCookie(SESSION_COOKIE, cookieOpts); }

export async function readSession(): Promise<DiscordUser | null> {
  const raw = getCookie(SESSION_COOKIE);
  if (!raw) return null;
  const [payload, sig] = raw.split('.');
  if (!payload || !sig) return null;
  try {
    if (!safeEqual(sig, await hmac(payload))) return null;
    const data = JSON.parse(fromB64url(payload));
    if (typeof data.exp !== 'number' || data.exp < Date.now()) return null;
    return { id: String(data.id), username: String(data.username), avatar: data.avatar ?? null };
  } catch { return null; }
}
