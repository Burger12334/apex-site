import { createServerFn } from '@tanstack/react-start';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { Database } from '@/integrations/supabase/types';

export type Question = { id: string; label: string; type: 'short' | 'long'; required: boolean };
export type ApplicationForm = { id: string; title: string; description: string; questions: Question[]; is_open: boolean; sort_order: number; ping_role_ids?: string[]; alert_channel_id?: string; accept_role_id?: string };

export const getForms = createServerFn({ method: 'GET' }).handler(async () => {
  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_PUBLISHABLE_KEY'];
  if (!url || !key) throw new Error('Site connection unavailable');
  const client = createClient<Database>(url, key, { auth: { persistSession: false }, global: { fetch: (input, init) => { const headers = new Headers(init?.headers); headers.delete('Authorization'); headers.set('apikey', key); return fetch(input, { ...init, headers }); } } });
  const { data, error } = await client.from('application_forms').select('id,title,description,questions,is_open,sort_order').eq('is_open', true).order('sort_order');
  if (error) throw new Error(error.message);
  const forms = (data ?? []) as unknown as ApplicationForm[];
  const { localMode, readLocalForms } = await import('./local-store.server');
  if (!localMode()) return forms;
  const local = (await readLocalForms()).filter(f => f.is_open).map(f => ({ id: f.id, title: f.title, description: f.description, questions: f.questions, is_open: f.is_open, sort_order: f.sort_order }));
  return [...forms, ...local].sort((a, b) => a.sort_order - b.sort_order);
});

export const getDiscordMe = createServerFn({ method: 'GET' }).handler(async () => {
  const { readSession } = await import('./discord.server');
  const me = await readSession();
  if (!me) return null;
  const { enrichIdentity } = await import('./community.server');
  return enrichIdentity(me);
});

export const submitApplication = createServerFn({ method: 'POST' })
  .inputValidator((d) => z.object({ formId: z.string().uuid(), answers: z.record(z.string(), z.string().max(4000)) }).parse(d))
  .handler(async ({ data }) => {
    const { readSession, currentOrigin } = await import('./discord.server');
    const me = await readSession();
    if (!me) throw new Error('Link your Discord before submitting.');
    const { localMode, addLocalApplication, readLocalForms } = await import('./local-store.server');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    // Local test mode has no service key, so the (public) open form is read with the publishable key.
    const reader = localMode() ? createClient<Database>(process.env['SUPABASE_URL'] ?? '', process.env['SUPABASE_PUBLISHABLE_KEY'] ?? '', { auth: { persistSession: false } }) : supabaseAdmin;
    const localForm = localMode() ? (await readLocalForms()).find(f => f.id === data.formId) : undefined;
    const form = localForm ?? (await reader.from('application_forms').select('*').eq('id', data.formId).maybeSingle()).data;
    if (!form || !form.is_open) throw new Error('This application is closed.');
    const questions = (form.questions ?? []) as unknown as Question[];
    const answers: Record<string, string> = {};
    for (const q of questions) {
      const v = (data.answers[q.id] ?? '').trim();
      if (q.required && !v) throw new Error(`Please answer: ${q.label}`);
      answers[q.label] = v;
    }
    const alert = { form_id: form.id, form_title: form.title, discord_id: me.id, discord_username: me.username, answers, created_at: new Date().toISOString() };
    // After a denial the same person has to wait the set number of days before applying for this again.
    const { cooldownDays, lastDenial } = await import('./apply.server');
    const [days, denied] = await Promise.all([cooldownDays(), lastDenial(form.id, me.id)]);
    if (days > 0 && denied) {
      const until = new Date(new Date(denied).getTime() + days * 86400000);
      if (until.getTime() > Date.now()) { const { logEvent, LOG_COLORS } = await import('./audit-log.server'); await logEvent({ title: 'Application blocked by the re-apply wait', color: LOG_COLORS.warn, lines: [`**Application** ${form.title}`, `**Applicant** <@${me.id}> (${me.username})`, `**Can apply again** ${until.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`] }); }
      if (until.getTime() > Date.now()) throw new Error(`Your last application for this was denied. You can apply again on ${until.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}.`);
    }
    if (localMode()) {
      await addLocalApplication(alert);
      const { notifyLocalApplication } = await import('./community.server');
      await notifyLocalApplication(alert, currentOrigin(), localForm?.ping_role_ids);
      const { logEvent, LOG_COLORS } = await import('./audit-log.server');
      await logEvent({ title: 'Application submitted', color: LOG_COLORS.info, lines: [`**Application** ${form.title}`, `**Applicant** <@${me.id}> (${me.username})`] });
      return { ok: true };
    }
    const { count } = await supabaseAdmin.from('application_submissions').select('id', { count: 'exact', head: true }).eq('form_id', form.id).eq('discord_id', me.id).eq('status', 'pending');
    if ((count ?? 0) > 0) throw new Error('You already have a pending application for this.');
    const { error } = await supabaseAdmin.from('application_submissions').insert({ form_id: form.id, discord_id: me.id, discord_username: me.username, answers });
    if (error) throw new Error('Could not submit right now. Please try again.');
    // ping_role_ids exists once migration 0005 has run; until then the alert is posted without a ping.
    const { notifyApplication } = await import('./community.server');
    await notifyApplication(alert, (form as { ping_role_ids?: string[] }).ping_role_ids ?? [], currentOrigin(), (form as { alert_channel_id?: string }).alert_channel_id ?? '');
    const { logEvent, LOG_COLORS } = await import('./audit-log.server');
    await logEvent({ title: 'Application submitted', color: LOG_COLORS.info, lines: [`**Application** ${form.title}`, `**Applicant** <@${me.id}> (${me.username})`] });
    return { ok: true };
  });

