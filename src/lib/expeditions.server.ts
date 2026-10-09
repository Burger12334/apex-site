// Storage for expeditions, their sign-ups and the hall of fame.
// Local test mode: JSON files in .local-data/. Live: tables from migration 0011, read with the service role.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Climber, Expedition } from './expeditions.functions';

export type Signup = { expedition_id: string; discord_id: string; discord_username: string; created_at: string };

async function db() {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  return supabaseAdmin as unknown as SupabaseClient;
}
async function local() { return import('./local-store.server'); }

// Until migration 0011 has run the live tables do not exist; the pages then simply show nothing yet.
async function rows<T>(table: string, order: string): Promise<T[]> {
  const { data, error } = await (await db()).from(table).select('*').order(order);
  if (error) { console.error(`${table}: ${error.message}`); return []; }
  return (data ?? []) as T[];
}

export async function listExpeditions(): Promise<Expedition[]> {
  const store = await local();
  const all = store.localMode() ? await store.readLocalList<Expedition>('expeditions') : await rows<Expedition>('expeditions', 'starts_at');
  return all.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}
export async function listSignups(): Promise<Signup[]> {
  const store = await local();
  return store.localMode() ? store.readLocalList<Signup>('expedition-signups') : rows<Signup>('expedition_signups', 'created_at');
}
export async function setSignup(expeditionId: string, me: { id: string; username: string }, join: boolean) {
  const store = await local();
  if (store.localMode()) {
    const others = (await store.readLocalList<Signup>('expedition-signups')).filter(s => !(s.expedition_id === expeditionId && s.discord_id === me.id));
    await store.writeLocalList('expedition-signups', join ? [...others, { expedition_id: expeditionId, discord_id: me.id, discord_username: me.username, created_at: new Date().toISOString() }] : others);
    return;
  }
  const client = await db();
  const { error } = join
    ? await client.from('expedition_signups').upsert({ expedition_id: expeditionId, discord_id: me.id, discord_username: me.username }, { onConflict: 'expedition_id,discord_id' })
    : await client.from('expedition_signups').delete().eq('expedition_id', expeditionId).eq('discord_id', me.id);
  if (error) throw new Error(error.message);
}

export async function listClimbers(): Promise<Climber[]> {
  const store = await local();
  const all = store.localMode() ? await store.readLocalList<Climber>('hall-of-fame') : await rows<Climber>('hall_of_fame', 'summits');
  return all.sort((a, b) => b.summits - a.summits || a.username.localeCompare(b.username));
}

// The Discord post announcing a new expedition.
export function expeditionAnnouncement(expedition: Expedition, origin: string) {
  const at = Math.floor(new Date(expedition.starts_at).getTime() / 1000);
  return { embeds: [{ color: 0xf59e0b, title: `🏔️ New expedition: ${expedition.title}`.slice(0, 250), description: [
    `**When** <t:${at}:F> (<t:${at}:R>)`,
    expedition.leader && `**Leader** ${expedition.leader}`,
    `**Spots** ${expedition.max_spots > 0 ? expedition.max_spots : 'Open to everyone'}`,
    expedition.description && `\n${expedition.description.slice(0, 1500)}`,
    `\n**[Sign up on the site](${origin}/expeditions)**`,
  ].filter(Boolean).join('\n') }], allowed_mentions: { parse: [] } };
}
// Local test mode: posts to the expeditions webhook from the Discord settings. False when none is set.
export async function announceLocally(expedition: Expedition, origin: string) {
  const url = (await (await local()).readLocalDiscord()).events_webhook_url;
  if (!url) return false;
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(expeditionAnnouncement(expedition, origin)) });
  if (!response.ok) throw new Error(`Discord [${response.status}]: ${await response.text()}`);
  return true;
}
