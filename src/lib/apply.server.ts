// Lookups shared by the application server functions. Each reads the local test store when there is
// no service key, and the database otherwise.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MyApplication } from './apply.functions';

async function db() {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  return supabaseAdmin as unknown as SupabaseClient;
}

// How many days someone must wait after a denial before applying for the same thing again (0 = no wait).
export async function cooldownDays(): Promise<number> {
  const { localMode, readLocalDiscord } = await import('./local-store.server');
  if (localMode()) return (await readLocalDiscord()).reapply_cooldown_days;
  // reapply_cooldown_days arrives with migration 0011; until then there is no wait.
  const { data } = await (await db()).from('discord_settings').select('*').eq('id', 'main').maybeSingle();
  return Number((data as { reapply_cooldown_days?: number } | null)?.reapply_cooldown_days ?? 0);
}

// When this person's most recent denied application for this form was decided, or null if there is none.
export async function lastDenial(formId: string, discordId: string): Promise<string | null> {
  const { localMode, readLocalApplications } = await import('./local-store.server');
  type Row = { created_at: string; decided_at?: string | null };
  let rows: Row[];
  if (localMode()) rows = (await readLocalApplications()).filter(r => r.form_id === formId && r.discord_id === discordId && r.status === 'denied');
  else {
    const { data } = await (await db()).from('application_submissions').select('*').eq('form_id', formId).eq('discord_id', discordId).eq('status', 'denied');
    rows = (data ?? []) as Row[];
  }
  const times = rows.map(r => r.decided_at ?? r.created_at).sort();
  return times.at(-1) ?? null;
}

export async function applicationsBy(discordId: string): Promise<MyApplication[]> {
  const { localMode, readLocalApplications } = await import('./local-store.server');
  if (localMode()) return (await readLocalApplications()).filter(r => r.discord_id === discordId).map(r => ({ id: r.id, form_title: r.form_title, status: r.status, created_at: r.created_at, decision_reason: r.decision_reason ?? '' }));
  const client = await db();
  const [{ data: rows, error }, { data: forms }] = await Promise.all([
    client.from('application_submissions').select('*').eq('discord_id', discordId).order('created_at', { ascending: false }),
    client.from('application_forms').select('id,title'),
  ]);
  if (error) throw new Error(error.message);
  const titles = new Map((forms ?? []).map(f => [f.id as string, f.title as string]));
  return (rows ?? []).map(r => ({ id: r.id as string, form_title: titles.get(r.form_id as string) ?? 'Application', status: r.status as string, created_at: r.created_at as string, decision_reason: (r.decision_reason as string | undefined) ?? '' }));
}
