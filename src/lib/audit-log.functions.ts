import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

// Staff changes that are saved straight from the browser to the database (site text, app list, editors,
// team, supervision list and so on) are reported here so they reach the activity log too.
// Only a signed-in owner or editor can write a log entry this way.
export const logStaffAction = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ title: z.string().trim().min(1).max(120), lines: z.array(z.string().max(300)).max(8).default([]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: role } = await context.supabase.rpc('apex_role');
    if (!['owner', 'editor'].includes(role ?? '')) return;
    const { logEvent, LOG_COLORS } = await import('./audit-log.server');
    const email = typeof context.claims['email'] === 'string' ? context.claims['email'] : 'an editor';
    await logEvent({ title: data.title, color: LOG_COLORS.edit, lines: data.lines, by: `${email} (${role})` });
  });

// Visitor activity (pages opened, social links clicked). Only logged when "Log visitor activity" is switched on
// in the Discord settings, and limited per visitor so the log channel cannot be flooded.
const seen = new Map<string, number>();
export const logVisitorEvent = createServerFn({ method: 'POST' })
  .inputValidator((d) => z.object({ kind: z.enum(['page', 'instagram', 'discord', 'helper']), detail: z.string().max(120).default('') }).parse(d))
  .handler(async ({ data }) => {
    const { visitorLogging, logEvent } = await import('./audit-log.server');
    if (!await visitorLogging()) return;
    const { getRequest } = await import('@tanstack/react-start/server');
    const request = getRequest();
    const visitor = (request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'local').trim();
    // The same visitor doing the same thing is logged at most once a minute.
    const key = `${visitor}|${data.kind}|${data.detail}`; const now = Date.now();
    if (now - (seen.get(key) ?? 0) < 60000) return;
    if (seen.size > 5000) seen.clear();
    seen.set(key, now);
    const { readSession } = await import('./discord.server');
    const me = await readSession();
    const title = data.kind === 'page' ? `Page opened: ${data.detail || '/'}` : data.kind === 'instagram' ? 'Instagram link clicked' : data.kind === 'discord' ? 'Discord invite clicked' : 'Helper opened';
    await logEvent({ title, lines: [me ? `**Visitor** <@${me.id}> (${me.username})` : '**Visitor** not linked to Discord'] });
  });
