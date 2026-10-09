import { createFileRoute, Link } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useEffect, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Check, ChevronDown, ImagePlus, LogOut, Send, ShieldAlert, X, ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { findReportTarget, submitReport } from '@/lib/community.functions';
import { ApplyShell, DiscordIcon, apexQuery, useApplyAccess } from '@/components/apply-shell';
import { DiscordAvatar, RoleBadge } from '@/components/community';
import { ReportChat } from '@/components/report-chat';
import { HeroBackdrop } from '@/components/hero-slides';
import { myReports } from '@/lib/report-chat.functions';

export const Route = createFileRoute('/reports')({
  head: () => ({ meta: [{ title: 'Report a member — Apex' }, { name: 'description', content: 'Privately report a member to Apex supervision.' }, { property: 'og:title', content: 'Report a member — Apex' }, { property: 'og:description', content: 'Privately report a member to Apex supervision.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(apexQuery),
  component: Reports,
  errorComponent: () => <div className="site-width py-20"><h1>Reports are temporarily unavailable</h1><p>Please refresh in a moment.</p></div>,
});

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
type ImageType = (typeof IMAGE_TYPES)[number];
const MAX_IMAGE = 5 * 1024 * 1024;

function readBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('Could not read the image.'));
    reader.readAsDataURL(file);
  });
}

function Reports() {
  const { me, isAdmin, isSupervisor, linkDiscord, unlink } = useApplyAccess();
  const send = useServerFn(submitReport);
  const qc = useQueryClient();
  const find = useServerFn(findReportTarget);
  const [targetId, setTargetId] = useState('');
  const target = useQuery({ queryKey: ['report-target', targetId], enabled: !!me.data && /^\d{17,20}$/.test(targetId), staleTime: 300000, queryFn: () => find({ data: targetId }) });
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [proof, setProof] = useState<File | null>(null);
  const [preview, setPreview] = useState('');

  function pick(file: File | undefined) {
    if (preview) URL.revokeObjectURL(preview);
    if (!file) { setProof(null); setPreview(''); return; }
    if (!IMAGE_TYPES.includes(file.type as ImageType) || file.size > MAX_IMAGE) { setProof(null); setPreview(''); setNotice('Choose a PNG, JPEG, or WebP image under 5 MB.'); return; }
    setProof(file); setPreview(URL.createObjectURL(file));
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setNotice('');
    try {
      const image = proof ? { data: await readBase64(proof), type: proof.type as ImageType } : undefined;
      const result = await send({ data: { discordId: targetId, reason: String(f.get('reason')), image } });
      pick(undefined); setTargetId(''); setDone(true); void qc.invalidateQueries({ queryKey: ['my-reports'] });
      if (result.local) setNotice('Report saved on this computer (local copy).');
    } catch (err) { setNotice(err instanceof Error ? err.message : 'Could not send the report. Please try again.'); } finally { setBusy(false); }
  }

  return <ApplyShell active="reports" notice={notice} onNotice={setNotice}>
    <div className="focus-page">
      <div className="focus-bg" aria-hidden="true"><HeroBackdrop /></div>
      <section className="focus-panel tone-report">
        <header className="focus-head">
          <div className="focus-title-row">
            <div><div className="eyebrow"><span className="line" />APEX SUPERVISION</div><h1 className="focus-title">Report a member</h1><p className="focus-lede">Tell us who, why, and show us proof. Reports are private and only Apex supervision can read them.</p></div>
            <span className="focus-emblem"><ShieldAlert /></span>
          </div>
          <div className="focus-identity">{me.data
            ? <><DiscordAvatar user={me.data} /><div><strong>@{me.data.username}</strong><small>Attached to your report · ID {me.data.id}</small></div><RoleBadge role={me.data.role} /><Button variant="ghost" size="sm" onClick={unlink}><LogOut />Unlink</Button></>
            : <><DiscordAvatar user={null} /><div><strong>Link your Discord first</strong><small>Reports are tied to your Discord so supervision can follow up with you.</small></div><Button onClick={linkDiscord} disabled={me.isLoading}><DiscordIcon />Link Discord<ArrowUpRight /></Button></>}</div>
          <p className="focus-rules">Not sure if it counts? Read the <Link to="/rules">Expedition Expectations</Link> first.</p>
          {(isAdmin || isSupervisor) && <Button variant="outline" size="sm" asChild className="focus-staff-link"><Link to="/reports/reviews"><ClipboardCheck />Review reports</Link></Button>}
        </header>
        {done ? <div className="done-card"><span className="done-icon"><Check /></span><h2>Report sent</h2><p>Supervision has been notified and will look into it.</p><Button variant="outline" onClick={() => setDone(false)}>Send another report</Button></div>
          : !me.data ? <p className="focus-locked"><ShieldAlert />Link your Discord above to open the report form. False reports may lead to action on your own account.</p>
          : <form className="apply-questions" onSubmit={submit}>
            <label className="question-block"><span className="question-head"><span className="question-num">1</span><span>Discord user ID of the person you are reporting <em>*</em></span></span><input name="discord_id" required pattern="[0-9]{17,20}" inputMode="numeric" placeholder="e.g. 123456789012345678" value={targetId} onChange={e => setTargetId(e.target.value.trim())} />
              {target.isFetching ? <small className="field-hint">Looking up that user…</small> : target.data?.status === 'found' ? <span className="target-found"><DiscordAvatar user={target.data.user} /><span><strong>{target.data.user.display_name}</strong><small>@{target.data.user.username}</small></span></span> : target.data?.status === 'missing' ? <small className="field-hint target-missing">No Discord user has that ID.</small> : null}<small className="field-hint">In Discord, turn on Developer Mode, right-click the user, and choose Copy User ID.</small></label>
            <label className="question-block"><span className="question-head"><span className="question-num">2</span><span>Why are you reporting this person? <em>*</em></span></span><textarea name="reason" required minLength={10} maxLength={4000} rows={6} placeholder="What happened, where, and when." /></label>
            <div className="question-block"><span className="question-head"><span className="question-num">3</span><span>Provide proof</span></span><small className="field-hint">Attach a screenshot that shows what happened. PNG, JPEG, or WebP, up to 5 MB.</small>
              {preview ? <div className="proof-preview"><img src={preview} alt="Attached proof" /><Button type="button" variant="outline" size="sm" onClick={() => pick(undefined)}><X />Remove image</Button></div>
                : <label className="proof-drop"><ImagePlus /><span>Attach an image</span><input type="file" accept={IMAGE_TYPES.join(',')} onChange={e => pick(e.target.files?.[0])} /></label>}
            </div>
            <div className="submit-bar"><div className="draft-bar"><span className="draft-hint">False reports may lead to action on your own account.</span></div><div className="apply-submit"><Button disabled={busy} size="lg"><Send />{busy ? 'Sending…' : 'Send report'}</Button></div></div>
          </form>}
      </section>
      <MyReports enabled={!!me.data} />
    </div>
  </ApplyShell>;
}

