import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { ArrowLeft, Send, Check, LogOut, CloudCheck, Eraser } from 'lucide-react';
import { HeroBackdrop } from '@/components/hero-slides';
import { Button } from '@/components/ui/button';
import { submitApplication } from '@/lib/apply.functions';
import { ApplyShell, DiscordIcon, apexQuery, formsQuery, useApplyAccess } from '@/components/apply-shell';
import { DiscordAvatar, RoleBadge } from '@/components/community';

export const Route = createFileRoute('/apply_/$formId')({
  head: () => ({ meta: [{ title: 'Climber Application — Apex' }, { name: 'description', content: 'Fill out your Apex climber application with your Discord linked.' }, { property: 'og:title', content: 'Climber Application — Apex' }, { property: 'og:description', content: 'Tell the Apex crew about your climb.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }] }),
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(apexQuery), context.queryClient.ensureQueryData(formsQuery)]),
  component: FormPage,
  errorComponent: () => <div className="site-width py-20"><h1>Application unavailable</h1></div>,
  notFoundComponent: () => <div className="site-width py-20">Application not found.</div>,
});

function FormPage() {
  const { formId } = Route.useParams();
  const { data: forms } = useSuspenseQuery(formsQuery);
  const form = forms.find(f => f.id === formId);
  const { me, linkDiscord, unlink } = useApplyAccess();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [done, setDone] = useState(false);
  // Answers are kept in this browser as the applicant types, so leaving the page or linking Discord does not lose them.
  const draftKey = `apex-draft:${formId}`;
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [restored, setRestored] = useState(false); const [savedAt, setSavedAt] = useState<Date | null>(null);
  useEffect(() => {
    try { const saved = JSON.parse(localStorage.getItem(draftKey) ?? 'null') as { answers?: Record<string, string>; at?: number } | null; if (saved?.answers) { setAnswers(saved.answers); if (saved.at) setSavedAt(new Date(saved.at)); } } catch { /* no usable draft */ }
    setRestored(true);
  }, [draftKey]);
  useEffect(() => {
    if (!restored) return;
    try {
      if (Object.values(answers).some(v => v.trim())) { const at = Date.now(); localStorage.setItem(draftKey, JSON.stringify({ answers, at })); setSavedAt(new Date(at)); }
      else { localStorage.removeItem(draftKey); setSavedAt(null); }
    } catch { /* storage unavailable: the form still works, just without saving */ }
  }, [answers, restored, draftKey]);

  if (!form) return <ApplyShell active="apply"><section className="site-width apply-page"><h1 className="apply-title">This application is closed.</h1><Link to="/apply"><Button variant="outline"><ArrowLeft />All applications</Button></Link></section></ApplyShell>;
  const progress = form.questions.length ? Math.round(form.questions.filter(q => (answers[q.id] ?? '').trim()).length / form.questions.length * 100) : 100;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError('');
    const sent = Object.fromEntries(form!.questions.map(q => [q.id, answers[q.id] ?? '']));
    setBusy(true);
    try { await submitApplication({ data: { formId: form!.id, answers: sent } }); setAnswers({}); setDone(true); }
    catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong.'); }
    finally { setBusy(false); }
  }

  const filled = (id: string) => (answers[id] ?? '').trim().length > 0;
  const answeredCount = form.questions.filter(q => filled(q.id)).length;
  const field = (q: { id: string; required: boolean }) => ({ name: q.id, required: q.required, value: answers[q.id] ?? '', onChange: (e: { target: { value: string } }) => setAnswers(a => ({ ...a, [q.id]: e.target.value })) });

  return <ApplyShell active="apply">
    <div className="focus-page">
      <div className="focus-bg" aria-hidden="true"><HeroBackdrop /></div>
      <section className="focus-panel">
        <header className="focus-head">
          <Link to="/apply" className="back-link"><ArrowLeft size={14} />All applications</Link>
          <div className="focus-title-row">
            <div><div className="eyebrow"><span className="line" />CLIMBER APPLICATION</div><h1 className="focus-title">{form.title}</h1>{form.description && <p className="focus-lede">{form.description}</p>}</div>
            {!done && <div className="route-ring" style={{ '--progress': `${progress}%` } as CSSProperties} aria-label={`${progress}% complete`}><strong>{progress}%</strong><small>{answeredCount} of {form.questions.length}</small></div>}
          </div>
          <div className="focus-identity">{me.data
            ? <><DiscordAvatar user={me.data} /><div><strong>@{me.data.username}</strong><small>Attached to your application · ID {me.data.id}</small></div><RoleBadge role={me.data.role} /><Button variant="ghost" size="sm" onClick={unlink}><LogOut />Unlink</Button></>
            : <><DiscordAvatar user={null} /><div><strong>Link your Discord</strong><small>Your ID and username are attached automatically.</small></div><Button onClick={linkDiscord}><DiscordIcon />Link Discord</Button></>}</div>
          {!done && <nav className="step-dots" aria-label="Questions">{form.questions.map((q, i) => <a key={q.id} href={`#q-${q.id}`} className={filled(q.id) ? 'answered' : ''} title={q.label} aria-label={`Question ${i + 1}: ${q.label}`}>{filled(q.id) ? <Check /> : i + 1}</a>)}</nav>}
        </header>
        {done ? <div className="done-card"><span className="done-icon"><Check /></span><h2>Application sent.</h2><p>The crew will review it soon. Good luck on the climb.</p><Button onClick={() => navigate({ to: '/apply' })}>Back to applications</Button></div> :
        <form className="apply-questions" onSubmit={submit}>
          {form.questions.map((q, i) => <label key={q.id} id={`q-${q.id}`} className={`question-block ${filled(q.id) ? 'answered' : ''}`}>
            <span className="question-head"><span className="question-num">{filled(q.id) ? <Check /> : i + 1}</span><span>{q.label}{q.required ? <em> *</em> : <small className="optional-tag">Optional</small>}</span></span>
            {q.type === 'long' ? <textarea {...field(q)} maxLength={4000} rows={5} placeholder="Write your answer…" /> : <input {...field(q)} maxLength={400} placeholder="Your answer" />}
            {q.type === 'long' && <small className="char-count">{(answers[q.id] ?? '').length} / 4000</small>}
          </label>)}
          {error && <div className="editor-message">{error}</div>}
          <div className="submit-bar">
            <div className="draft-bar">{savedAt ? <><span className="draft-saved"><CloudCheck />Saved on this device · {savedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span><Button type="button" variant="ghost" size="sm" onClick={() => { if (confirm('Clear all your answers?')) setAnswers({}); }}><Eraser />Clear</Button></> : <span className="draft-hint">Your answers are saved on this device as you type.</span>}</div>
            <div className="apply-submit">{me.data ? <Button disabled={busy} size="lg">{busy ? 'Sending…' : <>Submit application<Send /></>}</Button> : <Button type="button" size="lg" onClick={linkDiscord}><DiscordIcon />Link Discord to submit</Button>}</div>
          </div>
        </form>}
      </section>
    </div>
  </ApplyShell>;
}