import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/public/discord/callback')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { requestOrigin, readStateCookie, setSession, safeNext } = await import('@/lib/discord.server');
        const url = new URL(request.url);
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        const expected = readStateCookie();
        const next = safeNext(decodeURIComponent((expected ?? '').split('.')[1] ?? ''));
        const back = (q = '') => new Response(null, { status: 302, headers: { Location: `${next}${q}` } });
        if (!code || !state || !expected || state !== expected) return back('?discord=failed');
        const clientId = process.env['DISCORD_CLIENT_ID'];
        const clientSecret = process.env['DISCORD_CLIENT_SECRET'];
        if (!clientId || !clientSecret) return back('?discord=unconfigured');
        const tokenRes = await fetch('https://discord.com/api/v10/oauth2/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'authorization_code',
            code,
            redirect_uri: `${requestOrigin(request)}/api/public/discord/callback`,
          }),
        });
        if (!tokenRes.ok) { console.error('Discord token failed', tokenRes.status, await tokenRes.text()); return back('?discord=failed'); }
        const { access_token } = (await tokenRes.json()) as { access_token: string };
        const meRes = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bearer ${access_token}` } });
        if (!meRes.ok) { console.error('Discord user failed', meRes.status, await meRes.text()); return back('?discord=failed'); }
        const me = (await meRes.json()) as { id: string; username: string; avatar: string | null };
        await setSession({ id: me.id, username: me.username, avatar: me.avatar });
        const { logEvent } = await import('@/lib/audit-log.server');
        await logEvent({ title: 'Discord account linked', lines: [`**User** <@${me.id}> (${me.username})`] });
        return back('?discord=linked');
      },
    },
  },
});
