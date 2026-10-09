import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/public/google/callback')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { requestOrigin } = await import('@/lib/discord.server');
        const { googleReady, readGoogleState, adminEmails, setAdmin } = await import('@/lib/admin.server');
        const url = new URL(request.url);
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        const expected = readGoogleState();
        const back = (result: string) => new Response(null, { status: 302, headers: { Location: `/?admin=${result}` } });
        if (!googleReady()) return back('unconfigured');
        if (!code || !state || !expected || state !== expected) return back('failed');
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: process.env['GOOGLE_CLIENT_ID'] ?? '',
            client_secret: process.env['GOOGLE_CLIENT_SECRET'] ?? '',
            grant_type: 'authorization_code',
            code,
            redirect_uri: `${requestOrigin(request)}/api/public/google/callback`,
          }),
        });
        if (!tokenRes.ok) { console.error('Google token failed', tokenRes.status, await tokenRes.text()); return back('failed'); }
        const { access_token } = (await tokenRes.json()) as { access_token: string };
        const meRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${access_token}` } });
        if (!meRes.ok) { console.error('Google user failed', meRes.status, await meRes.text()); return back('failed'); }
        const me = (await meRes.json()) as { email?: string; email_verified?: boolean };
        const email = (me.email ?? '').toLowerCase();
        const { logEvent, LOG_COLORS } = await import('@/lib/audit-log.server');
        if (!email || me.email_verified !== true || !adminEmails().includes(email)) {
          await logEvent({ title: 'Admin sign-in refused', color: LOG_COLORS.bad, lines: [`**Google account** ${email || 'unknown'}`] });
          return back('denied');
        }
        await setAdmin(email);
        await logEvent({ title: 'Admin signed in with Google', lines: [`**Google account** ${email}`] });
        return back('signed-in');
      },
    },
  },
});