// Local test mode only: applications kept on this computer. getLocalForms returns null outside test mode.
export const getLocalForms = createServerFn({ method: 'GET' }).handler(async () => {
  const { localMode, readLocalForms } = await import('./local-store.server');
  if (!localMode() || !await (await import('./staff.server')).isStaff()) return null;
  return (await readLocalForms()).sort((a, b) => a.sort_order - b.sort_order);
});
const localForm = z.object({
  id: z.string().uuid(), title: z.string().trim().min(1).max(200), description: z.string().max(2000),
  questions: z.array(z.object({ id: z.string().min(1).max(40), label: z.string().trim().min(1).max(300), type: z.enum(['short', 'long']), required: z.boolean() })).max(50),
  is_open: z.boolean(), sort_order: z.number().int(), ping_role_ids: z.array(z.string().regex(/^\d{17,20}$/)).max(20),
});
export const saveLocalForm = createServerFn({ method: 'POST' }).inputValidator((d) => localForm.parse(d)).handler(async ({ data }) => {
  const { localMode, readLocalForms, writeLocalForms } = await import('./local-store.server');
  if (!localMode()) throw new Error('Not available while the site is connected to the database.');
  await (await import('./staff.server')).requireStaff();
  const forms = await readLocalForms();
  const existed = forms.some(f => f.id === data.id);
  await writeLocalForms(existed ? forms.map(f => f.id === data.id ? data : f) : [...forms, data]);
  const { logEvent, LOG_COLORS, actorName } = await import('./audit-log.server');
  await logEvent({ title: existed ? 'Application form edited' : 'Application form created', color: LOG_COLORS.edit, lines: [`**Application** ${data.title}`, `**Open** ${data.is_open ? 'yes' : 'no'}`, `**Questions** ${data.questions.length}`], by: await actorName() });
});
export const deleteLocalForm = createServerFn({ method: 'POST' }).inputValidator((d) => z.string().uuid().parse(d)).handler(async ({ data }) => {
  const { localMode, readLocalForms, writeLocalForms } = await import('./local-store.server');
  if (!localMode()) throw new Error('Not available while the site is connected to the database.');
  await (await import('./staff.server')).requireStaff();
  const forms = await readLocalForms();
  await writeLocalForms(forms.filter(f => f.id !== data));
  const { logEvent, LOG_COLORS, actorName } = await import('./audit-log.server');
  await logEvent({ title: 'Application form deleted', color: LOG_COLORS.bad, lines: [`**Application** ${forms.find(f => f.id === data)?.title ?? data}`], by: await actorName() });
});

