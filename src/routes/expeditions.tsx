import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CalendarDays, Check, Crown, Medal, Mountain, Plus, Trash2, Trophy, UserRound, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { logStaff } from '@/lib/staff-log';
import { ApplyShell, DiscordIcon, apexQuery, useApplyAccess } from '@/components/apply-shell';
import { DiscordAvatar } from '@/components/community';
import { HeroBackdrop } from '@/components/hero-slides';
import { lookupDiscord } from '@/lib/community.functions';
import { announceExpedition, deleteLocalClimber, deleteLocalExpedition, getExpeditions, getHallOfFame, saveLocalClimber, saveLocalExpedition, toggleExpeditionSignup, type ExpeditionView } from '@/lib/expeditions.functions';

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
  const createLocal = useServerFn(saveLocalExpedition); const removeLocal = useServerFn(deleteLocalExpedition); const announce = useServerFn(announceExpedition);
  const list = useQuery({ queryKey: ['expeditions', me.data?.id ?? 'guest'], queryFn: () => load() });
  const isLocal = list.data?.local ?? false;
  const [creating, setCreating] = useState(false); const [busy, setBusy] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ['expeditions'] });

  async function act(action: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try { await action(); setNotice(ok); await refresh(); return true; } catch (e) { setNotice(message(e, 'Something went wrong.')); return false; } finally { setBusy(false); }
  }
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = e.currentTarget; const f = new FormData(form);
    const input = { title: String(f.get('title')).trim(), description: String(f.get('description')).trim(), starts_at: new Date(String(f.get('starts_at'))).toISOString(), leader: String(f.get('leader')).trim(), max_spots: Number(f.get('max_spots') || 0) };
    let announced = '';
    const ok = await act(async () => {
      if (isLocal) announced = (await createLocal({ data: input })).announced;
      else { const { data, error } = await tables.from('expeditions').insert(input).select('id').single(); if (error) throw error; announced = (await announce({ data: data.id as string })).announced; logStaff('Expedition created', [input.title, `Announcement: ${announced}`]); }
    }, 'Expedition created.');
    if (ok) { setNotice(`Expedition created. Discord announcement: ${announced}.`); form.reset(); setCreating(false); }
  }
  const remove = (ex: ExpeditionView) => { if (confirm(`Delete "${ex.title}" and its sign-ups?`)) void act(async () => { if (isLocal) await removeLocal({ data: ex.id }); else { const { error } = await tables.from('expeditions').delete().eq('id', ex.id); if (error) throw error; logStaff('Expedition deleted', [ex.title]); } }, 'Expedition deleted.'); };

  return <ApplyShell active="expeditions" notice={notice} onNotice={setNotice}>
    <section className="page-hero page-banner"><HeroBackdrop /><div className="site-width page-hero-inner">
      <div className="eyebrow"><span className="line" />THE NEXT CLIMB</div>
      <h1 className="apply-title">Expeditions</h1>
      <p className="apply-lede">Upcoming climbs you can join, and the climbers who have reached the top the most.</p>
    </div></section>
    <section className="site-width apply-page">
      <div className="section-header"><div><div className="eyebrow">UPCOMING</div><h2>Sign up for a climb.</h2><p>Times are shown in your own time zone.</p></div>{isAdmin && <Button onClick={() => setCreating(true)}><Plus />New expedition</Button>}</div>
      {list.isLoading ? <div className="apply-card review-empty"><p>Loading expeditions…</p></div>
        : !list.data?.expeditions.length ? <div className="apply-card review-empty"><Mountain /><p>No expeditions are scheduled right now. Check back soon.</p></div>
        : <div className="expedition-grid">{list.data.expeditions.map(ex => { const at = new Date(ex.starts_at); return <article key={ex.id} className={`expedition-card ${ex.joined ? 'joined' : ''}`}>
          <div className="expedition-date"><small>{at.toLocaleDateString([], { month: 'short' })}</small><strong>{at.getDate()}</strong><span>{at.toLocaleDateString([], { weekday: 'short' })}</span></div>
          <div className="expedition-body">
            <h3>{ex.title}</h3>
            <p className="expedition-meta"><span><CalendarDays />{at.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>{ex.leader && <span><UserRound />Led by {ex.leader}</span>}<span><Users />{ex.climbers.length}{ex.max_spots > 0 ? ` / ${ex.max_spots}` : ''} signed up</span></p>
            {ex.description && <p className="expedition-text">{ex.description}</p>}
            {ex.climbers.length > 0 && <p className="expedition-climbers">{ex.climbers.map(name => <span key={name}>@{name}</span>)}</p>}
            <div className="expedition-actions">
              {!me.data ? <Button onClick={linkDiscord}><DiscordIcon />Link Discord to sign up</Button>
                : ex.joined ? <><span className="expedition-joined"><Check />You are signed up</span><Button variant="outline" size="sm" disabled={busy} onClick={() => void act(() => toggle({ data: { id: ex.id, join: false } }), 'You are off the list.')}>Cancel</Button></>
                : <Button disabled={busy || ex.full} onClick={() => void act(() => toggle({ data: { id: ex.id, join: true } }), 'You are signed up. See you on the mountain.')}>{ex.full ? 'Expedition full' : 'Sign up'}</Button>}
              {isAdmin && <Button variant="ghost" size="icon" title="Delete expedition" aria-label={`Delete ${ex.title}`} onClick={() => remove(ex)}><Trash2 /></Button>}
            </div>
          </div>
        </article>; })}</div>}
    </section>
    <HallOfFame isLocal={isLocal} isAdmin={isAdmin} onNotice={setNotice} />
    {isAdmin && <Dialog open={creating} onOpenChange={setCreating}><DialogContent className="editor-dialog"><DialogTitle className="panel-title">New expedition</DialogTitle><DialogDescription>It appears on this page straight away and is announced on Discord if an expeditions channel is set.</DialogDescription>
      <form className="editor-form" onSubmit={create}>
        <label>Name<input name="title" required maxLength={120} placeholder="Summit push from Camp II" /></label>
        <label>Date and time<input name="starts_at" type="datetime-local" required /></label>
        <div className="form-columns"><label>Leader<input name="leader" maxLength={80} placeholder="Who is leading" /></label><label>Spots (0 = no limit)<input name="max_spots" type="number" min={0} max={500} defaultValue={0} /></label></div>
        <label>Details<textarea name="description" rows={4} maxLength={2000} placeholder="Meeting point, what to bring, expected length." /></label>
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
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const [status, setStatus] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: ['hall-of-fame'] });
  async function run(action: () => Promise<unknown>, ok: string) { setBusy(true); setStatus(''); try { await action(); setStatus(ok); await refresh(); } catch (e) { setStatus(message(e, 'Could not save.')); } finally { setBusy(false); } }
  function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = e.currentTarget; const f = new FormData(form);
    const input = { discord_id: String(f.get('discord_id')).trim(), summits: Number(f.get('summits') || 0), note: String(f.get('note')).trim() };
    void run(async () => {
      if (isLocal) await saveLocal({ data: input });
      else { const identity = await lookup({ data: input.discord_id }); const { error } = await tables.from('hall_of_fame').upsert({ ...identity, summits: input.summits, note: input.note }, { onConflict: 'discord_id' }); if (error) throw error; logStaff('Hall of fame updated', [`${identity.username}: ${input.summits} summits`]); }
      form.reset();
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
        <label>Discord user ID<input name="discord_id" required pattern="[0-9]{17,20}" placeholder="Discord user ID" /></label>
        <div className="form-columns"><label>Summits<input name="summits" type="number" min={0} required defaultValue={1} /></label><label>Note (optional)<input name="note" maxLength={120} placeholder="First to summit" /></label></div>
        <Button disabled={busy}><Plus />Add or update climber</Button>
      </form>
      <h3>Listed climbers</h3>
      <div className="editor-list">{all.map(c => <div key={c.id}><span>{c.username}<small>{c.summits} summits</small></span><Button variant="ghost" size="icon" aria-label={`Remove ${c.username}`} disabled={busy} onClick={() => remove(c.id)}><Trash2 /></Button></div>)}</div>
      {status && <p role="status" className="editor-message">{status}</p>}
    </DialogContent></Dialog>}
  </section>;
}
