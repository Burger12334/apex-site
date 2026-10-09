import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/public/google/logout')({
  server: {
    handlers: {
      POST: async () => {
        const { clearAdmin, readAdmin } = await import('@/lib/admin.server');
        const email = await readAdmin();
        clearAdmin();
        if (email) { const { logEvent } = await import('@/lib/audit-log.server'); await logEvent({ title: 'Admin signed out', lines: [`**Google account** ${email}`] }); }
        return new Response(null, { status: 204 });
      },
    },
  },
});
