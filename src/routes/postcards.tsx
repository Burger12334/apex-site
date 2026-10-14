import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useEffect, useState, type FormEvent } from 'react';
import { Check, Crown, Heart, ImagePlus, Loader2, MapPin, Send, ShieldCheck, Trash2, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ApplyShell, DiscordIcon, apexQuery, useApplyAccess } from '@/components/apply-shell';
import { DiscordAvatar } from '@/components/community';
import { HeroBackdrop } from '@/components/hero-slides';
import { crownPostcard, deletePostcard, getPostcards, reviewPostcard, submitPostcard, uploadPostcardDesign, votePostcard, type PostcardView } from '@/lib/postcards.functions';

export const Route = createFileRoute('/postcards')({
  head: () => ({ meta: [{ title: 'Apex Postcards — Apex' }, { name: 'description', content: 'The monthly Apex photo contest. Share a real-life place, vote for your favourite, and the winner becomes an Apex postcard.' }, { property: 'og:title', content: 'Apex Postcards' }, { property: 'og:description', content: 'The monthly Apex photo contest: the winner becomes a postcard.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(apexQuery),
  component: Postcards,
});

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
type ImageType = (typeof IMAGE_TYPES)[number];
type Picture = { data: string; type: ImageType };
const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString([], { month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortMonth = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString([], { month: 'short', year: '2-digit', timeZone: 'UTC' }).toUpperCase();

function readPicture(file: File | undefined, max: number, done: (p: Picture | null, preview: string, error: string) => void) {
  if (!file) { done(null, '', ''); return; }
  if (!IMAGE_TYPES.includes(file.type as ImageType) || file.size > max) { done(null, '', `Choose a PNG, JPEG, WebP or GIF picture under ${Math.round(max / 1048576)} MB.`); return; }
  const reader = new FileReader();
  reader.onload = () => { const url = String(reader.result); done({ data: url.slice(url.indexOf(',') + 1), type: file.type as ImageType }, url, ''); };
  reader.readAsDataURL(file);
}
function useCountdown(to: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(t); }, []);
  const left = Math.max(0, new Date(to).getTime() - now);
  return { days: Math.floor(left / 86400000), hours: Math.floor(left / 3600000) % 24, minutes: Math.floor(left / 60000) % 60 };
}

// One entry drawn as a postcard: the photo, a stamp with the month, "Greetings from" the place.
function PostcardCard({ p, onVote, onRemove, staffActions, rank, winner }: { p: PostcardView; onVote?: (() => void) | undefined; onRemove?: (() => void) | undefined; staffActions?: React.ReactNode; rank?: number; winner?: boolean }) {
  return <article className={`postcard ${winner ? 'is-winner' : ''}`}>
    <div className="postcard-photo"><img src={p.image_url} alt={p.caption || `Photo from ${p.place}`} loading="lazy" />
      <span className="postcard-stamp"><span>APEX</span><b>{shortMonth(p.month)}</b></span>
      {winner && <span className="postcard-crown"><Crown />Winner</span>}
      {rank !== undefined && !winner && <span className="postcard-rank">#{rank}</span>}
    </div>
    <div className="postcard-back">
      <p className="postcard-greeting">Greetings from</p>
      <h3>{p.place}</h3>
      {p.caption && <p className="postcard-caption">{p.caption}</p>}
      <div className="postcard-foot">
        <span className="postcard-by"><DiscordAvatar user={{ avatar_url: p.author_avatar, username: p.author_name }} /><span>@{p.author_name}</span></span>
        {onVote ? <button className={`postcard-vote ${p.voted ? 'voted' : ''}`} onClick={onVote} disabled={p.mine} title={p.mine ? 'You cannot vote for your own photo' : p.voted ? 'Take your vote back' : 'Vote for this photo'}><Heart />{p.votes}</button>
          : <span className="postcard-votes"><Heart />{p.votes}</span>}
      </div>
      {(onRemove || staffActions) && <div className="postcard-tools">{staffActions}{onRemove && <button className="danger" onClick={onRemove}><Trash2 />Remove</button>}</div>}
    </div>
  </article>;
}

function Postcards() {
  const { me, linkDiscord } = useApplyAccess();
  const qc = useQueryClient();
  const load = useServerFn(getPostcards); const submit = useServerFn(submitPostcard); const vote = useServerFn(votePostcard);
  const remove = useServerFn(deletePostcard); const review = useServerFn(reviewPostcard); const crown = useServerFn(crownPostcard); const upload = useServerFn(uploadPostcardDesign);
  const data = useQuery({ queryKey: ['postcards', me.data?.id ?? 'guest'], refetchInterval: 60000, queryFn: () => load() });
  const d = data.data;
  const [notice, setNotice] = useState(''); const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false);
  const left = useCountdown(d?.closes_at ?? new Date().toISOString());
  const refresh = () => qc.invalidateQueries({ queryKey: ['postcards'] });
  async function act(action: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try { await action(); if (ok) setNotice(ok); await refresh(); return true; } catch (e) { setNotice(e instanceof Error ? e.message : 'Something went wrong.'); return false; } finally { setBusy(false); }
  }

  // The entry form: photo, place (looked up so it can go on the World Map), caption, and the rules.
  const [picture, setPicture] = useState<Picture | null>(null); const [preview, setPreview] = useState('');
  const [place, setPlace] = useState(''); const [found, setFound] = useState<{ lat: number; lng: number; label: string } | null>(null); const [finding, setFinding] = useState(false); const [pin, setPin] = useState(true);
  async function findPlace() {
    if (place.trim().length < 2) return;
    setFinding(true); setFound(null);
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=en&q=${encodeURIComponent(place.trim())}`);
      const hit = ((await r.json()) as { lat: string; lon: string; display_name: string }[])[0];
      if (hit) setFound({ lat: Number(hit.lat), lng: Number(hit.lon), label: hit.display_name });
    } catch { /* the entry still works without the map */ } finally { setFinding(false); }
  }
  function resetForm() { setPicture(null); setPreview(''); setPlace(''); setFound(null); setPin(true); }
  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!picture) { setNotice('Choose a photo first.'); return; }
    const caption = String(new FormData(e.currentTarget).get('caption') ?? '');
    if (await act(() => submit({ data: { image: picture, place, caption, lat: found?.lat, lng: found?.lng, pin_on_map: pin && !!found } }), 'Entry sent. Staff will check it, then it joins the contest.')) { resetForm(); setOpen(false); }
  }

  const [designFor, setDesignFor] = useState<string | null>(null);
  async function sendDesign(file: File | undefined) {
    const month = designFor; if (!month) return;
    readPicture(file, 10 * 1024 * 1024, (p, _preview, error) => { if (error) { setNotice(error); return; } if (p) void act(() => upload({ data: { month, image: p } }), 'Designed postcard added to the Collection.').then(ok => { if (ok) setDesignFor(null); }); });
  }

  const month = d?.month ?? '';
  const entries = d?.entries ?? [];
  const removeBtn = (p: PostcardView) => (p.mine || d?.staff) ? () => { if (confirm('Remove this entry?')) void act(() => remove({ data: p.id }), 'Entry removed.'); } : undefined;

  return <ApplyShell active="postcards" notice={notice} onNotice={setNotice}>
    <section className="page-hero page-banner"><HeroBackdrop /><div className="site-width page-hero-inner">
      <div className="eyebrow"><span className="line" />MONTHLY PHOTO CONTEST</div>
      <h1 className="apply-title">Apex Postcards</h1>
      <p className="apply-lede">Share a photo of a real place you have been. The crew votes, and each month’s winner is designed into an official Apex postcard for the Collection.</p>
      <div className="map-stats"><span><ImagePlus /><strong>{entries.length}</strong> {entries.length === 1 ? 'entry' : 'entries'} this month</span><span><Crown /><strong>{d?.collection.length ?? 0}</strong> {d?.collection.length === 1 ? 'postcard' : 'postcards'} in the Collection</span></div>
    </div></section>

    <section className="site-width apply-page postcards-page">
      <div className="contest-panel">
        <div className="contest-main">
          <div className="eyebrow">NOW OPEN</div>
          <h2>{month ? monthName(month) : 'This month'}</h2>
          <div className="contest-clock" aria-label="Time left to enter and vote"><span><b>{left.days}</b>days</span><span><b>{left.hours}</b>hours</span><span><b>{left.minutes}</b>min</span></div>
          <p className="contest-sub">Entries and votes close at the end of the month (UTC).</p>
          <div className="contest-actions">
            {!d?.linked ? <Button onClick={linkDiscord} disabled={me.isLoading}><DiscordIcon />Link Discord to enter and vote</Button>
              : d.mine ? <div className={`contest-mine ${d.mine.status}`}>{d.mine.status === 'pending' ? <><Loader2 />Your photo from <strong>{d.mine.place}</strong> is waiting for staff approval.</> : <><Check />You are in with your photo from <strong>{d.mine.place}</strong> · {d.mine.votes} {d.mine.votes === 1 ? 'vote' : 'votes'}</>}<button onClick={removeBtn(d.mine)}>Remove</button></div>
              : <Button size="lg" onClick={() => setOpen(true)}><ImagePlus />Enter this month’s contest</Button>}
          </div>
        </div>
        <ul className="contest-rules">
          <li><MapPin /><span><strong>A real place.</strong> Somewhere you have actually been: a summit, a city, a trail, a view.</span></li>
          <li><ImagePlus /><span><strong>Your own photo.</strong> One entry per person each month.</span></li>
          <li><ShieldCheck /><span><strong>Keep it safe.</strong> No faces, house numbers, school names or anything that shows where you live.</span></li>
          <li><Heart /><span><strong>One vote each.</strong> Vote for your favourite; you can change it until the month ends.</span></li>
        </ul>
      </div>

      {d?.staff && d.pending.length > 0 && <div className="pending-box">
        <div className="section-header"><div><div className="eyebrow">STAFF ONLY</div><h2>Waiting for approval <span className="tab-count">{d.pending.length}</span></h2><p>Check each photo against the rules before it joins the contest.</p></div></div>
        <div className="postcard-grid">{d.pending.map(p => <PostcardCard key={p.id} p={p} staffActions={<><button className="good" disabled={busy} onClick={() => void act(() => review({ data: { id: p.id, status: 'approved' } }), 'Approved. It is in the contest now.')}><Check />Approve</button><button disabled={busy} onClick={() => void act(() => review({ data: { id: p.id, status: 'rejected' } }), 'Turned down.')}><X />Turn down</button></>} />)}</div>
      </div>}

      <div className="section-header"><div><div className="eyebrow">THIS MONTH’S ENTRIES</div><h2>Vote for your favourite</h2><p>{d?.linked ? 'Tap the heart to vote. Tap it again to take your vote back.' : 'Link Discord to vote.'}</p></div></div>
      {data.isLoading ? <div className="apply-card review-empty"><p>Loading entries…</p></div>
        : entries.length === 0 ? <div className="apply-card review-empty"><ImagePlus /><p>No entries yet this month. Be the first to send a postcard.</p></div>
        : <div className="postcard-grid">{entries.map(p => <PostcardCard key={p.id} p={p} onVote={d?.linked ? () => void act(() => vote({ data: p.id }), '') : undefined} onRemove={removeBtn(p)} staffActions={d?.staff ? <button disabled={busy} onClick={() => void act(() => crown({ data: p.id }), 'Winner crowned.')}><Crown />Crown</button> : undefined} />)}</div>}

      <div className="section-header collection-head"><div><div className="eyebrow">THE COLLECTION</div><h2>Official Apex postcards</h2><p>Every month’s winning photo, made into a postcard.</p></div></div>
      {!d?.collection.length ? <div className="apply-card review-empty"><Crown /><p>The first postcard joins the Collection when this month’s winner is crowned.</p></div>
        : <div className="collection-grid">{d.collection.map(c => <figure key={c.month} className="collection-item">
          <div className={`collection-card ${c.design_url ? 'designed' : ''}`}>{c.design_url ? <img src={c.design_url} alt={`Apex postcard, ${monthName(c.month)}`} loading="lazy" /> : <PostcardCard p={c.entry} winner />}</div>
          <figcaption><strong>{monthName(c.month)}</strong><span>{c.entry.place} · @{c.entry.author_name}</span>{!c.design_url && <small>Postcard being designed</small>}
            {d.staff && <Button variant="outline" size="sm" onClick={() => setDesignFor(c.month)}><Upload />{c.design_url ? 'Replace design' : 'Add the designed postcard'}</Button>}</figcaption>
        </figure>)}</div>}

      {(d?.months.length ?? 0) > 0 && <><div className="section-header"><div><div className="eyebrow">PAST CONTESTS</div><h2>Results</h2><p>Final votes for each month.{d?.staff ? ' Crown a winner if it has not been done yet.' : ''}</p></div></div>
        {d?.months.map(m => <details key={m.month} className="past-month" open={!m.winner && d.staff}>
          <summary><strong>{monthName(m.month)}</strong><span>{m.entries.length} entries{m.winner ? ' · winner crowned' : ''}</span></summary>
          <div className="postcard-grid">{m.entries.slice(0, d.staff ? m.entries.length : 6).map((p, i) => <PostcardCard key={p.id} p={p} rank={i + 1} winner={p.id === m.winner} onRemove={d.staff ? removeBtn(p) : undefined} staffActions={d.staff && p.id !== m.winner ? <button disabled={busy} onClick={() => void act(() => crown({ data: p.id }), 'Winner crowned.')}><Crown />Crown winner</button> : undefined} />)}</div>
        </details>)}</>}

      <p className="postcards-more">Every approved photo with a place can also go on the <Link to="/map">Apex World Map</Link>.</p>
    </section>

    <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) resetForm(); }}><DialogContent className="editor-dialog"><DialogTitle className="panel-title">Enter Apex Postcards</DialogTitle><DialogDescription>{month ? monthName(month) : ''} · one photo per person. Staff check it before it appears.</DialogDescription>
      <form className="editor-form" onSubmit={send}>
        {preview ? <div className="proof-preview"><img src={preview} alt="Your photo" /><Button type="button" variant="outline" size="sm" onClick={() => { setPicture(null); setPreview(''); }}><X />Choose another</Button></div>
          : <label className="proof-drop"><ImagePlus /><span>Choose your photo</span><input type="file" accept={IMAGE_TYPES.join(',')} onChange={e => readPicture(e.target.files?.[0], 8 * 1024 * 1024, (p, url, error) => { setPicture(p); setPreview(url); if (error) setNotice(error); })} /></label>}
        <label>Where was it taken?<div className="place-row"><input value={place} onChange={e => { setPlace(e.target.value); setFound(null); }} onBlur={() => void findPlace()} required minLength={2} maxLength={80} placeholder="e.g. Zermatt, Switzerland" /><Button type="button" variant="outline" size="sm" disabled={finding || place.trim().length < 2} onClick={() => void findPlace()}>{finding ? <Loader2 className="spin" /> : <MapPin />}Find</Button></div>
          <small className="field-hint">{found ? `Found: ${found.label}` : 'Town, region or landmark. Never an address.'}</small></label>
        {found && <label className="settings-check"><input type="checkbox" checked={pin} onChange={e => setPin(e.target.checked)} />Also pin this place on the Apex World Map<small className="field-hint">Added once staff approve your photo.</small></label>}
        <label>Caption <small>(optional)</small><textarea name="caption" rows={2} maxLength={280} placeholder="The story behind the shot" /></label>
        <label className="settings-check"><input type="checkbox" required />This is my own photo, and it shows no faces or anything that reveals where someone lives.</label>
        <Button disabled={busy || !picture}><Send />{busy ? 'Sending…' : 'Send my entry'}</Button>
      </form>
    </DialogContent></Dialog>

    <Dialog open={!!designFor} onOpenChange={o => { if (!o) setDesignFor(null); }}><DialogContent className="editor-dialog"><DialogTitle className="panel-title">Designed postcard</DialogTitle><DialogDescription>{designFor ? monthName(designFor) : ''} · upload the finished postcard. It replaces the photo in the Collection.</DialogDescription>
      <label className="proof-drop"><Upload /><span>{busy ? 'Uploading…' : 'Choose the postcard image'}</span><input type="file" accept={IMAGE_TYPES.join(',')} disabled={busy} onChange={e => void sendDesign(e.target.files?.[0])} /></label>
    </DialogContent></Dialog>
  </ApplyShell>;
}
