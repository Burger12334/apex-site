import { createFileRoute } from '@tanstack/react-router';

// Serves one postcard picture: a contest entry or a designed winner's postcard.
export const Route = createFileRoute('/api/public/postcards/$file')({
  server: {
    handlers: {
      GET: async ({ params }) => (await import('@/lib/images.server')).imageResponse('postcards', params.file),
    },
  },
});
