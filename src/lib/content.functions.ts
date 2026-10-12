import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

// The Content page: pictures posted by members who hold the Content Creation role in the main Discord server.
// CONTENT_ROLE_ID overrides the role; nobody else can post, staff included. Staff can remove posts.
const CONTENT_ROLE = '1524608015066730516';
const contentRole = () => process.env['CONTENT_ROLE_ID'] || CONTENT_ROLE;

export type ContentPost = { id: string; author_id: string; author_name: string; author_avatar: string; caption: string; file: string; created_at: string };
export type ContentView = ContentPost & { image_url: string; mine: boolean };

async function store() { return import('./local-store.server'); }
async function viewer() {
  const { readSession } = await import('./discord.server'); const { accessFor } = await import('./staff.server');
  const me = await readSession();
  let canPost = false;
  if (me) { const { memberRoleIds } = await import('./community.server'); canPost = (await memberRoleIds(me.id)).includes(contentRole()); }
  return { me, canPost, canManage: (await accessFor(me)).staff };
}

export const getContent = createServerFn({ method: 'GET' }).handler(async () => {
  const { localMode, readLocalList } = await store();
  const { me, canPost, canManage } = await viewer();
  const posts = localMode() ? await readLocalList<ContentPost>('content') : [];
  return { posts: posts.map((p): ContentView => ({ ...p, image_url: `/api/public/content/${p.file}`, mine: me?.id === p.author_id })), canPost: localMode() && canPost, canManage: localMode() && canManage, linked: !!me };
});

const upload = z.object({ caption: z.string().trim().max(300).default(''), image: z.object({ data: z.string().max(11500000), type: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']) }) });
export const postContent = createServerFn({ method: 'POST' }).inputValidator((d) => upload.parse(d)).handler(async ({ data }) => {
  const { localMode, readLocalList, writeLocalList } = await store();
  if (!localMode()) throw new Error('Not available while the site is connected to the database.');
  const { me, canPost } = await viewer();
  if (!me) throw new Error('Link your Discord to post.');
  if (!canPost) throw new Error('Only members with the Content Creation role can post here.');
  const bytes = Uint8Array.from(atob(data.image.data), c => c.charCodeAt(0));
  if (bytes.length > 8 * 1024 * 1024) throw new Error('Pictures must be under 8 MB.');
  // The file has to really be the kind of picture it claims to be.
  const head = String.fromCharCode(...bytes.slice(0, 12));
  const real = data.image.type === 'image/png' ? head.startsWith('\x89PNG') : data.image.type === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 : data.image.type === 'image/gif' ? head.startsWith('GIF8') : head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP';
  if (!real) throw new Error('That file is not a valid picture.');
  const id = crypto.randomUUID(); const file = `${id}.${data.image.type.split('/')[1]}`;
  await (await import('./storage.server')).writeBytes(`content/${file}`, bytes);
  const { avatarUrl } = await import('./community.server');
  const post: ContentPost = { id, author_id: me.id, author_name: me.username, author_avatar: avatarUrl(me), caption: data.caption, file, created_at: new Date().toISOString() };
  await writeLocalList('content', [post, ...await readLocalList<ContentPost>('content')]);
  const { logEvent, LOG_COLORS } = await import('./audit-log.server'); const { currentOrigin } = await import('./discord.server');
  await logEvent({ title: 'Content posted', color: LOG_COLORS.good, lines: [`**By** <@${me.id}> (${me.username})`, data.caption && `**Caption** ${data.caption}`, `**Page** ${currentOrigin()}/content`] });
  return { id };
});

// The person who posted it, or staff, can take a post down. The picture file is left in storage.
export const deleteContent = createServerFn({ method: 'POST' }).inputValidator((d) => z.string().uuid().parse(d)).handler(async ({ data }) => {
  const { localMode, readLocalList, writeLocalList } = await store();
  if (!localMode()) throw new Error('Not available while the site is connected to the database.');
  const { me, canManage } = await viewer();
  const posts = await readLocalList<ContentPost>('content'); const post = posts.find(p => p.id === data);
  if (!post) throw new Error('That post is already gone.');
  if (!canManage && me?.id !== post.author_id) throw new Error('You can only remove your own posts.');
  await writeLocalList('content', posts.filter(p => p.id !== data));
  const { logEvent, LOG_COLORS, actorName } = await import('./audit-log.server');
  await logEvent({ title: 'Content removed', color: LOG_COLORS.bad, lines: [`**Posted by** <@${post.author_id}> (${post.author_name})`, post.caption && `**Caption** ${post.caption}`], by: await actorName() });
});
