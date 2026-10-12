import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useState, type FormEvent } from 'react';
import { Camera, ImagePlus, Send, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ApplyShell, DiscordIcon, apexQuery, useApplyAccess } from '@/components/apply-shell';
import { DiscordAvatar } from '@/components/community';
import { HeroBackdrop } from '@/components/hero-slides';
import { deleteContent, getContent, postContent, type ContentView } from '@/lib/content.functions';

export const Route = createFileRoute('/content')({
  head: () => ({ meta: [{ title: 'Content — Apex' }, { name: 'description', content: 'Pictures from the Apex content creators.' }, { property: 'og:title', content: 'Content — Apex' }, { property: 'og:description', content: 'Pictures from the Apex content creators.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(apexQuery),
  component: Content,
});

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
type ImageType = (typeof IMAGE_TYPES)[number];
const MAX_IMAGE = 8 * 1024 * 1024;

function Content() {
  const { me, linkDiscord } = useApplyAccess();
  const qc = useQueryClient();
  const load = useServerFn(getContent); const send = useServerFn(postContent); const remove = useServerFn(deleteContent);
  const feed = useQuery({ queryKey: ['content', me.data?.id ?? 'guest'], queryFn: () => load() });
  const [notice, setNotice] = useState(''); const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false);
  const [picture, setPicture] = useState<{ data: string; type: ImageType } | null>(null); const [preview, setPreview] = useState('');
  const [viewing, setViewing] = useState<ContentView | null>(null);
  const posts = feed.data?.posts ?? [];

  function pick(file: File | undefined) {
    if (!file) { setPicture(null); setPreview(''); return; }
    if (!IMAGE_TYPES.includes(file.type as ImageType) || file.size > MAX_IMAGE) { setPicture(null); setPreview(''); setNotice('Choose a PNG, JPEG, WebP or GIF picture under 8 MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => { const url = String(reader.result); setPreview(url); setPicture({ data: url.slice(url.indexOf(',') + 1), type: file.type as ImageType }); };
    reader.readAsDataURL(file);
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!picture) { setNotice('Choose a picture first.'); return; }
    const caption = String(new FormData(e.currentTarget).get('caption') ?? '');
    setBusy(true);
    try { await send({ data: { caption, image: picture } }); pick(undefined); setOpen(false); setNotice('Posted.'); await qc.invalidateQueries({ queryKey: ['content'] }); }
    catch (err) { setNotice(err instanceof Error ? err.message : 'Could not post the picture.'); } finally { setBusy(false); }
  }
  async function takeDown(post: ContentView) {
    if (!confirm('Remove this post?')) return;
    try { await remove({ data: post.id }); setViewing(null); setNotice('Post removed.'); await qc.invalidateQueries({ queryKey: ['content'] }); }
    catch (err) { setNotice(err instanceof Error ? err.message : 'Could not remove the post.'); }
  }
  const canRemove = (p: ContentView) => p.mine || feed.data?.canManage;

  return <ApplyShell active="content" notice={notice} onNotice={setNotice}>
    <section className="page-hero page-banner"><HeroBackdrop /><div className="site-width page-hero-inner">
      <div className="eyebrow"><span className="line" />FROM THE MOUNTAIN</div>
      <h1 className="apply-title">Content</h1>
      <p className="apply-lede">Shots from the Apex content creators: summits, storms and everything on the way up.</p>
    </div></section>
    <section className="site-width apply-page">
      <div className="section-header"><div><div className="eyebrow">THE FEED</div><h2>Latest pictures</h2><p>Posted by members with the Content Creation role.</p></div>
        {feed.data?.canPost ? <Button onClick={() => setOpen(true)}><ImagePlus />Post a picture</Button>
          : !me.data && !me.isLoading ? <Button variant="outline" onClick={linkDiscord}><DiscordIcon />Content creator? Link Discord</Button> : null}</div>
      {feed.isLoading ? <div className="apply-card review-empty"><p>Loading pictures…</p></div>
        : posts.length === 0 ? <div className="apply-card review-empty"><Camera /><p>No pictures yet. The first post from a content creator will show up here.</p></div>
        : <div className="content-grid">{posts.map(p => <article key={p.id} className="content-post">
          <button className="content-shot" onClick={() => setViewing(p)} aria-label={p.caption ? `Open picture: ${p.caption}` : `Open picture by ${p.author_name}`}><img src={p.image_url} alt={p.caption || `Picture by ${p.author_name}`} loading="lazy" /></button>
          <div className="content-meta"><DiscordAvatar user={{ avatar_url: p.author_avatar, username: p.author_name }} /><span className="content-by"><strong>@{p.author_name}</strong><small>{new Date(p.created_at).toLocaleDateString([], { dateStyle: 'medium' })}</small></span>
            {canRemove(p) && <Button variant="ghost" size="icon" title="Remove post" aria-label="Remove post" onClick={() => void takeDown(p)}><Trash2 /></Button>}</div>
          {p.caption && <p className="content-caption">{p.caption}</p>}
        </article>)}</div>}
    </section>
    <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) pick(undefined); }}><DialogContent className="editor-dialog"><DialogTitle className="panel-title">Post a picture</DialogTitle><DialogDescription>It appears on the Content page straight away, with your Discord name on it.</DialogDescription>
      <form className="editor-form" onSubmit={submit}>
        {preview ? <div className="proof-preview"><img src={preview} alt="The picture you chose" /><Button type="button" variant="outline" size="sm" onClick={() => pick(undefined)}><X />Choose another</Button></div>
          : <label className="proof-drop"><ImagePlus /><span>Choose a picture</span><input type="file" accept={IMAGE_TYPES.join(',')} onChange={e => pick(e.target.files?.[0])} /></label>}
        <label>Caption <small>(optional)</small><textarea name="caption" rows={2} maxLength={300} placeholder="Where and when was this?" /></label>
        <Button disabled={busy || !picture}><Send />{busy ? 'Posting…' : 'Post'}</Button>
      </form>
    </DialogContent></Dialog>
    <Dialog open={!!viewing} onOpenChange={o => { if (!o) setViewing(null); }}><DialogContent className="editor-dialog content-viewer"><DialogTitle className="sr-only">Picture by {viewing?.author_name}</DialogTitle><DialogDescription className="sr-only">Full-size picture from the Content page.</DialogDescription>
      {viewing && <><img src={viewing.image_url} alt={viewing.caption || `Picture by ${viewing.author_name}`} />
        <div className="content-meta"><DiscordAvatar user={{ avatar_url: viewing.author_avatar, username: viewing.author_name }} /><span className="content-by"><strong>@{viewing.author_name}</strong><small>{new Date(viewing.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</small></span>
          {canRemove(viewing) && <Button variant="outline" size="sm" onClick={() => void takeDown(viewing)}><Trash2 />Remove</Button>}</div>
        {viewing.caption && <p className="content-caption">{viewing.caption}</p>}</>}
    </DialogContent></Dialog>
  </ApplyShell>;
}
