import { createFileRoute } from '@tanstack/react-router';

const TYPES: Record<string, string> = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };

// Serves one picture from the Content page. Files are named by a random ID and never change, so browsers may keep them.
export const Route = createFileRoute('/api/public/content/$file')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const match = /^[0-9a-f-]{36}\.(png|jpeg|webp|gif)$/.exec(params.file);
        if (!match) return new Response('Not found', { status: 404 });
        const { readBytes } = await import('@/lib/storage.server');
        const bytes = await readBytes(`content/${params.file}`);
        if (!bytes) return new Response('Not found', { status: 404 });
        return new Response(bytes.slice().buffer, { headers: { 'Content-Type': TYPES[match[1] ?? ''] ?? 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' } });
      },
    },
  },
});
