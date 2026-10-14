// Pictures uploaded by members (content posts, postcard entries): checked to really be the picture type they
// claim, then kept in the site's own storage under a random name.
export type ImageType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
export const IMAGE_EXT: Record<string, string> = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };

export async function saveImage(folder: string, image: { data: string; type: ImageType }, maxBytes: number, name = crypto.randomUUID()) {
  const bytes = Uint8Array.from(atob(image.data), c => c.charCodeAt(0));
  if (bytes.length > maxBytes) throw new Error(`Pictures must be under ${Math.round(maxBytes / 1048576)} MB.`);
  const head = String.fromCharCode(...bytes.slice(0, 12));
  const real = image.type === 'image/png' ? head.startsWith('\x89PNG') : image.type === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 : image.type === 'image/gif' ? head.startsWith('GIF8') : head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP';
  if (!real) throw new Error('That file is not a valid picture.');
  const file = `${name}.${image.type.split('/')[1]}`;
  await (await import('./storage.server')).writeBytes(`${folder}/${file}`, bytes);
  return file;
}

// A Response for one stored picture, or 404. Names are random and never reused, so browsers may keep them.
export async function imageResponse(folder: string, file: string) {
  const match = /^[0-9a-z-]{8,60}\.(png|jpeg|webp|gif)$/.exec(file);
  if (!match) return new Response('Not found', { status: 404 });
  const bytes = await (await import('./storage.server')).readBytes(`${folder}/${file}`);
  if (!bytes) return new Response('Not found', { status: 404 });
  return new Response(bytes.slice().buffer, { headers: { 'Content-Type': IMAGE_EXT[match[1] ?? ''] ?? 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' } });
}
