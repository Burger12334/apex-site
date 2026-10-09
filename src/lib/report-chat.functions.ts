import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

export type ChatSide = 'reporter' | 'supervision';
// dm_status (supervision messages only): 'sent', 'unavailable' (no bot connected) or 'failed: <reason>'.
export type ReportMessage = { id: string; report_id: string; author_role: ChatSide; author_discord_id: string; author_username: string; body: string; dm_status: string; created_at: string };
export type MyReport = { id: string; reported_name: string; status: string; created_at: string; decision_reason: string };

const side = z.enum(['reporter', 'supervision']);

export const myReports = createServerFn({ method: 'GET' }).handler(async (): Promise<MyReport[]> => {
  const { readSession } = await import('./discord.server');
  const me = await readSession();
  if (!me) return [];
  const { reportsBy } = await import('./report-chat.server');
  return (await reportsBy(me.id)).map(({ id, reported_name, status, created_at, decision_reason }) => ({ id, reported_name, status, created_at, decision_reason }));
});

export const reportMessages = createServerFn({ method: 'GET' }).inputValidator((d) => z.object({ id: z.string().uuid(), as: side }).parse(d)).handler(async ({ data }): Promise<ReportMessage[]> => {
  const { chatAccess, listReportMessages } = await import('./report-chat.server');
  await chatAccess(data.id, data.as);
  const messages = await listReportMessages(data.id);
  // Whether a reminder DM went out is for supervision to see, not the reporter.
  return data.as === 'supervision' ? messages : messages.map(m => ({ ...m, dm_status: '' }));
});

export const sendReportMessage = createServerFn({ method: 'POST' }).inputValidator((d) => z.object({ id: z.string().uuid(), as: side, body: z.string().trim().min(1).max(2000) }).parse(d)).handler(async ({ data }): Promise<ReportMessage> => {
  const { chatAccess, addReportMessage, dmReporter } = await import('./report-chat.server');
  const { me, report } = await chatAccess(data.id, data.as);
  const { currentOrigin } = await import('./discord.server');
  const row: ReportMessage = { id: crypto.randomUUID(), report_id: report.id, author_role: data.as, author_discord_id: me.id, author_username: me.username, body: data.body, dm_status: '', created_at: new Date().toISOString() };
  if (data.as === 'supervision') row.dm_status = await dmReporter(report, currentOrigin());
  await addReportMessage(row);
  const { logEvent, LOG_COLORS } = await import('./audit-log.server');
  await logEvent({ title: data.as === 'supervision' ? 'Supervision replied on a report' : 'Reporter replied on a report', color: LOG_COLORS.info, lines: [`**Report about** ${report.reported_name}`, `**Message** ${data.body.length > 300 ? `${data.body.slice(0, 300)}…` : data.body}`, row.dm_status && `**DM reminder** ${row.dm_status}`, `**Report** ${report.id}`], by: `<@${me.id}> (${me.username})` });
  return row;
});
