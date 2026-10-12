import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CalendarDays, Check, Crown, Megaphone, Pencil, Medal, Mountain, Plus, Trash2, Trophy, Users } from 'lucide-react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Logo } from '@/components/apex-editor';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { logStaff } from '@/lib/staff-log';
import { ApplyShell, DiscordIcon, apexQuery, useApplyAccess } from '@/components/apply-shell';
import { DiscordAvatar } from '@/components/community';
import { HeroBackdrop } from '@/components/hero-slides';
import { DiscordPicker, readPicked } from '@/components/discord-picker';
import { lookupDiscord } from '@/lib/community.functions';
import { announceDiscordEventStart, announceExpedition, announceExpeditionStart, saveDiscordEventDetails, deleteLocalClimber, deleteLocalExpedition, getExpeditions, getHallOfFame, saveLocalClimber, saveLocalExpedition, toggleExpeditionSignup, type ExpeditionView } from '@/lib/expeditions.functions';

export const Route = createFileRoute('/expeditions')({
  head: () => ({ meta: [{ title: 'Expeditions — Apex' }, { name: 'description', content: 'Upcoming Apex climbs you can sign up for, and the hall of fame.' }, { property: 'og:title', content: 'Expeditions — Apex' }, { property: 'og:description', content: 'Upcoming Apex climbs you can sign up for, and the hall of fame.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(apexQuery),
  component: Expeditions,
});

// The expeditions and hall-of-fame tables are newer than the generated database types.
const tables = supabase as unknown as SupabaseClient;
const message = (e: unknown, fallback: string) => e instanceof Error ? e.message : fallback;

function Expeditions() {
  const { me, isAdmin, linkDiscord } = useApplyAccess();
  const qc = useQueryClient();
  const [notice, setNotice] = useState('');
  const load = useServerFn(getExpeditions); const toggle = useServerFn(toggleExpeditionSignup);
  const { data: apex } = useSuspenseQuery(apexQuery); const startNow = useServerFn(announceExpeditionStart);
  const saveDetails = useServerFn(saveDiscordEventDetails); const startEvent = useServerFn(announceDiscordEventStart);
  const [editing, setEditing] = useState<string | null>(null);
  const createLocal = useServerFn(saveLocalExpedition); const removeLocal = useServerFn(deleteLocalExpedition); const announce = useServerFn(announceExpedition);
  const list = useQuery({ queryKey: ['expeditions', me.data?.id ?? 'guest'], refetchInterval: 60000, queryFn: () => load() });
  const isLocal = list.data?.local ?? false;
  const events = list.data?.events ?? [];
  const editingEvent = events.find(ev => ev.id === editing);
  const [creating, setCreating] = useState(false); const [busy, setBusy] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ['expeditions'] });

  async function act(action: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try { await action(); setNotice(ok); await refresh(); return true; } catch (e) { setNotice(message(e, 'Something went wrong.')); return false; } finally { setBusy(false); }
  }
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = e.currentTarget; const f = new FormData(form);
    const input = { title: String(f.get('title')).trim(), description: String(f.get('description')).trim(), starts_at: new Date(String(f.get('starts_at'))).toISOString(), leader: String(f.get('leader') ?? '').trim(), max_spots: Number(f.get('max_spots') || 0) };
    // One Roblox server link per line.
    const servers = String(f.get('servers') ?? '').split(/\s+/).map(url => url.trim()).filter(Boolean).map(url => ({ url }));
    const guide_members = readPicked(f.get('guides')); const sherpa_members = readPicked(f.get('sherpas'));
    const event_url = String(f.get('event_url') ?? '').trim();
    let announced = '';
    const ok = await act(async () => {
      if (isLocal) announced = (await createLocal({ data: { ...input, guides: '', sherpas: '', guide_members, sherpa_members, servers, event_url } })).announced;
      else { const { data, error } = await tables.from('expeditions').insert(input).select('id').single(); if (error) throw error; announced = (await announce({ data: data.id as string })).announced; logStaff('Expedition created', [input.title, `Announcement: ${announced}`]); }
    }, 'Expedition created.');
    if (ok) { setNotice(`Expedition created. Discord announcement: ${announced}.`); form.reset(); setCreating(false); }
  }
  const remove = (ex: ExpeditionView) => { if (confirm(`Delete "${ex.title}" and its sign-ups?`)) void act(async () => { if (isLocal) await removeLocal({ data: ex.id }); else { const { error } = await tables.from('expeditions').delete().eq('id', ex.id); if (error) throw error; logStaff('Expedition deleted', [ex.title]); } }, 'Expedition deleted.'); };

  // The top line of a card: "Live Now" in green once it has started, otherwise the date and time.
  const when = (iso: string, live: boolean) => <span className={`event-when ${live ? 'live' : ''}`}><CalendarDays />{live ? 'Live Now' : new Date(iso).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>;
  const crew = (people: { id: string; username: string; avatar_url: string }[]) => <span className="crew-people">{people.map(p => <span key={p.id || p.username}>{p.avatar_url && <img src={p.avatar_url} alt="" loading="lazy" />}{p.username}</span>)}</span>;
  async function saveEvent(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget); if (!editing) return;
    const servers = String(f.get('servers') ?? '').split(/\s+/).map(url => url.trim()).filter(Boolean).map(url => ({ url }));
    if (await act(() => saveDetails({ data: { id: editing, guide_members: readPicked(f.get('guides')), sherpa_members: readPicked(f.get('sherpas')), servers } }), 'Event details saved.')) setEditing(null);
  }
  const host = (line: string) => <span className="event-host"><span className="event-logo">{apex.settings.logo_url ? <Logo path={apex.settings.logo_url} alt="" /> : <Mountain />}</span><span><strong>{apex.settings.name}</strong><small>{line}</small></span></span>;

  return <ApplyShell active="expeditions" notice={notice} onNotice={setNotice}>
    <section className="page-hero page-banner"><HeroBackdrop /><div className="site-width page-hero-inner">
      <div className="eyebrow"><span className="line" />THE NEXT CLIMB</div>
      <h1 className="apply-title">Expeditions</h1>
      <p className="apply-lede">Upcoming climbs you can join, and the climbers who have reached the top the most.</p>
    </div></section>
    <section className="site-width apply-page">
      <div className="section-header"><div><div className="eyebrow">UPCOMING</div><h2>Sign up for a climb.</h2><p>Times are shown in your own time zone.</p></div>{isAdmin && <Button onClick={() => setCreating(true)}><Plus />New expedition</Button>}</div>
      {list.isLoading ? <div className="apply-card review-empty"><p>Loading expeditions…</p></div>
        : !list.data?.expeditions.length && !events.length ? <div className="apply-card review-empty"><Mountain /><p>No expeditions are scheduled right now. Check back soon.</p></div>
        : <div className="event-grid">
          {events.map(ev => <article key={ev.id} className={`event-card ${ev.live ? 'live' : ''}`}>
            <header className="event-top">{when(ev.starts_at, ev.live)}<span className="event-count" title="Interested"><Users />{ev.interested}</span></header>
            {ev.image_url && <img className="event-cover" src={ev.image_url} alt="" loading="lazy" />}
            <h3>{ev.name}</h3>
            {ev.description && <p className="event-desc">{ev.description}</p>}
            {ev.servers.length > 0 && <ul className="event-servers">{ev.servers.map((s, i) => <li key={s.url}><span><strong>Server {i + 1}</strong></span><a className="event-join small" href={s.url} target="_blank" rel="noreferrer">Join server</a></li>)}</ul>}
            {(ev.guide_members.length > 0 || ev.sherpa_members.length > 0) && <dl className="event-crew">{([['Guides', ev.guide_members], ['Sherpas', ev.sherpa_members]] as const).map(([label, people]) => people.length ? <div key={label}><dt>{label}</dt><dd>{crew(people)}</dd></div> : null)}</dl>}
            {ev.attendees.length > 0 && <dl className="event-crew attending"><div><dt>Attending · {ev.interested}</dt><dd>{crew(ev.attendees)}{ev.interested > ev.attendees.length && <span className="crew-more">and {ev.interested - ev.attendees.length} more</span>}</dd></div></dl>}
            <footer className="event-foot">{host(ev.location || 'Discord event')}<a className="event-join" href={ev.url} target="_blank" rel="noreferrer">Join</a></footer>
            {isAdmin && isLocal && <div className="event-staff">
              <button disabled={busy} onClick={() => { if (confirm(`Post "${ev.name} Starting Now!" to Discord?`)) void act(async () => { const r = await startEvent({ data: ev.id }); if (r.announced !== 'sent') throw new Error(`The announcement was not posted: ${r.announced}.`); }, 'Posted to Discord.'); }}><Megaphone />Announce: starting now</button>
              <button onClick={() => setEditing(ev.id)}><Pencil />Edit details</button>
            </div>}
          </article>)}
          {(list.data?.expeditions ?? []).map(ex => { const started = new Date(ex.starts_at).getTime() <= Date.now(); return <article key={ex.id} className={`event-card ${started ? 'live' : ''} ${ex.joined ? 'joined' : ''}`}>
            <header className="event-top">{when(ex.starts_at, started)}<span className="event-count" title="Signed up"><Users />{ex.climbers.length}{ex.max_spots > 0 ? ` / ${ex.max_spots}` : ''}</span></header>
            <h3>{ex.title}</h3>
            {ex.description && <p className="event-desc">{ex.description}</p>}
            {!!ex.servers?.length && <ul className="event-servers">{ex.servers.map((s, i) => <li key={s.url}><span><strong>Server {i + 1}</strong></span><a className="event-join small" href={s.url} target="_blank" rel="noreferrer">Join server</a></li>)}</ul>}
            {(ex.guides || ex.sherpas) && <dl className="event-crew">{([['Guides', ex.guides, ex.guide_members], ['Sherpas', ex.sherpas, ex.sherpa_members]] as const).map(([label, text, people]) => text ? <div key={label}><dt>{label}</dt><dd>{people?.length ? crew(people) : text}</dd></div> : null)}</dl>}
            {ex.climbers.length > 0 && <p className="event-climbers">{ex.climbers.map(name => <span key={name}>@{name}</span>)}</p>}
            <footer className="event-foot">{host(!ex.guides && !ex.sherpas && ex.leader ? `Led by ${ex.leader}` : 'Expedition')}
              <div className="event-buttons">
                {ex.event_url && <a className="event-join ghost" href={ex.event_url} target="_blank" rel="noreferrer"><DiscordIcon />Discord event</a>}
                {!me.data ? <button className="event-join" onClick={linkDiscord}>Link Discord to join</button>
                  : ex.joined ? <button className="event-join joined" disabled={busy} title="Click to cancel" onClick={() => void act(() => toggle({ data: { id: ex.id, join: false } }), 'You are off the list.')}><Check />Signed up</button>
                  : <button className="event-join" disabled={busy || ex.full} onClick={() => void act(() => toggle({ data: { id: ex.id, join: true } }), 'You are signed up. See you on the mountain.')}>{ex.full ? 'Full' : 'Join'}</button>}
              </div>
            </footer>
            {isAdmin && <div className="event-staff">
              {isLocal && <button disabled={busy} onClick={() => { if (confirm(`Post "${ex.title} Starting Now!" to Discord?`)) void act(async () => { const r = await startNow({ data: ex.id }); if (r.announced !== 'sent') throw new Error(`The announcement was not posted: ${r.announced}.`); }, 'Posted to Discord.'); }}><Megaphone />Announce: starting now</button>}
              <button className="danger" aria-label={`Delete ${ex.title}`} onClick={() => remove(ex)}><Trash2 />Delete</button>
            </div>}
          </article>; })}
        </div>}
    </section>
    <HallOfFame isLocal={isLocal} isAdmin={isAdmin} onNotice={setNotice} />
    {isAdmin && <Dialog open={!!editingEvent} onOpenChange={o => { if (!o) setEditing(null); }}><DialogContent className="editor-dialog"><DialogTitle className="panel-title">{editingEvent?.name ?? 'Discord event'}</DialogTitle><DialogDescription>This event comes from Discord, so its name, time and description are changed there. Add who is running it and the Roblox servers here.</DialogDescription>
      {editingEvent && <form className="editor-form" onSubmit={saveEvent}>
        <div className="picker-field"><span>Guides</span><DiscordPicker name="guides" initial={editingEvent.guide_members} placeholder="Paste a Discord ID, or type a name and press Enter" /></div>
        <div className="picker-field"><span>Sherpas</span><DiscordPicker name="sherpas" initial={editingEvent.sherpa_members} placeholder="Paste a Discord ID, or type a name and press Enter" /></div>
        <label>Roblox servers<textarea name="servers" rows={3} defaultValue={editingEvent.servers.map(s => s.url).join('\n')} placeholder={'One Roblox server link per line\nhttps://www.roblox.com/share?code=...&type=Server'} /></label>
        <Button disabled={busy}><Check />{busy ? 'Saving…' : 'Save details'}</Button>
      </form>}
    </DialogContent></Dialog>}
    {isAdmin && <Dialog open={creating} onOpenChange={setCreating}><DialogContent className="editor-dialog"><DialogTitle className="panel-title">New expedition</DialogTitle><DialogDescription>It appears on this page straight away and is announced on Discord if an expeditions channel is set.</DialogDescription>
      <form className="editor-form" onSubmit={create}>
        <label>Name<input name="title" required maxLength={120} placeholder="Summit push from Camp II" /></label>
        <label>Date and time<input name="starts_at" type="datetime-local" required /></label>
        {isLocal ? <><div className="picker-field"><span>Guides</span><DiscordPicker name="guides" placeholder="Paste a Discord ID, or type a name and press Enter" /></div><div className="picker-field"><span>Sherpas</span><DiscordPicker name="sherpas" placeholder="Paste a Discord ID, or type a name and press Enter" /></div></> : <label>Leader<input name="leader" maxLength={80} placeholder="Who is leading" /></label>}
        <label>Spots (0 = no limit)<input name="max_spots" type="number" min={0} max={500} defaultValue={0} /></label>
        <label>Details<textarea name="description" rows={4} maxLength={2000} placeholder="Meeting point, what to bring, expected length." /></label>
        {isLocal && <><label>Roblox servers<textarea name="servers" rows={3} placeholder={'One Roblox server link per line\nhttps://www.roblox.com/share?code=...&type=Server'} /></label>
        {list.data?.eventLinks && <label>Discord event link <small>(optional)</small><input name="event_url" list="discord-event-links" placeholder="https://discord.com/events/..." /><datalist id="discord-event-links">{events.map(ev => <option key={ev.id} value={ev.url}>{ev.name}</option>)}</datalist></label>}</>}
        <Button disabled={busy}><Plus />{busy ? 'Creating…' : 'Create expedition'}</Button>
      </form>
    </DialogContent></Dialog>}
  </ApplyShell>;
}

const RANK_ICONS = [<Crown key="1" />, <Medal key="2" />, <Medal key="3" />];

function HallOfFame({ isLocal, isAdmin, onNotice }: { isLocal: boolean; isAdmin: boolean; onNotice: (m: string) => void }) {
  const qc = useQueryClient();
  const load = useServerFn(getHallOfFame); const saveLocal = useServerFn(saveLocalClimber); const removeLocal = useServerFn(deleteLocalClimber); const lookup = useServerFn(lookupDiscord);
  const climbers = useQuery({ queryKey: ['hall-of-fame'], queryFn: () => load() });
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const [status, setStatus] = useState(''); const [pickKey, setPickKey] = useState(0);
  const refresh = () => qc.invalidateQueries({ queryKey: ['hall-of-fame'] });
  async function run(action: () => Promise<unknown>, ok: string) { setBusy(true); setStatus(''); try { await action(); setStatus(ok); await refresh(); } catch (e) { setStatus(message(e, 'Could not save.')); } finally { setBusy(false); } }
  function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = e.currentTarget; const f = new FormData(form);
    const picked = readPicked(f.get('climber'))[0];
    if (!picked?.id) { setStatus('Paste the climber’s Discord user ID first.'); return; }
    const input = { discord_id: picked.id, summits: Number(f.get('summits') || 0), note: String(f.get('note')).trim() };
    void run(async () => {
      if (isLocal) await saveLocal({ data: input });
      else { const identity = await lookup({ data: input.discord_id }); const { error } = await tables.from('hall_of_fame').upsert({ ...identity, summits: input.summits, note: input.note }, { onConflict: 'discord_id' }); if (error) throw error; logStaff('Hall of fame updated', [`${identity.username}: ${input.summits} summits`]); }
      form.reset(); setPickKey(k => k + 1);
    }, 'Saved.');
  }
  const remove = (id: string) => void run(async () => { if (isLocal) await removeLocal({ data: id }); else { const { error } = await tables.from('hall_of_fame').delete().eq('id', id); if (error) throw error; logStaff('Removed from the hall of fame'); } }, 'Removed.');
  const all = climbers.data ?? []; const podium = all.slice(0, 3); const rest = all.slice(3);

  return <section className="site-width hall-section" id="hall-of-fame">
    <div className="section-header"><div><div className="eyebrow">HALL OF FAME</div><h2>Most summits with Apex.</h2><p>The climbers who keep reaching the top.</p></div>{isAdmin && <Button variant="outline" onClick={() => { setOpen(true); onNotice(''); }}><Trophy />Manage hall of fame</Button>}</div>
    {all.length === 0 ? <div className="apply-card review-empty"><Trophy /><p>The hall of fame is waiting for its first climber.</p></div> : <>
      <div className="podium">{podium.map((c, i) => <article key={c.id} className={`podium-card rank-${i + 1}`}>
        <span className="podium-rank">{RANK_ICONS[i]}{i + 1}</span>
        <DiscordAvatar user={c} large />
        <h3>{c.username}</h3>
        <p className="podium-summits"><strong>{c.summits}</strong> summits</p>
        {c.note && <p className="podium-note">{c.note}</p>}
      </article>)}</div>
      {rest.length > 0 && <ol className="hall-list" start={4}>{rest.map((c, i) => <li key={c.id}><span className="hall-rank">{i + 4}</span><DiscordAvatar user={c} /><span className="hall-name"><strong>{c.username}</strong>{c.note && <small>{c.note}</small>}</span><span className="hall-summits"><strong>{c.summits}</strong> summits</span></li>)}</ol>}
    </>}
    {isAdmin && <Dialog open={open} onOpenChange={setOpen}><DialogContent className="editor-dialog"><DialogTitle className="panel-title">Hall of fame</DialogTitle><DialogDescription>Add a climber by Discord ID, or enter the same ID again to change their summit count.</DialogDescription>
      <form className="editor-form" onSubmit={add}>
        <div className="picker-field"><span>Climber</span><DiscordPicker key={pickKey} name="climber" single required placeholder="Paste their Discord user ID" /></div>
        <div className="form-columns"><label>Summits<input name="summits" type="number" min={0} required defaultValue={1} /></label><label>Note (optional)<input name="note" maxLength={120} placeholder="First to summit" /></label></div>
        <Button disabled={busy}><Plus />Add or update climber</Button>
      </form>
      <h3>Listed climbers</h3>
      <div className="editor-list">{all.map(c => <div key={c.id}><span>{c.username}<small>{c.summits} summits</small></span><Button variant="ghost" size="icon" aria-label={`Remove ${c.username}`} disabled={busy} onClick={() => remove(c.id)}><Trash2 /></Button></div>)}</div>
      {status && <p role="status" className="editor-message">{status}</p>}
    </DialogContent></Dialog>}
  </section>;
}