// The signed-in person's own reports, each with its chat. A Discord reminder links here with ?report=<id>.
function MyReports({ enabled }: { enabled: boolean }) {
  const load = useServerFn(myReports);
  const list = useQuery({ queryKey: ['my-reports'], enabled, queryFn: () => load() });
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('report');
    if (id) { setOpen(id); document.getElementById('my-reports')?.scrollIntoView(); }
  }, [list.data?.length]);
  if (!enabled || !list.data?.length) return null;
  return <section className="focus-panel my-reports" id="my-reports">
    <div className="section-header"><div><div className="eyebrow">YOUR REPORTS</div><h2>Follow up with supervision.</h2><p>Open a report to read replies and answer.</p></div></div>
    <div className="my-report-list">{list.data.map(r => <article key={r.id} className="apply-card my-report">
      <button type="button" className="my-report-head" aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}><span className="my-report-title"><strong>{r.reported_name}</strong><small>Sent {new Date(r.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</small></span><span className={`sub-status ${r.status}`}>{r.status}</span><ChevronDown /></button>
      {open === r.id && r.status !== 'open' && <div className="decision-note in-card"><strong>{r.status === 'resolved' ? 'Resolved by supervision' : 'Closed by supervision'}</strong>{r.decision_reason ? <p>{r.decision_reason}</p> : <p className="muted">No reason was given.</p>}</div>}
      {open === r.id && <ReportChat reportId={r.id} as="reporter" />}
    </article>)}</div>
  </section>;
}