// Local test mode only: applications submitted on this computer, for the review page. Null outside test mode.
export const getLocalApplications = createServerFn({ method: 'GET' }).handler(async () => {
  const { localMode, readLocalApplications, writeLocalApplications } = await import('./local-store.server');
  if (!localMode() || !await (await import('./staff.server')).isStaff()) return null;
  const rows = await readLocalApplications();
  const { lookupAvatar } = await import('./community.server');
  return Promise.all(rows.map(async row => ({ ...row, avatar_url: await lookupAvatar(row.discord_id) })));
});
export const updateLocalApplication = createServerFn({ method: 'POST' }).inputValidator((d) => z.object({ id: z.string().uuid(), status: z.enum(['pending', 'accepted', 'denied', 'deleted']), reason: z.string().trim().max(1000).default('') }).parse(d)).handler(async ({ data }) => {
  const { localMode, readLocalApplications, writeLocalApplications } = await import('./local-store.server');
  if (!localMode()) throw new Error('Not available while the site is connected to the database.');
  await (await import('./staff.server')).requireStaff();
  const rows = await readLocalApplications();
  const row = rows.find(r => r.id === data.id);
  if (!row) throw new Error('Application not found.');
  const { logEvent, LOG_COLORS, actorName } = await import('./audit-log.server');
  const who = [`**Application** ${row.form_title}`, `**Applicant** <@${row.discord_id}> (${row.discord_username})`];
  if (data.status === 'deleted') { await writeLocalApplications(rows.filter(r => r.id !== data.id)); await logEvent({ title: 'Application deleted', color: LOG_COLORS.bad, lines: who, by: await actorName() }); return { dm: '' }; }
  // The applicant is told the outcome by DM, and an accepted applicant gets the application's Discord role.
  let dm = ''; let role = '';
  if (data.status !== 'pending') { const { sendDm, applicationDm } = await import('./decisions.server'); dm = await sendDm(row.discord_id, applicationDm(row, data.status, data.reason)); }
  if (data.status === 'accepted') {
    const { readLocalDiscord } = await import('./local-store.server');
    const roleId = (await readLocalDiscord()).app_accept_roles[row.form_id];
    if (roleId) { const { giveRole } = await import('./decisions.server'); role = await giveRole(row.discord_id, roleId); }
  }
  await writeLocalApplications(rows.map(r => r.id === data.id ? { ...r, status: data.status, decision_reason: data.reason, dm_status: dm, role_status: role, decided_at: new Date().toISOString() } : r));
  await logEvent({ title: data.status === 'accepted' ? 'Application accepted' : data.status === 'denied' ? 'Application denied' : 'Application set back to pending', color: data.status === 'accepted' ? LOG_COLORS.good : data.status === 'denied' ? LOG_COLORS.bad : LOG_COLORS.info, lines: [...who, data.reason && `**Reason** ${data.reason}`, dm && `**DM to applicant** ${dm}`, role && `**Discord role** ${role}`], by: await actorName() });
  return { dm, role };
});

