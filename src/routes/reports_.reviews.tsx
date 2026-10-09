import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useEffect, useMemo, useState } from 'react';
import { Check, X, RotateCcw, Search, Inbox, BellOff, BellRing, ArrowDown } from 'lucide-react';
import { DiscordAvatar } from '@/components/community';
import { ReportChat } from '@/components/report-chat';
import { HeroBackdrop } from '@/components/hero-slides';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { logStaff } from '@/lib/staff-log';
import { editorReports, supervisorDecision, supervisorReports, type Report } from '@/lib/community.functions';
import { ApplyShell, DiscordIcon, apexQuery, useApplyAccess } from '@/components/apply-shell';

export const Route = createFileRoute('/reports_/reviews')({
  head: () => ({ meta: [{ title: 'Review Reports — Apex' }, { name: 'description', content: 'Apex supervision reviews member reports.' }, { property: 'og:title', content: 'Review Reports — Apex' }, { property: 'og:description', content: 'Apex supervision reviews member reports.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }, { name: 'robots', content: 'noindex' }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(apexQuery),
  component: ReportReviews,
});

const FILTERS = ['open', 'resolved', 'dismissed', 'all'] as const;
type Status = 'open' | 'resolved' | 'dismissed';

function ReportReviews() {
  const { isAdmin, isSupervisor, me, role, user, linkDiscord } = useApplyAccess();
  const qc = useQueryClient();
  const asSupervisor = useServerFn(supervisorReports); const asEditor = useServerFn(editorReports); const decide = useServerFn(supervisorDecision);
  const allowed = isAdmin || isSupervisor;
  // Discord alerts link straight to one report with ?report=<id>.
  useEffect(() => { const id = new URLSearchParams(window.location.search).get('report'); if (id) { setFilter('all'); setSel(id); } }, []);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('open');
  const [q, setQ] = useState(''); const [sel, setSel] = useState<string | null>(null); const [notice, setNotice] = useState('');
  // Proof links are signed for five minutes, so the list is refreshed before they expire.
  const reports = useQuery({ queryKey: ['reports', isSupervisor ? 'supervisor' : 'editor'], enabled: allowed, refetchInterval: 240000, queryFn: () => (isSupervisor ? asSupervisor() : asEditor()) as Promise<Report[]> });
  const list = useMemo(() => (reports.data ?? []).filter(r => (filter === 'all' || r.status === filter) && `${r.reported_name} ${r.reported_discord_id} ${r.reporter_username}`.toLowerCase().includes(q.toLowerCase())), [reports.data, filter, q]);
  // The open report is looked up in the full list so its panel stays open when a decision moves it to another tab.
  const current = (reports.data ?? []).find(r => r.id === sel);
  const count = (f: string) => (reports.data ?? []).filter(r => f === 'all' || r.status === f).length;

  const [reason, setReason] = useState('');
  async function setStatus(id: string, status: Status) {
    try {
      let dm = '';
      if (isSupervisor) dm = (await decide({ data: { id, status, reason } })).dm;
      else { const { error } = await supabase.from('reports').update({ status, reviewed_by: user?.email ?? '' }).eq('id', id); if (error) throw error; logStaff(status === 'open' ? 'Report reopened' : `Report ${status}`, [`Report ${id}`]); }
      setNotice((status === 'open' ? 'Report reopened.' : `Report ${status}.`) + (dm === 'sent' ? ' The reporter was sent a DM.' : dm === 'unavailable' ? ' No DM was sent: no Discord bot is connected.' : dm ? ` The DM ${dm}.` : '')); setReason('');
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Could not update the report.'); }
    await qc.invalidateQueries({ queryKey: ['reports'] });
  }

  if (!allowed) return <ApplyShell active="report-reviews"><section className="site-width apply-page"><div className="eyebrow">RESTRICTED</div><h1 className="apply-title">Report reviews are for supervision.</h1><p className="apply-lede">{me.isLoading || role.isLoading ? 'Checking access…' : me.data ? 'Your Discord account is not on the supervision list.' : 'Link the Discord account that was added to supervision to continue.'}</p>{!me.data && !me.isLoading && <Button onClick={linkDiscord}><DiscordIcon />Link your Discord</Button>}</section></ApplyShell>;

  return <ApplyShell active="report-reviews" notice={notice} onNotice={setNotice}>
    <section className="page-hero page-banner banner-slim"><HeroBackdrop /><div className="site-width page-hero-inner"><div className="eyebrow"><span className="line" />SUPERVISION</div><h1 className="apply-title">Review reports</h1><p className="apply-lede">Open a card to see the proof and chat with the reporter, then resolve or dismiss.</p></div></section>
    <section className="site-width apply-page">
      <div className="section-header"><div><div className="eyebrow">QUEUE</div><h2>Reports</h2></div><div className="search-box"><Search /><input placeholder="Search name or Discord ID" value={q} onChange={e => setQ(e.target.value)} /></div></div>
      <div className="filter-tabs review-filters">{FILTERS.map(f => <Button key={f} variant={filter === f ? 'secondary' : 'ghost'} onClick={() => { setFilter(f); setSel(null); }}>{f.charAt(0).toUpperCase() + f.slice(1)} <span className="tab-count">{count(f)}</span></Button>)}</div>
      {reports.isLoading ? <div className="apply-card review-empty"><p>Loading reports…</p></div>
        : reports.error ? <div className="apply-card review-empty"><p>{reports.error.message}</p></div>
        : list.length === 0 && !current ? <div className="apply-card review-empty"><Inbox /><p>No {filter === 'all' ? '' : filter} reports.</p></div>
        : <div className="review-board">
          <ul className="review-grid">{list.map(r => <li key={r.id}><button className={`review-item ${current?.id === r.id ? 'active' : ''}`} onClick={() => { setSel(r.id); setReason(''); }}><DiscordAvatar user={{ avatar_url: r.reported_avatar_url, username: r.reported_name }} /><span className="review-item-body"><strong>{r.reported_name}</strong><small>by @{r.reporter_username} · {new Date(r.created_at).toLocaleDateString()}</small></span><span className={`sub-status ${r.status}`}>{r.status}</span><span className="review-snippet">{r.reason}</span></button></li>)}</ul>
          <Dialog open={!!current} onOpenChange={o => { if (!o) setSel(null); }}><DialogContent className="editor-dialog review-panel"><DialogTitle className="panel-title">Report</DialogTitle><DialogDescription className="sr-only">Details, chat and decision for this report.</DialogDescription>{current && <article className="review-detail">
            <div className="review-detail-head report-head"><div className="report-parties">
              <div className="identity"><DiscordAvatar user={{ avatar_url: current.reporter_avatar_url, username: current.reporter_username }} large /><div><span className="party-label">Reported by</span><strong>@{current.reporter_username}</strong><small>Discord ID {current.reporter_discord_id}</small></div></div>
              <span className="party-link"><ArrowDown />is reporting</span>
              <div className="identity"><DiscordAvatar user={{ avatar_url: current.reported_avatar_url, username: current.reported_name }} large /><div><span className="party-label reported">Reported user</span><strong>{current.reported_name}</strong><small>Discord ID {current.reported_discord_id}</small></div></div>
            </div><span className={`sub-status ${current.status}`}>{current.status}</span></div>
            <small className="review-meta">Sent {new Date(current.created_at).toLocaleString()}</small>
            <dl className="review-answers">
              <div><dt>Why they were reported</dt><dd>{current.reason}</dd></div>
              <div><dt>Proof</dt>{current.proof_url ? <dd className="proof-view"><a href={current.proof_url} target="_blank" rel="noreferrer"><img src={current.proof_url} alt="Proof attached to the report" /></a></dd> : <dd>No image attached.</dd>}</div>
            </dl>
            <p className={`notify-line ${current.notification_status}`}>{current.notification_status === 'sent' ? <><BellRing />Discord alert sent.</> : <><BellOff />{current.notification_status === 'not_configured' ? 'No Discord alert was sent: the channel is not set up.' : current.notification_status === 'failed' ? `Discord alert failed: ${current.notification_error}` : 'Discord alert pending.'}</>}</p>
            {isSupervisor && <ReportChat key={current.id} reportId={current.id} as="supervision" />}
            {current.status === 'open' ? (isSupervisor && <label className="decision-reason">Reason <small>(optional, sent to the reporter when you resolve or dismiss)</small><textarea rows={2} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} placeholder="What was decided and why" /></label>)
              : <div className="decision-note"><strong>{current.status === 'resolved' ? 'Resolved' : 'Dismissed'}</strong>{current.decision_reason ? <p>{current.decision_reason}</p> : <p className="muted">No reason was given.</p>}</div>}
            <div className="review-actions">{current.status === 'open' ? <><span /><div className="sub-actions"><Button variant="outline" onClick={() => setStatus(current.id, 'dismissed')}><X />Dismiss</Button><Button onClick={() => setStatus(current.id, 'resolved')}><Check />Resolve</Button></div></> : <><span /><Button variant="outline" onClick={() => setStatus(current.id, 'open')}><RotateCcw />Reopen</Button></>}</div>
          </article>}</DialogContent></Dialog>
        </div>}
    </section>
  </ApplyShell>;
}
