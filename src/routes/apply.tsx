import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery, useSuspenseQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Mountain, ArrowUpRight, Plus, Trash2, Save, LogOut, Settings2 } from 'lucide-react';
import { HeroBackdrop } from '@/components/hero-slides';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useServerFn } from '@tanstack/react-start';
import { type ApplicationForm, type Question, getLocalForms, saveLocalForm, deleteLocalForm, myApplications } from '@/lib/apply.functions';
import { supabase } from '@/integrations/supabase/client';
import { logStaff } from '@/lib/staff-log';
import { ApplyShell, DiscordIcon, apexQuery, formsQuery, useApplyAccess } from '@/components/apply-shell';

export const Route = createFileRoute('/apply')({
  head: () => ({ meta: [{ title: 'Apply — Apex Climber Applications' }, { name: 'description', content: 'Apply to join the Apex K2 Climbing crew. Link your Discord and send your application.' }, { property: 'og:title', content: 'Apex Climber Applications' }, { property: 'og:description', content: 'Link your Discord and apply to climb with Apex.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }] }),
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(apexQuery), context.queryClient.ensureQueryData(formsQuery)]),
  component: Apply,
  errorComponent: () => <div className="site-width py-20"><h1>Applications are temporarily unavailable</h1><p>Please refresh in a moment.</p></div>,
  notFoundComponent: () => <div>Not found.</div>,
});

function Apply() {
  const { data: forms } = useSuspenseQuery(formsQuery);
  const { me, isAdmin, linkDiscord, unlink } = useApplyAccess();
  const [manage, setManage] = useState(false);
  const [notice, setNotice] = useState('');

  return <ApplyShell active="apply" notice={notice} onNotice={setNotice}>
    <section className="hero apply-hero page-banner"><HeroBackdrop /><div className="hero-inner site-width"><div className="eyebrow"><span className="line" />CLIMBER APPLICATIONS</div><h1>Apply</h1><h2>Earn your place on the rope.</h2><p>Link your Discord, pick an application, and tell us about your climb.</p>
      <div className="discord-link">{me.data ? <><span className="status-dot" /><span>Linked as <strong>@{me.data.username}</strong> <small>· ID {me.data.id}</small></span><Button variant="ghost" size="sm" onClick={unlink}><LogOut />Unlink</Button></> : <Button onClick={linkDiscord}><DiscordIcon />Link your Discord<ArrowUpRight /></Button>}</div>
    </div></section>
    <MyApplications enabled={!!me.data} />
    {manage && isAdmin ? <AdminForms onClose={() => setManage(false)} onNotice={setNotice} /> : <section className="apps-section site-width">
      <div className="section-header"><div><div className="eyebrow">OPEN APPLICATIONS</div><h2>Choose Your Route</h2><p>Each application opens on its own page.</p></div>{isAdmin ? <Button variant="outline" onClick={() => setManage(true)}><Settings2 />Edit applications</Button> : <span className="app-count">{String(forms.length).padStart(2, '0')} OPEN</span>}</div>
      <div className="app-grid">{forms.map((f, i) => <Link key={f.id} to="/apply/$formId" params={{ formId: f.id }} className="app-card route-card"><div className="app-card-top"><span className="app-icon"><Mountain /></span><span className="app-category">ROUTE {String(i + 1).padStart(2, '0')}</span></div><h3>{f.title}</h3><p>{f.description}</p><span className="app-open route-open">{f.questions.length} questions<ArrowUpRight size={14} /></span></Link>)}</div>
      {forms.length === 0 && <p className="empty-state">No applications are open right now. Check back soon.</p>}
    </section>}
  </ApplyShell>;
}

function AdminForms({ onClose, onNotice }: { onClose: () => void; onNotice: (m: string) => void }) {
  const qc = useQueryClient();
  // In local test mode applications are kept on this computer; otherwise they are edited in the database.
  const loadLocal = useServerFn(getLocalForms); const saveLocal = useServerFn(saveLocalForm); const removeLocal = useServerFn(deleteLocalForm);
  const local = useQuery({ queryKey: ['local-forms'], queryFn: () => loadLocal() });
  const isLocal = Array.isArray(local.data);
  const remote = useQuery({ queryKey: ['admin-forms'], enabled: local.isSuccess && !isLocal, queryFn: async () => { const { data, error } = await supabase.from('application_forms').select('*').order('sort_order'); if (error) throw error; return data as unknown as ApplicationForm[]; } });
  const forms = isLocal ? (local.data as ApplicationForm[]) : remote.data;
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['admin-forms'] }), qc.invalidateQueries({ queryKey: ['local-forms'] }), qc.invalidateQueries({ queryKey: ['forms'] })]);
  const run = async (fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) => { const { error } = await fn(); onNotice(error ? error.message : ok); if (!error && !isLocal) logStaff(`Application forms: ${ok}`); if (!error) await refresh(); };
  const runLocal = (fn: () => Promise<unknown>, ok: string) => run(() => fn().then(() => ({ error: null }), (e: unknown) => ({ error: { message: e instanceof Error ? e.message : 'Could not save.' } })), ok);
  const blank = { title: 'New application', description: '', questions: [], is_open: false, sort_order: forms?.length ?? 0 };
  // The application being edited opens in a side panel; a new one opens straight away.
  const [editing, setEditing] = useState<string | null>(null);
  const addForm = () => { const id = crypto.randomUUID(); return isLocal
    ? runLocal(() => saveLocal({ data: { ...blank, id, ping_role_ids: [] } }), 'Application created. Tick Open for applications to publish it.').then(() => setEditing(id))
    : run(() => supabase.from('application_forms').insert({ ...blank, id }), 'Application created. Tick Open for applications to publish it.').then(() => setEditing(id)); };
  const saveForm = (f: ApplicationForm, patch: Partial<ApplicationForm>) => isLocal
    ? runLocal(() => saveLocal({ data: { ...f, ping_role_ids: f.ping_role_ids ?? [], ...patch } }), 'Saved.')
    : run(() => supabase.from('application_forms').update(patch as never).eq('id', f.id), 'Saved.');
  const deleteForm = (f: ApplicationForm) => isLocal
    ? runLocal(() => removeLocal({ data: f.id }), 'Deleted.')
    : run(() => supabase.from('application_forms').delete().eq('id', f.id), 'Deleted.');
  const editingForm = forms?.find(f => f.id === editing);
  return <section className="apps-section site-width">
    <div className="section-header"><div><div className="eyebrow">CONTROL ROOM</div><h2>Edit applications.</h2><p>{isLocal ? 'Applications you create here are saved on this computer. Ones from the live site can only be edited there.' : 'Create forms and choose which are open.'}</p></div><div className="sub-actions"><Button variant="ghost" onClick={onClose}>Done</Button><Button onClick={addForm}><Plus />New application</Button></div></div>
    <div className="staff-grid">{forms?.map(f => <article key={f.id} className="staff-card">
      <div className="staff-card-top"><span className={`sub-status ${f.is_open ? 'accepted' : 'pending'}`}>{f.is_open ? 'Open' : 'Hidden'}</span><span className="app-count">{f.questions.length} QUESTIONS</span></div>
      <h3>{f.title}</h3><p>{f.description || 'No description yet.'}</p>
      <Button variant="outline" onClick={() => setEditing(f.id)}><Settings2 />Edit application</Button>
    </article>)}</div>
    {forms?.length === 0 && <p className="empty-state">No applications yet. Create one with New application.</p>}
    <Dialog open={!!editingForm} onOpenChange={o => { if (!o) setEditing(null); }}><DialogContent className="editor-dialog review-panel"><DialogTitle className="panel-title">Edit application</DialogTitle><DialogDescription className="sr-only">Title, questions and settings for this application.</DialogDescription>
      {editingForm && <FormEditor key={editingForm.id} form={editingForm} onSave={(patch) => void saveForm(editingForm, patch)} onDelete={() => { if (confirm('Delete this application and its submissions?')) { void deleteForm(editingForm); setEditing(null); } }} />}
    </DialogContent></Dialog>
  </section>;
}
function FormEditor({ form, onSave, onDelete }: { form: ApplicationForm; onSave: (p: Partial<ApplicationForm>) => void; onDelete: () => void }) {
  const [t, setT] = useState(form.title); const [d, setD] = useState(form.description); const [open, setOpen] = useState(form.is_open); const [order, setOrder] = useState(form.sort_order);
  const [qs, setQs] = useState<Question[]>(form.questions ?? []);
  // The column arrives with migration 0005; the field stays hidden until the database has it.
  const canPing = 'ping_role_ids' in form; const [roles, setRoles] = useState((form.ping_role_ids ?? []).join(', '));
  // Its own alert channel arrives with migration 0010.
  const canChannel = 'alert_channel_id' in form; const [channel, setChannel] = useState(form.alert_channel_id ?? '');
  const upd = (i: number, p: Partial<Question>) => setQs(qs.map((q, j) => j === i ? { ...q, ...p } : q));
  return <div className="app-edit editor-form">
    <div className="form-columns"><label>Title<input value={t} onChange={e => setT(e.target.value)} /></label><label>Order<input type="number" value={order} onChange={e => setOrder(Number(e.target.value))} /></label></div>
    <label>Description<textarea rows={2} value={d} onChange={e => setD(e.target.value)} /></label>
    {canChannel && <label>Discord channel ID for this application's alerts<input value={channel} onChange={e => setChannel(e.target.value.trim())} pattern="[0-9]{17,20}" placeholder="Leave empty to use the shared applications channel" /></label>}
    {canPing && <label>Discord role IDs to ping when someone applies<input value={roles} onChange={e => setRoles(e.target.value)} placeholder="Role IDs, separated by commas" /></label>}
    <label className="check-label"><input type="checkbox" checked={open} onChange={e => setOpen(e.target.checked)} />Open for applications</label>
    <div className="question-list">{qs.map((q, i) => <div key={q.id} className="question-row"><input aria-label="Question" placeholder="Question" value={q.label} onChange={e => upd(i, { label: e.target.value })} /><select aria-label="Answer type" value={q.type} onChange={e => upd(i, { type: e.target.value as Question['type'] })}><option value="short">Short</option><option value="long">Long</option></select><label className="check-label"><input type="checkbox" checked={q.required} onChange={e => upd(i, { required: e.target.checked })} />Required</label><Button type="button" size="icon" variant="ghost" aria-label="Remove question" onClick={() => setQs(qs.filter((_, j) => j !== i))}><Trash2 /></Button></div>)}</div>
    <div className="form-actions"><Button type="button" variant="outline" onClick={() => setQs([...qs, { id: crypto.randomUUID().slice(0, 8), label: '', type: 'short', required: true }])}><Plus />Add question</Button><div className="sub-actions"><Button type="button" variant="ghost" onClick={onDelete}><Trash2 />Delete</Button><Button type="button" onClick={() => onSave({ title: t, description: d, is_open: open, sort_order: order, questions: qs.filter(q => q.label.trim()), ...(canPing ? { ping_role_ids: roles.split(/[\s,]+/).filter(id => /^\d{17,20}$/.test(id)) } : {}), ...(canChannel ? { alert_channel_id: /^\d{17,20}$/.test(channel) ? channel : '' } : {}) })}><Save />Save</Button></div></div>
  </div>;
}

// The signed-in person's own applications and what was decided, so they are not relying on a Discord DM.
function MyApplications({ enabled }: { enabled: boolean }) {
  const load = useServerFn(myApplications);
  const list = useQuery({ queryKey: ['my-applications'], enabled, queryFn: () => load() });
  if (!enabled || !list.data?.length) return null;
  return <section className="site-width my-applications" id="my-applications">
    <div className="section-header"><div><div className="eyebrow">YOUR APPLICATIONS</div><h2>Where things stand.</h2><p>Every application you have sent, and what the crew decided.</p></div></div>
    <div className="status-grid">{list.data.map(a => <article key={a.id} className={`status-card ${a.status}`}>
      <div className="status-card-top"><span className={`sub-status ${a.status}`}>{a.status}</span><small>Sent {new Date(a.created_at).toLocaleDateString([], { dateStyle: 'medium' })}</small></div>
      <h3>{a.form_title}</h3>
      <p>{a.status === 'pending' ? 'The crew has not reviewed this yet.' : a.decision_reason || (a.status === 'accepted' ? 'Accepted. Welcome aboard.' : 'Denied. No reason was given.')}</p>
    </article>)}</div>
  </section>;
}