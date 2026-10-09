import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/public/discord/logout')({
  server: {
    handlers: {
      POST: async () => {
        const { clearSession, readSession } = await import('@/lib/discord.server');
        const me = await readSession();
        clearSession();
        if (me) { const { logEvent } = await import('@/lib/audit-log.server'); await logEvent({ title: 'Discord account unlinked', lines: [`**User** <@${me.id}> (${me.username})`] }); }
        return new Response(null, { status: 204 });
      },
    },
  },
});
