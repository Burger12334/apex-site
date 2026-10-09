// Activity log: one Discord message per notable action on the site, posted to the log webhook
// set in the editors' Discord settings. Logging never blocks or fails the action being logged.

const WEBHOOK = /^https:\/\/(ptb\.|canary\.)?discord(app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/;
export const LOG_COLORS = { info: 0x64748b, good: 0x22c55e, bad: 0xef4444, warn: 0xf59e0b, edit: 0x6366f1 };

async function logWebhook() {
  const { localMode, readLocalDiscord } = await import('./local-store.server');
  if (localMode()) return (await readLocalDiscord()).log_webhook_url;
  // log_webhook_url arrives with migration 0008; every column is selected so a missing one reads as unset.
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data } = await supabaseAdmin.from('discord_settings').select('*').eq('id', 'main').maybeSingle();
  return (data as { log_webhook_url?: string } | null)?.log_webhook_url ?? '';
}

// The signed-in Discord account doing the action, when there is one.
export async function actorName(fallback = 'Site editor') {
  try {
    const { readSession } = await import('./discord.server');
    const me = await readSession();
    return me ? `<@${me.id}> (${me.username})` : fallback;
  } catch { return fallback; }
}

export async function logEvent(event: { title: string; lines?: (string | false | null | undefined)[]; color?: number; by?: string }) {
  try {
    const url = await logWebhook();
    if (!url || !WEBHOOK.test(url)) return false;
    const description = [...(event.lines ?? []).filter(Boolean), event.by ? `**By** ${event.by}` : ''].filter(Boolean).join('\n').slice(0, 3900);
    const response = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      // Nobody is pinged by the log.
      body: JSON.stringify({ embeds: [{ color: event.color ?? LOG_COLORS.info, title: event.title.slice(0, 250), description, timestamp: new Date().toISOString() }], allowed_mentions: { parse: [] } }),
    });
    if (!response.ok) { console.error(`Log webhook [${response.status}]: ${await response.text()}`); return false; }
    return true;
  } catch (e) { console.error('Log webhook failed', e); return false; }
}

// Whether pages opened and social links clicked by visitors are logged too (off unless switched on).
export async function visitorLogging() {
  try {
    const { localMode, readLocalDiscord } = await import('./local-store.server');
    if (localMode()) return (await readLocalDiscord()).log_visitors;
    // log_visitors arrives with migration 0012.
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data } = await supabaseAdmin.from('discord_settings').select('*').eq('id', 'main').maybeSingle();
    return Boolean((data as { log_visitors?: boolean } | null)?.log_visitors);
  } catch { return false; }
}