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
        // A sign-in that did not finish is logged with the reason (never with any codes or secrets).
        const failed = async (why: string, q = '?discord=failed') => { const { logEvent, LOG_COLORS } = await import('@/lib/audit-log.server'); await logEvent({ title: 'Discord sign-in failed', color: LOG_COLORS.bad, lines: [`**Why** ${why}`] }); return back(q); };
        if (url.searchParams.get('error')) return failed(url.searchParams.get('error') === 'access_denied' ? 'the person cancelled on Discord' : `Discord said: ${url.searchParams.get('error')?.slice(0, 80)}`);
        if (!code || !state || !expected || state !== expected) return failed('the sign-in link expired or was opened in a different browser');
        const clientId = process.env['DISCORD_CLIENT_ID'];
        const clientSecret = process.env['DISCORD_CLIENT_SECRET'];
        if (!clientId || !clientSecret) return failed('Discord sign-in is not set up on this server (client ID or secret missing)', '?discord=unconfigured');
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
        if (!tokenRes.ok) { console.error('Discord token failed', tokenRes.status, await tokenRes.text()); return failed(`Discord refused the sign-in (error ${tokenRes.status}); check the redirect URL and client secret`); }
        const { access_token } = (await tokenRes.json()) as { access_token: string };
        const meRes = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bearer ${access_token}` } });
        if (!meRes.ok) { console.error('Discord user failed', meRes.status, await meRes.text()); return failed(`could not read the Discord account (error ${meRes.status})`); }
        const me = (await meRes.json()) as { id: string; username: string; avatar: string | null };
        await setSession({ id: me.id, username: me.username, avatar: me.avatar });
        const { logEvent } = await import('@/lib/audit-log.server');
        await logEvent({ title: 'Discord account linked', lines: [`**User** <@${me.id}> (${me.username})`] });
        return back('?discord=linked');
      },
    },
  },
});
