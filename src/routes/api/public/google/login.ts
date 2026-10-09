import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/public/google/login')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { requestOrigin, randomState } = await import('@/lib/discord.server');
        const { googleReady, setGoogleState } = await import('@/lib/admin.server');
        if (!googleReady()) return new Response(null, { status: 302, headers: { Location: '/?admin=unconfigured' } });
        const state = randomState();
        setGoogleState(state);
        const params = new URLSearchParams({
          client_id: process.env['GOOGLE_CLIENT_ID'] ?? '',
          response_type: 'code',
          scope: 'openid email',
          redirect_uri: `${requestOrigin(request)}/api/public/google/callback`,
          state,
          prompt: 'select_account',
        });
        return new Response(null, { status: 302, headers: { Location: `https://accounts.google.com/o/oauth2/v2/auth?${params}` } });
      },
    },
  },
});
