import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/public/discord/login')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { requestOrigin, randomState, setStateCookie, safeNext } = await import('@/lib/discord.server');
        const clientId = process.env['DISCORD_CLIENT_ID'];
        if (!clientId) return new Response('Discord sign-in is not configured yet.', { status: 503 });
        // The page to return to rides inside the state, which the callback checks against the cookie.
        const state = `${randomState()}.${encodeURIComponent(safeNext(new URL(request.url).searchParams.get('next')))}`;
        setStateCookie(state);
        const params = new URLSearchParams({
          client_id: clientId,
          response_type: 'code',
          scope: 'identify',
          redirect_uri: `${requestOrigin(request)}/api/public/discord/callback`,
          state,
          prompt: 'none',
        });
        return new Response(null, { status: 302, headers: { Location: `https://discord.com/oauth2/authorize?${params}` } });
      },
    },
  },
});
