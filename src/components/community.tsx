import { useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Plus, Trash2, Save, Settings2, Users, LogOut, ArrowUp, ArrowDown, Server, ShieldAlert, Flag, ScrollText, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { logStaff } from '@/lib/staff-log';
import { getTeam, lookupDiscord, getLocalDiscordConfig, saveLocalDiscordConfig, testLocalDiscord, testLocalLog, testLocalApplicationAlert, addLocalTeamMember, removeLocalTeamMember, updateLocalTeamMember, reorderLocalTeam, type DiscordRole, type TeamMember } from '@/lib/community.functions';
import { useApplyAccess, DiscordIcon } from '@/components/apply-shell';
import { getForms } from '@/lib/apply.functions';

export const teamQuery = queryOptions({ queryKey: ['team'], queryFn: () => getTeam() });
export function DiscordAvatar({ user, large = false }: { user: { avatar_url?: string; username?: string } | null | undefined; large?: boolean }) {
  return <span className={`identity-avatar ${large ? 'lg' : ''}`}>{user?.avatar_url ? <img src={user.avatar_url} alt={`${user.username ?? 'Discord'} profile`} /> : <DiscordIcon />}</span>;
}
// A Discord role as Discord shows it: its icon (or emoji, or a dot in the role colour) and its name.
export function RoleBadge({ role }: { role: DiscordRole | null | undefined }) {
  if (!role) return null;
  return <span className="role-badge" style={role.color ? { '--role': role.color } as CSSProperties : undefined}>{role.icon_url ? <img src={role.icon_url} alt="" /> : role.emoji ? <span className="role-emoji">{role.emoji}</span> : <span className="role-dot" />}{role.name}</span>;
}
export function DiscordAccount() {
  const { me, linkDiscord, unlink } = useApplyAccess();
  return me.data ? <div className="account-top"><DiscordAvatar user={me.data} /><div><strong>@{me.data.username}</strong>{me.data.role ? <RoleBadge role={me.data.role} /> : <small>Discord linked</small>}</div><Button variant="ghost" size="icon" title="Unlink Discord" aria-label="Unlink Discord" onClick={unlink}><LogOut /></Button></div> : <Button variant="outline" className="account-connect" onClick={linkDiscord}><DiscordIcon />Link Discord</Button>;
}
export function MeetTeam() {
  const team = useQuery(teamQuery); const { isAdmin } = useApplyAccess(); const qc = useQueryClient(); const lookup = useServerFn(lookupDiscord);
  // In local test mode the team is kept on this computer.
  const addLocal = useServerFn(addLocalTeamMember); const removeLocal = useServerFn(removeLocalTeamMember);
  const local = useQuery({ queryKey: ['local-discord'], queryFn: () => getLocalDiscordConfig() }); const isLocal = !!local.data;
  const renameLocal = useServerFn(updateLocalTeamMember); const reorderLocal = useServerFn(reorderLocalTeam);
  async function change(action: () => Promise<void>, ok: string) { setBusy(true); setMessage(''); try { await action(); setMessage(ok); await qc.invalidateQueries({ queryKey: ['team'] }); } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not save.'); } finally { setBusy(false); } }
  const rename = (m: TeamMember, title: string) => change(async () => { if (isLocal) await renameLocal({ data: { id: m.id, title } }); else { const { error } = await supabase.from('team_members').update({ title }).eq('id', m.id); if (error) throw error; logStaff('Team member edited', [`${m.username}: ${title}`]); } }, 'Title saved.');
  // Moving swaps a member with their neighbour, then saves everyone's position in the new order.
  const move = (i: number, by: number) => change(async () => {
    const order = [...(team.data ?? [])]; const a = order[i]; const b = order[i + by]; if (!a || !b) return;
    order[i] = b; order[i + by] = a;
    if (isLocal) await reorderLocal({ data: order.map(m => m.id) });
    else for (const [position, m] of order.entries()) if (m.sort_order !== position) { const { error } = await supabase.from('team_members').update({ sort_order: position }).eq('id', m.id); if (error) throw error; }
    if (!isLocal) logStaff('Team order changed');
  }, 'Position updated.');
  const [open, setOpen] = useState(false); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = e.currentTarget; const f = new FormData(form); setBusy(true); setMessage('');
    try { if (isLocal) await addLocal({ data: { discord_id: String(f.get('discord_id')).trim(), title: String(f.get('title')).trim() } }); else { const identity = await lookup({ data: String(f.get('discord_id')).trim() }); const { error } = await supabase.from('team_members').insert({ ...identity, title: String(f.get('title')).trim(), sort_order: team.data?.length ?? 0 }); if (error) throw error; logStaff('Team member added', [identity.username]); } await qc.invalidateQueries({ queryKey: ['team'] }); form.reset(); setMessage('Team member added.'); } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not add member'); } finally { setBusy(false); }
  }
  return <section className="team-section site-width" id="team"><div className="section-header"><div><div className="eyebrow">THE PEOPLE BEHIND APEX</div><h2>Meet the team</h2><p>The crew keeping basecamp moving.</p></div>{isAdmin && <Button variant="outline" onClick={() => setOpen(true)}><Plus />Manage team</Button>}</div>
    <div className="team-grid">{team.data?.map(member => <article className="team-member" key={member.id}><DiscordAvatar user={member} large /><div className="team-member-body"><h3>{member.username}</h3>{member.role ? <RoleBadge role={member.role} /> : <p>{member.title}</p>}</div><Button asChild variant="outline" size="sm" className="team-discord"><a href={`https://discord.com/users/${member.discord_id}`} target="_blank" rel="noreferrer" aria-label={`Open ${member.username} on Discord`}><DiscordIcon />Discord</a></Button></article>)}</div>{!team.data?.length && <p className="empty-team">The Apex crew is getting ready.</p>}
    {isAdmin && <Dialog open={open} onOpenChange={setOpen}><DialogContent className="editor-dialog"><DialogTitle><Users />Manage the team</DialogTitle><DialogDescription>Apex team members</DialogDescription><form className="editor-form" onSubmit={add}><label>Discord user ID<input name="discord_id" pattern="[0-9]{17,20}" required placeholder="Discord user ID" /></label><label>Team title<input name="title" required maxLength={100} placeholder="Community lead" /></label><Button disabled={busy}><Plus />{busy ? 'Adding…' : 'Add team member'}</Button></form><h3>Team members</h3><div className="team-edit-list">{team.data?.map((m, i) => <form key={m.id + m.title} className="team-edit-row" onSubmit={e => { e.preventDefault(); void rename(m, String(new FormData(e.currentTarget).get('title')).trim()); }}><span className="team-position">{i + 1}</span><DiscordAvatar user={m} /><div className="team-edit-main"><strong>{m.username}</strong><input name="title" defaultValue={m.title} required maxLength={100} aria-label={`Title for ${m.username}`} /></div><div className="team-edit-actions"><Button type="button" variant="ghost" size="icon" disabled={busy || i === 0} aria-label={`Move ${m.username} up`} title="Move up" onClick={() => void move(i, -1)}><ArrowUp /></Button><Button type="button" variant="ghost" size="icon" disabled={busy || i === (team.data?.length ?? 0) - 1} aria-label={`Move ${m.username} down`} title="Move down" onClick={() => void move(i, 1)}><ArrowDown /></Button><Button variant="outline" size="sm" disabled={busy}><Save />Save</Button><Button type="button" variant="ghost" size="icon" title="Remove" aria-label={`Remove ${m.username}`} onClick={async () => { try { if (isLocal) await removeLocal({ data: m.id }); else { const { error } = await supabase.from('team_members').delete().eq('id', m.id); if (error) throw error; logStaff('Team member removed', [m.username]); } setMessage('Team member removed.'); await qc.invalidateQueries({ queryKey: ['team'] }); } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not remove member'); } }}><Trash2 /></Button></div></form>)}</div>{team.data?.length === 0 && <p className="field-hint">Nobody is on the team yet.</p>}{message && <p role="status" className="editor-message">{message}</p>}</DialogContent></Dialog>}
  </section>;
}
export function DiscordSettings() {
  const { isAdmin, user } = useApplyAccess(); const qc = useQueryClient(); const [open, setOpen] = useState(false); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const config = useQuery({ queryKey: ['discord-settings', user?.id], enabled: isAdmin && open, queryFn: async () => { const { data, error } = await supabase.from('discord_settings').select('*').eq('id', 'main').maybeSingle(); if (error) throw error; return data; } });
  const supervisors = useQuery({ queryKey: ['supervision-members', user?.id], enabled: isAdmin && open, queryFn: async () => { const { data, error } = await supabase.from('supervision_members').select('*'); if (error) throw error; return data; } });
  const local = useQuery({ queryKey: ['local-discord'], queryFn: () => getLocalDiscordConfig() });
  if (!isAdmin) return null;
  if (local.data) return <LocalDiscordSettings config={local.data} />;
  // The log webhook column arrives with migration 0008; the field stays hidden until the database has it.
  const saved = config.data as (Record<string, unknown> & { log_webhook_url?: string; application_channel_id?: string }) | null | undefined; const hasLog = !!saved && 'log_webhook_url' in saved; const hasAppChannel = !!saved && 'application_channel_id' in saved;
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget); const ids = String(f.get('roles')).split(/[\s,]+/).filter(Boolean);
    if (ids.some(id => !/^\d{17,20}$/.test(id))) { setMessage('Enter valid role IDs separated by commas.'); return; }
    const log = String(f.get('log') ?? '').trim();
    if (log && !/^https:\/\/(ptb\.|canary\.)?discord(app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(log)) { setMessage('Enter a Discord webhook URL for the log.'); return; }
    setBusy(true); const { error } = await supabase.from('discord_settings').upsert({ id: 'main', guild_id: String(f.get('guild')), channel_id: String(f.get('channel')), ping_role_ids: ids, ...(hasLog ? { log_webhook_url: log } : {}), ...(hasAppChannel ? { application_channel_id: String(f.get('app_channel') ?? '').trim() } : {}) } as never); setBusy(false); setMessage(error?.message ?? 'Discord settings saved.'); if (!error) logStaff('Discord settings updated'); if (!error) await Promise.all([qc.invalidateQueries({ queryKey: ['discord-settings'] }), qc.invalidateQueries({ queryKey: ['discord-me'] })]);
  }
  return <div className="editor-bottom site-width"><span className="editor-bottom-label">Editors only</span><Button variant="outline" onClick={() => setOpen(true)}><Settings2 />Discord & supervision settings</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="editor-dialog"><DialogTitle>Discord & supervision</DialogTitle><DialogDescription>Notifications and report reviewers</DialogDescription>{config.isLoading ? <p>Loading settings…</p> : <form key={config.data?.guild_id ?? 'new'} className="editor-form" onSubmit={save}><label>Discord server ID<input name="guild" pattern="[0-9]{17,20}" required defaultValue={config.data?.guild_id} /></label><label>Report notification channel ID<input name="channel" pattern="[0-9]{17,20}" required defaultValue={config.data?.channel_id} /></label><label>Role IDs to ping<input name="roles" defaultValue={config.data?.ping_role_ids.join(', ')} placeholder="Role IDs, separated by commas" /></label>{hasAppChannel && <label>Applications channel ID<input name="app_channel" pattern="[0-9]{17,20}" defaultValue={saved?.application_channel_id ?? ''} placeholder="Leave empty to use the reports channel" /></label>}{hasLog && <label>Activity log webhook URL<input name="log" type="url" defaultValue={saved?.log_webhook_url ?? ''} placeholder="https://discord.com/api/webhooks/…" /></label>}<Button disabled={busy}><Save />Save Discord settings</Button></form>}<h3>Supervision access</h3><form className="editor-form" onSubmit={async e => { e.preventDefault(); const form = e.currentTarget; const f = new FormData(form); const { error } = await supabase.from('supervision_members').insert({ discord_id: String(f.get('id')).trim(), username: String(f.get('name')).trim() }); setMessage(error?.message ?? 'Supervision member added.'); if (!error) logStaff('Supervision member added', [String(f.get('name')).trim()]); if (!error) { form.reset(); await qc.invalidateQueries({ queryKey: ['supervision-members'] }); } }}><label>Discord user ID<input name="id" pattern="[0-9]{17,20}" required /></label><label>Name<input name="name" required maxLength={100} /></label><Button variant="outline"><Plus />Add to supervision</Button></form><div className="editor-list">{supervisors.data?.map(s => <div key={s.id}><span>{s.username}<small>{s.discord_id}</small></span><Button variant="ghost" size="icon" aria-label={`Remove supervision access for ${s.username}`} onClick={async () => { const { error } = await supabase.from('supervision_members').delete().eq('id', s.id); setMessage(error?.message ?? 'Access removed.'); if (!error) logStaff('Supervision member removed', [s.username]); await qc.invalidateQueries({ queryKey: ['supervision-members'] }); }}><Trash2 /></Button></div>)}</div>{message && <p role="status" className="editor-message">{message}</p>}</DialogContent></Dialog></div>;
}

// One titled block in the Discord settings panel, with a badge saying whether it is set up.
function SettingsCard({ icon, tone, title, text, ready, children }: { icon: ReactNode; tone: string; title: string; text: string; ready: boolean; children: ReactNode }) {
  return <section className={`settings-card ${tone}`}>
    <header><span className="settings-icon">{icon}</span><div><h3>{title}</h3><p>{text}</p></div><span className={`settings-status ${ready ? 'on' : ''}`}>{ready ? 'Connected' : 'Not set'}</span></header>
    <div className="settings-fields">{children}</div>
  </section>;
}

type LocalDiscordConfig = { webhook_url: string; channel_id: string; ping_role_ids: string[]; app_role_ids: Record<string, string[]>; log_webhook_url: string; app_webhook_url: string; guild_id: string; app_webhooks: Record<string, string>; app_accept_roles: Record<string, string>; reapply_cooldown_days: number; events_webhook_url: string; log_visitors: boolean };
const WEBHOOK_HINT = 'https://discord.com/api/webhooks/…';
const roleList = (value: FormDataEntryValue | null) => String(value ?? '').split(/[\s,]+/).filter(Boolean);

// Local test mode: Discord settings are kept on this computer and alerts are posted through channel webhooks.
// Reports, each application and the activity log can all post to different channels.
function LocalDiscordSettings({ config }: { config: LocalDiscordConfig }) {
  const forms = useQuery({ queryKey: ['forms'], queryFn: () => getForms() });
  const qc = useQueryClient(); const saveConfig = useServerFn(saveLocalDiscordConfig);
  const sendTest = useServerFn(testLocalDiscord); const sendTestLog = useServerFn(testLocalLog); const sendTestApp = useServerFn(testLocalApplicationAlert);
  const [open, setOpen] = useState(false); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<unknown>, ok: string) { setBusy(true); setMessage(''); try { await action(); setMessage(ok); } catch (e) { setMessage(e instanceof Error ? e.message : 'Something went wrong.'); } finally { setBusy(false); } }
  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    const ids = roleList(f.get('roles'));
    const app_role_ids: Record<string, string[]> = {}; const app_webhooks: Record<string, string> = {}; const app_accept_roles: Record<string, string> = {};
    for (const form of forms.data ?? []) { app_role_ids[form.id] = roleList(f.get(`app_${form.id}`)); app_webhooks[form.id] = String(f.get(`appw_${form.id}`) ?? '').trim(); app_accept_roles[form.id] = String(f.get(`appr_${form.id}`) ?? '').trim(); }
    if (Object.values(app_accept_roles).some(id => id && !/^\d{17,20}$/.test(id))) { setMessage('Enter one valid role ID for each role to give on accept.'); return; }
    if ([...ids, ...Object.values(app_role_ids).flat()].some(id => !/^\d{17,20}$/.test(id))) { setMessage('Enter valid role IDs separated by commas.'); return; }
    void run(async () => {
      await saveConfig({ data: { webhook_url: String(f.get('webhook') ?? '').trim(), channel_id: config.channel_id, ping_role_ids: ids, app_role_ids: { ...config.app_role_ids, ...app_role_ids }, app_webhooks: { ...config.app_webhooks, ...app_webhooks }, app_accept_roles: { ...config.app_accept_roles, ...app_accept_roles }, reapply_cooldown_days: Math.max(0, Math.min(365, Math.round(Number(f.get('cooldown') || 0)))), events_webhook_url: String(f.get('events') ?? '').trim(), log_visitors: f.get('log_visitors') === 'on', log_webhook_url: String(f.get('log') ?? '').trim(), app_webhook_url: String(f.get('app_webhook') ?? '').trim(), guild_id: String(f.get('guild') ?? '').trim() } });
      await qc.invalidateQueries({ queryKey: ['local-discord'] });
    }, 'Discord settings saved.');
  }
  const sharedApps = config.app_webhook_url || config.webhook_url;
  return <div className="editor-bottom site-width"><span className="editor-bottom-label">Editors only</span><Button variant="outline" onClick={() => setOpen(true)}><Settings2 />Discord settings</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="settings-panel">
      <header className="settings-head"><span className="settings-badge"><DiscordIcon /></span><div><DialogTitle>Discord settings</DialogTitle><DialogDescription>Where reports, applications and the activity log are posted, and who gets pinged.</DialogDescription></div></header>
      <form key={JSON.stringify(config) + (forms.data?.length ?? 0)} className="settings-form" onSubmit={save}>
        <div className="settings-scroll">
          <SettingsCard icon={<Server />} tone="tone-blue" title="Server" text="The server whose roles show next to people's names. The Apex bot must be in it." ready={!!config.guild_id}>
            <label>Discord server ID<input name="guild" pattern="[0-9]{17,20}" defaultValue={config.guild_id} placeholder="e.g. 123456789012345678" /></label>
          </SettingsCard>
          <SettingsCard icon={<ShieldAlert />} tone="tone-report" title="Reports" text="Every new report is posted to this channel." ready={!!config.webhook_url}>
            <label>Webhook URL<input name="webhook" type="url" defaultValue={config.webhook_url} placeholder={WEBHOOK_HINT} /><small className="field-hint">In Discord: channel settings → Integrations → Webhooks → New Webhook → Copy Webhook URL.</small></label>
            <label>Roles to ping<input name="roles" defaultValue={config.ping_role_ids.join(', ')} placeholder="Role IDs, separated by commas" /></label>
            <Button type="button" variant="outline" size="sm" disabled={busy || !config.webhook_url} onClick={() => void run(() => sendTest(), 'Test report alert sent. Check the channel.')}>Send a test report alert</Button>
          </SettingsCard>
          <SettingsCard icon={<Flag />} tone="tone-violet" title="Applications" text="Each application can post to its own channel and ping its own roles." ready={!!sharedApps || Object.values(config.app_webhooks).some(Boolean)}>
            <label>Shared applications webhook URL<input name="app_webhook" type="url" defaultValue={config.app_webhook_url} placeholder={WEBHOOK_HINT} /><small className="field-hint">Used by any application that has no webhook of its own. If this is empty too, applications go to the reports webhook.</small></label>
            <label>Days before someone can re-apply after a denial<input name="cooldown" type="number" min={0} max={365} defaultValue={config.reapply_cooldown_days} /><small className="field-hint">0 means they can apply again straight away.</small></label>
            <div className="settings-apps">{forms.data?.map(form => <div key={form.id} className="settings-app">
              <strong>{form.title}</strong><span className={`settings-status ${config.app_webhooks[form.id] ? 'on' : ''}`}>{config.app_webhooks[form.id] ? 'Own webhook' : sharedApps ? 'Shared webhook' : 'Not set'}</span>
              <label>Webhook URL for this application<input name={`appw_${form.id}`} type="url" defaultValue={config.app_webhooks[form.id] ?? ''} placeholder="Leave empty to use the shared one" /></label>
              <label>Roles to ping<input name={`app_${form.id}`} defaultValue={(config.app_role_ids[form.id] ?? []).join(', ')} placeholder="Role IDs, separated by commas" /></label>
              <label>Role to give when accepted<input name={`appr_${form.id}`} pattern="[0-9]{17,20}" defaultValue={config.app_accept_roles[form.id] ?? ''} placeholder="One role ID, or leave empty" /></label>
            </div>)}</div>
            {forms.data?.length === 0 && <p className="field-hint">No applications are open yet.</p>}
            <Button type="button" variant="outline" size="sm" disabled={busy || !sharedApps} onClick={() => void run(() => sendTestApp(), 'Test application alert sent to the shared webhook. Check the channel.')}>Send a test application alert</Button>
          </SettingsCard>
          <SettingsCard icon={<CalendarDays />} tone="tone-orange" title="Expeditions" text="New expeditions are announced in this channel." ready={!!config.events_webhook_url}>
            <label>Webhook URL<input name="events" type="url" defaultValue={config.events_webhook_url} placeholder={WEBHOOK_HINT} /><small className="field-hint">Leave empty for no announcement.</small></label>
          </SettingsCard>
          <SettingsCard icon={<ScrollText />} tone="tone-teal" title="Activity log" text="Everything that happens on the site is posted here. Nobody is pinged." ready={!!config.log_webhook_url}>
            <label>Webhook URL<input name="log" type="url" defaultValue={config.log_webhook_url} placeholder={WEBHOOK_HINT} /><small className="field-hint">Leave empty to turn the log off.</small></label>
            <label className="settings-check"><input type="checkbox" name="log_visitors" defaultChecked={config.log_visitors} />Also log visitor activity<small className="field-hint">Every page a visitor opens and every Instagram or Discord link they click. This can fill the channel quickly on a busy day.</small></label>
            <Button type="button" variant="outline" size="sm" disabled={busy || !config.log_webhook_url} onClick={() => void run(() => sendTestLog(), 'Test log entry sent. Check the log channel.')}>Send a test log entry</Button>
          </SettingsCard>
          <p className="field-hint settings-note">This copy runs on your computer, so these settings and its reports are stored here, not on the live site. Test buttons use the saved settings, so save first.</p>
        </div>
        <footer className="settings-foot">{message && <p role="status" className="settings-message">{message}</p>}<Button disabled={busy}><Save />{busy ? 'Saving…' : 'Save settings'}</Button></footer>
      </form>
    </DialogContent></Dialog></div>;
}