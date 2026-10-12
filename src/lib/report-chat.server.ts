// Chat between the person who sent a report and Apex supervision.
// Live: rows in public.report_messages (migration 0006), written with the service role only.
// Own storage: report-messages.json, next to the stored reports.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ReportMessage } from './report-chat.functions';

export type ReportSummary = { id: string; reported_name: string; status: string; created_at: string; reporter_discord_id: string; decision_reason: string };
// decision_reason is added by migration 0007, so every column is selected and a missing one reads as empty.
const SUMMARY = '*';

async function readLocal<T>(name: string): Promise<T[]> {
  const { readJson } = await import('./storage.server');
  return readJson<T[]>(name, []);
}
const summarize = ({ id, reported_name, status, created_at, reporter_discord_id, decision_reason }: Omit<ReportSummary, 'decision_reason'> & { decision_reason?: string }): ReportSummary => ({ id, reported_name, status, created_at, reporter_discord_id, decision_reason: decision_reason ?? '' });

// report_messages is newer than the generated database types, so it is reached through an untyped client.
async function db() {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  return supabaseAdmin as unknown as SupabaseClient;
}
async function isLocal() { const { localMode } = await import('./local-store.server'); return localMode(); }

export async function reportSummary(id: string): Promise<ReportSummary | null> {
  if (await isLocal()) { const row = (await readLocal<ReportSummary>('reports.json')).find(r => r.id === id); return row ? summarize(row) : null; }
  const { data, error } = await (await db()).from('reports').select(SUMMARY).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? summarize(data as ReportSummary) : null;
}
export async function reportsBy(discordId: string): Promise<ReportSummary[]> {
  if (await isLocal()) return (await readLocal<ReportSummary>('reports.json')).filter(r => r.reporter_discord_id === discordId).map(summarize);
  const { data, error } = await (await db()).from('reports').select(SUMMARY).eq('reporter_discord_id', discordId).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as ReportSummary[]).map(summarize);
}

export async function listReportMessages(reportId: string): Promise<ReportMessage[]> {
  if (await isLocal()) return (await readLocal<ReportMessage>('report-messages.json')).filter(m => m.report_id === reportId);
  const { data, error } = await (await db()).from('report_messages').select('*').eq('report_id', reportId).order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []) as ReportMessage[];
}
export async function addReportMessage(row: ReportMessage) {
  if (await isLocal()) {
    const rows = await readLocal<ReportMessage>('report-messages.json');
    rows.push(row);
    await (await import('./storage.server')).writeJson('report-messages.json', rows);
    return;
  }
  const { error } = await (await db()).from('report_messages').insert(row);
  if (error) throw new Error(error.message);
}

// For the review list: when the reporter last wrote without supervision having answered since, per report.
export async function waitingReplies(): Promise<Record<string, string>> {
  let rows: Pick<ReportMessage, 'report_id' | 'author_role' | 'created_at'>[];
  if (await isLocal()) rows = await readLocal<ReportMessage>('report-messages.json');
  else {
    const { data, error } = await (await db()).from('report_messages').select('report_id,author_role,created_at').order('created_at');
    if (error) return {};
    rows = (data ?? []) as typeof rows;
  }
  const waiting: Record<string, string> = {};
  for (const m of [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (m.author_role === 'reporter') waiting[m.report_id] = m.created_at; else delete waiting[m.report_id];
  }
  return waiting;
}

// Tells supervision on Discord that the reporter wrote back, with a link straight to the report. No role pings.
export async function alertReporterReply(report: ReportSummary, username: string, body: string, origin: string) {
  const embed = { title: 'A reporter replied on their report', color: 0xf59e0b, description: [`**Reporter** <@${report.reporter_discord_id}> (${username})`, `**Report about** ${report.reported_name}`, `**Message** ${body.length > 500 ? `${body.slice(0, 500)}…` : body}`, `**[Open report](${origin}/reports/reviews?report=${report.id})**`].join('\n') };
  try {
    if (await isLocal()) { const { sendEventPost } = await import('./community.server'); return await sendEventPost('report_reply', embed); }
    const { data: config } = await (await db()).from('discord_settings').select('channel_id').eq('id', 'main').maybeSingle();
    const channel = (config as { channel_id?: string } | null)?.channel_id;
    if (!channel) return 'not_configured';
    const { discordFetch } = await import('./community.server');
    await discordFetch(`channels/${channel}/messages`, { embeds: [embed], allowed_mentions: { parse: [] } });
    return 'sent';
  } catch (e) { return `failed: ${(e instanceof Error ? e.message : 'unknown error').slice(0, 200)}`; }
}

// Who may use a report's chat: the person who sent it, or supervision. The page says which side it is
// acting as, and that claim is checked here.
export async function chatAccess(reportId: string, as: 'reporter' | 'supervision') {
  const { readSession } = await import('./discord.server');
  const linked = await readSession();
  const report = await reportSummary(reportId);
  if (as === 'supervision') {
    const { supervisor } = await import('./community.server');
    const me = await supervisor();
    if (!me) throw new Error('Supervision access required');
    if (!report) throw new Error('Report not found.');
    return { me, report };
  }
  if (!linked) throw new Error('Link your Discord first.');
  if (!report) throw new Error('Report not found.');
  if (report.reporter_discord_id !== linked.id) throw new Error('This is not your report.');
  return { me: linked, report };
}

// Direct message telling the reporter that supervision replied. It carries a link, not the reply itself.
// Needs a bot (the Lovable Discord connection, or DISCORD_BOT_TOKEN locally) that shares a server with the user.
export async function dmReporter(report: ReportSummary, origin: string) {
  const { discordFetch } = await import('./community.server');
  try {
    const dm = await discordFetch('users/@me/channels', { recipient_id: report.reporter_discord_id }) as { id: string };
    await discordFetch(`channels/${dm.id}/messages`, {
      content: `<@${report.reporter_discord_id}> Apex supervision replied to your report about **${report.reported_name}**.\nRead it and reply here: ${origin}/reports?report=${report.id}`,
      allowed_mentions: { parse: [], users: [report.reporter_discord_id] },
    });
    return 'sent';
  } catch (e) {
    const reason = e instanceof Error ? e.message : 'unknown error';
    return reason === 'Discord is not connected' ? 'unavailable' : `failed: ${reason.slice(0, 200)}`;
  }
}
