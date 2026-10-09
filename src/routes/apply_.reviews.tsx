import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Check, X, Trash2, Search, Inbox, LockKeyhole, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { logStaff } from '@/lib/staff-log';
import { useServerFn } from '@tanstack/react-start';
import { addLocalApplicationNote, decideApplication, getLocalApplicationNotes, getLocalApplications, updateLocalApplication, type ApplicationForm } from '@/lib/apply.functions';
import { ApplicationNotes } from '@/components/application-notes';
import { DiscordAvatar } from '@/components/community';
import { HeroBackdrop } from '@/components/hero-slides';
import { ApplyShell, DiscordIcon, apexQuery, useApplyAccess } from '@/components/apply-shell';

export const Route = createFileRoute('/apply_/reviews')({
  head: () => ({ meta: [{ title: 'Review Applications — Apex' }, { name: 'description', content: 'Apex admins review climber applications.' }, { property: 'og:title', content: 'Review Applications — Apex' }, { property: 'og:description', content: 'Review and decide on Apex climber applications.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }, { name: 'robots', content: 'noindex' }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(apexQuery),
  component: Reviews,
});

type Sub = { id: string; form_id: string; discord_id: string; discord_username: string; answers: Record<string, string>; status: string; created_at: string; form_title?: string; avatar_url?: string; decision_reason?: string; dm_status?: string };
const FILTERS = ['pending', 'accepted', 'denied', 'all'] as const;

function Reviews() {
  const { isAdmin, role, user } = useApplyAccess();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('pending');
  const [q, setQ] = useState(''); const [sel, setSel] = useState<string | null>(null); const [notice, setNotice] = useState('');
  // In local test mode applications live on this computer; otherwise they are read from the database.
  const loadLocal = useServerFn(getLocalApplications); const updateLocal = useServerFn(updateLocalApplication); const decideLive = useServerFn(decideApplication);
  const [reason, setReason] = useState('');
  const local = useQuery({ queryKey: ['local-apps'], enabled: isAdmin, refetchInterval: 15000, queryFn: () => loadLocal() });
  const isLocal = Array.isArray(local.data);
  const forms = useQuery({ queryKey: ['admin-forms'], enabled: isAdmin, queryFn: async () => { const { data, error } = await supabase.from('application_forms').select('*'); if (error) throw error; return data as unknown as ApplicationForm[]; } });
  const remote = useQuery({ queryKey: ['admin-subs'], enabled: isAdmin && local.isSuccess && !isLocal, queryFn: async () => { const { data, error } = await supabase.from('application_submissions').select('*').order('created_at', { ascending: false }); if (error) throw error; return data as unknown as Sub[]; } });
  const subs = { data: isLocal ? (local.data as Sub[]) : remote.data };
  const titleOf = (s: Sub) => forms.data?.find(f => f.id === s.form_id)?.title ?? s.form_title ?? 'Application';
  const dmNote = (dm: string) => dm === 'sent' ? ' The applicant was sent a DM.' : dm === 'unavailable' ? ' No DM was sent: no Discord bot is connected.' : dm ? ` The DM ${dm}.` : '';
  const roleNote = (role: string) => role === 'given' ? ' Their Discord role was added.' : role === 'unavailable' ? ' The Discord role was not added: no bot is connected.' : role ? ` The Discord role was not added (${role}).` : '';
  async function setStatus(id: string, status: 'accepted' | 'denied' | 'deleted', ok: string) {
    try {
      let dm = ''; let role = '';
      if (isLocal) { const r = await updateLocal({ data: { id, status, reason } }); dm = r.dm; role = 'role' in r ? r.role : ''; }
      else if (status === 'deleted') { const { error } = await supabase.from('application_submissions').delete().eq('id', id); if (error) throw error; logStaff('Application deleted'); }
      else { const r = await decideLive({ data: { id, status, reason } }); dm = r.dm; role = r.role; }
      setNotice(ok + dmNote(dm) + roleNote(role)); setReason('');
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Could not update the application.'); }
    await Promise.all([qc.invalidateQueries({ queryKey: ['admin-subs'] }), qc.invalidateQueries({ queryKey: ['local-apps'] })]);
  }
  const formOf = (id: string) => forms.data?.find(f => f.id === id);
  const list = useMemo(() => (subs.data ?? []).filter(s => (filter === 'all' || s.status === filter) && (`${s.discord_username} ${s.discord_id}`.toLowerCase().includes(q.toLowerCase()))), [subs.data, filter, q]);
  // The open application is looked up in the full list so its panel stays open when a decision moves it to another tab.
  const current = (subs.data ?? []).find(s => s.id === sel);
  const count = (f: string) => (subs.data ?? []).filter(s => f === 'all' || s.status === f).length;

  if (!isAdmin) return <ApplyShell active="reviews"><section className="site-width apply-page"><div className="eyebrow">RESTRICTED</div><h1 className="apply-title">Reviews are for the crew.</h1><p className="apply-lede">{user ? (role.isLoading ? 'Checking access…' : 'Your account does not have admin access.') : 'Link the Discord account that has staff access to review applications.'}</p></section></ApplyShell>;

  return <ApplyShell active="reviews" notice={notice} onNotice={setNotice}>
    <section className="page-hero page-banner banner-slim"><HeroBackdrop /><div className="site-width page-hero-inner"><div className="eyebrow"><span className="line" />CONTROL ROOM</div><h1 className="apply-title">Review applications</h1><p className="apply-lede">Open a card to read the answers, then accept or deny. The applicant is told by Discord DM.</p></div></section>
    <section className="site-width apply-page">
      <div className="section-header"><div><div className="eyebrow">QUEUE</div><h2>Applications</h2></div><div className="search-box"><Search /><input placeholder="Search Discord user or ID" value={q} onChange={e => setQ(e.target.value)} /></div></div>
      <div className="filter-tabs review-filters">{FILTERS.map(f => <Button key={f} variant={filter === f ? 'secondary' : 'ghost'} onClick={() => { setFilter(f); setSel(null); }}>{f.charAt(0).toUpperCase() + f.slice(1)} <span className="tab-count">{count(f)}</span></Button>)}</div>
      {list.length === 0 && !current ? <div className="apply-card review-empty"><Inbox /><p>No {filter === 'all' ? '' : filter} applications.</p></div> :
      <div className="review-board">
        <ul className="review-grid">{list.map(s => <li key={s.id}><button className={`review-item ${current?.id === s.id ? 'active' : ''}`} onClick={() => { setSel(s.id); setReason(''); }}><DiscordAvatar user={{ avatar_url: s.avatar_url ?? '', username: s.discord_username }} /><span className="review-item-body"><strong>@{s.discord_username}</strong><small>{new Date(s.created_at).toLocaleDateString()}</small></span><span className={`sub-status ${s.status}`}>{s.status}</span><span className="review-snippet"><strong>{titleOf(s)}</strong>{Object.keys(s.answers).length} answers</span></button></li>)}</ul>
        <Dialog open={!!current} onOpenChange={o => { if (!o) setSel(null); }}><DialogContent className="editor-dialog review-panel"><DialogTitle className="panel-title">Application</DialogTitle><DialogDescription className="sr-only">Answers and decision for this application.</DialogDescription>{current && <article className="review-detail">
          <div className="review-detail-head"><div className="identity"><DiscordAvatar user={{ avatar_url: current.avatar_url ?? '', username: current.discord_username }} large /><div><strong>@{current.discord_username}</strong><small>Discord ID {current.discord_id}</small></div></div><span className={`sub-status ${current.status}`}>{current.status}</span></div>
          <small className="review-meta">{titleOf(current)} · {new Date(current.created_at).toLocaleString()}</small>
          <dl className="review-answers">{Object.entries(current.answers).map(([id, a], i) => <div key={id}><dt><span className="question-num">{i + 1}</span>{formOf(current.form_id)?.questions.find(x => x.id === id)?.label ?? id}</dt><dd>{a || '—'}</dd></div>)}</dl>
          <ReviewNotes key={current.id} submissionId={current.id} isLocal={isLocal} />
          {current.status === 'pending' ? <label className="decision-reason">Reason <small>(optional, sent to the applicant with the decision)</small><textarea rows={2} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} placeholder="Why this application is being accepted or denied" /></label>
            : <div className="decision-note"><strong>{current.status === 'accepted' ? 'Accepted' : 'Denied'}</strong>{current.decision_reason ? <p>{current.decision_reason}</p> : <p className="muted">No reason was given.</p>}{current.dm_status && <small>{current.dm_status === 'sent' ? 'The applicant was sent a DM.' : current.dm_status === 'unavailable' ? 'No DM was sent: no Discord bot is connected.' : `DM ${current.dm_status}`}</small>}</div>}
          <div className="review-actions"><Button size="icon" variant="ghost" aria-label="Delete submission" onClick={() => { if (confirm('Delete this submission?')) void setStatus(current.id, 'deleted', 'Deleted.'); }}><Trash2 /></Button><div className="sub-actions"><Button variant="outline" onClick={() => setStatus(current.id, 'denied', 'Denied.')}><X />Deny</Button><Button onClick={() => setStatus(current.id, 'accepted', 'Accepted.')}><Check />Accept</Button></div></div>
        </article>}</DialogContent></Dialog>
      </div>}
    </section>
  </ApplyShell>;
}

// Private notes other reviewers can read. The applicant never sees them.
// Local test mode keeps them on this computer; the live site uses the database's notes table.
function ReviewNotes({ submissionId, isLocal }: { submissionId: string; isLocal: boolean }) {
  const qc = useQueryClient();
  const load = useServerFn(getLocalApplicationNotes); const add = useServerFn(addLocalApplicationNote);
  const notes = useQuery({ queryKey: ['local-app-notes', submissionId], enabled: isLocal, queryFn: () => load({ data: submissionId }) });
  const [text, setText] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  if (!isLocal) return <ApplicationNotes submissionId={submissionId} />;
  async function save() {
    if (!text.trim()) return;
    setBusy(true); setError('');
    try { await add({ data: { submissionId, body: text.trim() } }); setText(''); await qc.invalidateQueries({ queryKey: ['local-app-notes', submissionId] }); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save the note.'); } finally { setBusy(false); }
  }
  return <section className="private-notes">
    <h3><LockKeyhole />Staff notes <small>only reviewers see these</small></h3>
    {notes.data?.length === 0 && <p className="note-empty">No notes yet.</p>}
    {notes.data?.map(n => <div className="note-entry" key={n.id}><small>{n.author} · {new Date(n.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</small><p>{n.body}</p></div>)}
    <div className="note-form"><textarea rows={2} maxLength={4000} value={text} onChange={e => setText(e.target.value)} placeholder="Add a note for other reviewers" aria-label="New staff note" /><Button type="button" variant="outline" size="sm" disabled={busy || !text.trim()} onClick={() => void save()}><Plus />Add note</Button></div>
    {error && <p role="alert" className="chat-error">{error}</p>}
  </section>;
}