// Live site: an editor accepts or denies an application; the applicant is told by DM.
export const decideApplication = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((d) => z.object({ id: z.string().uuid(), status: z.enum(['accepted', 'denied']), reason: z.string().trim().max(1000).default('') }).parse(d)).handler(async ({ data, context }) => {
  const { data: role } = await context.supabase.rpc('apex_role');
  if (!['owner', 'editor'].includes(role ?? '')) throw new Error('Editor access required');
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data: row } = await supabaseAdmin.from('application_submissions').select('id,form_id,discord_id').eq('id', data.id).maybeSingle();
  if (!row) throw new Error('Application not found.');
  const { error } = await supabaseAdmin.from('application_submissions').update({ status: data.status }).eq('id', data.id);
  if (error) throw new Error(error.message);
  const { data: form } = await supabaseAdmin.from('application_forms').select('*').eq('id', row.form_id).maybeSingle();
  const { sendDm, applicationDm, giveRole } = await import('./decisions.server');
  const dm = await sendDm(row.discord_id, applicationDm({ discord_id: row.discord_id, form_title: form?.title ?? 'Application' }, data.status, data.reason));
  // accept_role_id arrives with migration 0011; an accepted applicant gets that Discord role.
  const roleId = (form as { accept_role_id?: string } | null)?.accept_role_id;
  const given = data.status === 'accepted' && roleId ? await giveRole(row.discord_id, roleId) : '';
  // decision_reason and dm_status arrive with migration 0007, decided_at with 0011; before that these updates are simply rejected.
  await (supabaseAdmin as unknown as SupabaseClient).from('application_submissions').update({ decision_reason: data.reason, dm_status: dm }).eq('id', data.id);
  await (supabaseAdmin as unknown as SupabaseClient).from('application_submissions').update({ decided_at: new Date().toISOString() }).eq('id', data.id);
  const { logEvent, LOG_COLORS, actorName } = await import('./audit-log.server');
  await logEvent({ title: data.status === 'accepted' ? 'Application accepted' : 'Application denied', color: data.status === 'accepted' ? LOG_COLORS.good : LOG_COLORS.bad, lines: [`**Application** ${form?.title ?? 'Application'}`, `**Applicant** <@${row.discord_id}>`, data.reason && `**Reason** ${data.reason}`, `**DM to applicant** ${dm}`, given && `**Discord role** ${given}`], by: await actorName('An editor') });
  return { dm, role: given };
});

// The signed-in person's own applications with their status and the reason given, newest first.
export type MyApplication = { id: string; form_title: string; status: string; created_at: string; decision_reason: string };
export const myApplications = createServerFn({ method: 'GET' }).handler(async (): Promise<MyApplication[]> => {
  const { readSession } = await import('./discord.server');
  const me = await readSession();
  if (!me) return [];
  const { applicationsBy } = await import('./apply.server');
  return applicationsBy(me.id);
});

// Local test mode only: private staff notes on an application, kept on this computer. Null outside test mode.
export type ApplicationNote = { id: string; submission_id: string; author: string; body: string; created_at: string };
export const getLocalApplicationNotes = createServerFn({ method: 'GET' }).inputValidator((d) => z.string().uuid().parse(d)).handler(async ({ data }) => {
  const { localMode, readLocalList } = await import('./local-store.server');
  if (!localMode() || !await (await import('./staff.server')).isStaff()) return null;
  return (await readLocalList<ApplicationNote>('application-notes')).filter(n => n.submission_id === data);
});
export const addLocalApplicationNote = createServerFn({ method: 'POST' }).inputValidator((d) => z.object({ submissionId: z.string().uuid(), body: z.string().trim().min(1).max(4000) }).parse(d)).handler(async ({ data }) => {
  const { localMode, readLocalList, writeLocalList } = await import('./local-store.server');
  if (!localMode()) throw new Error('Not available while the site is connected to the database.');
  await (await import('./staff.server')).requireStaff();
  const { readSession } = await import('./discord.server');
  const me = await readSession();
  const notes = await readLocalList<ApplicationNote>('application-notes');
  await writeLocalList('application-notes', [...notes, { id: crypto.randomUUID(), submission_id: data.submissionId, author: me ? `@${me.username}` : 'Staff', body: data.body, created_at: new Date().toISOString() }]);
  const { logEvent, LOG_COLORS, actorName } = await import('./audit-log.server');
  await logEvent({ title: 'Staff note added to an application', color: LOG_COLORS.edit, lines: [`**Note** ${data.body.length > 300 ? `${data.body.slice(0, 300)}…` : data.body}`], by: await actorName() });
});