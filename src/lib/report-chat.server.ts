// Chat between the person who sent a report and Apex supervision.
// Live: rows in public.report_messages (migration 0006), written with the service role only.
// Local test mode: .local-data/report-messages.json, next to the locally stored reports.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ReportMessage } from './report-chat.functions';

export type ReportSummary = { id: string; reported_name: string; status: string; created_at: string; reporter_discord_id: string; decision_reason: string };
// decision_reason is added by migration 0007, so every column is selected and a missing one reads as empty.
const SUMMARY = '*';

const localDir = () => `${process.cwd()}/.local-data`;
async function readLocal<T>(name: string): Promise<T[]> {
  const { readFile } = await import('node:fs/promises');
  try { return JSON.parse(await readFile(`${localDir()}/${name}`, 'utf8')) as T[]; } catch { return []; }
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
    const { mkdir, writeFile } = await import('node:fs/promises');
    const rows = await readLocal<ReportMessage>('report-messages.json');
    rows.push(row);
    await mkdir(localDir(), { recursive: true });
    await writeFile(`${localDir()}/report-messages.json`, JSON.stringify(rows, null, 2));
    return;
  }
  const { error } = await (await db()).from('report_messages').insert(row);
  if (error) throw new Error(error.message);
}

// Who may use a report's chat: the person who sent it, or supervision. The page says which side it is
// acting as, and that claim is checked here.
export async function chatAccess(reportId: string, as: 'reporter' | 'supervision') {
  const { readSession } = await import('./discord.server');
  const me = await readSession();
  if (!me) throw new Error('Link your Discord first.');
  const report = await reportSummary(reportId);
  if (!report) throw new Error('Report not found.');
  if (as === 'supervision') {
    const { supervisor } = await import('./community.server');
    if (!await supervisor()) throw new Error('Supervision access required');
  } else if (report.reporter_discord_id !== me.id) throw new Error('This is not your report.');
  return { me, report };
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
