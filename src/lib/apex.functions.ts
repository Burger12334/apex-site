import { createServerFn } from '@tanstack/react-start';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '@/integrations/supabase/types';

type Settings = Database['public']['Tables']['site_settings']['Row'];
type App = Database['public']['Tables']['apps']['Row'];
type Site = { settings: Settings; apps: App[] };

// The site name, links and app list as the database has them (public read).
async function fromDatabase(): Promise<Site> {
  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_PUBLISHABLE_KEY'];
  if (!url || !key) throw new Error('Site connection unavailable');
  const client = createClient<Database>(url, key, { auth: { persistSession: false }, global: { fetch: (input, init) => { const headers = new Headers(init?.headers); headers.delete('Authorization'); headers.set('apikey', key); return fetch(input, { ...init, headers }); } } });
  const [settings, apps] = await Promise.all([client.from('site_settings').select('*').eq('id', 'main').single(), client.from('apps').select('*').eq('published', true).order('sort_order')]);
  if (settings.error) throw new Error(settings.error.message);
  if (apps.error) throw new Error(apps.error.message);
  return { settings: settings.data, apps: apps.data };
}
// When the site keeps its own data, the control room saves to site.json; until the first save the
// database copy is shown.
async function site(): Promise<Site> {
  const { localMode } = await import('./local-store.server');
  if (localMode()) { const saved = await (await import('./storage.server')).readJson<Site | null>('site.json', null); if (saved) return saved; }
  return fromDatabase();
}
const byOrder = (apps: App[]) => [...apps].sort((a, b) => a.sort_order - b.sort_order);

export const getApex = createServerFn({ method: 'GET' }).handler(async () => {
  const { settings, apps } = await site();
  return { settings, apps: byOrder(apps).filter(a => a.published) };
});
export type ApexData = Awaited<ReturnType<typeof getApex>>;

// Control room, own storage: every app including hidden ones. Null when the database is connected or for non-staff.
export const getManagedApps = createServerFn({ method: 'GET' }).handler(async () => {
  const { localMode } = await import('./local-store.server');
  if (!localMode() || !await (await import('./staff.server')).isStaff()) return null;
  return byOrder((await site()).apps);
});

async function change(edit: (current: Site) => Site) {
  const { localMode } = await import('./local-store.server');
  if (!localMode()) throw new Error('Not available while the site is connected to the database.');
  await (await import('./staff.server')).requireStaff();
  await (await import('./storage.server')).writeJson('site.json', edit(await site()));
}
const link = z.string().trim().max(500).regex(/^(https:\/\/.+)?$/, 'Links must start with https://');
const text = (max: number) => z.string().trim().max(max);

export const saveSiteSettings = createServerFn({ method: 'POST' }).inputValidator((d) => z.object({ name: text(200).min(1), eyebrow: text(200), tagline: text(200).min(1), description: text(500), discord_url: link, game_url: link, footer_text: text(200), remove_logo: z.boolean() }).parse(d)).handler(async ({ data: { remove_logo, ...values } }) => {
  await change(current => ({ ...current, settings: { ...current.settings, ...values, logo_url: remove_logo ? '' : current.settings.logo_url } }));
  const { logEvent, LOG_COLORS, actorName } = await import('./audit-log.server');
  await logEvent({ title: 'Site settings saved', color: LOG_COLORS.edit, lines: [`**Name** ${values.name}`], by: await actorName() });
});
export const saveManagedApp = createServerFn({ method: 'POST' }).inputValidator((d) => z.object({ id: z.string().uuid().optional(), name: text(200).min(1), description: text(500), category: text(60), url: link, sort_order: z.number().int(), published: z.boolean(), remove_logo: z.boolean() }).parse(d)).handler(async ({ data: { id, remove_logo, ...values } }) => {
  await change(current => {
    const existing = current.apps.find(a => a.id === id);
    const app: App = { icon: '', ...existing, ...values, id: existing?.id ?? crypto.randomUUID(), logo_url: remove_logo ? '' : existing?.logo_url ?? '' };
    return { ...current, apps: existing ? current.apps.map(a => a.id === id ? app : a) : [...current.apps, app] };
  });
  const { logEvent, LOG_COLORS, actorName } = await import('./audit-log.server');
  await logEvent({ title: id ? 'App edited' : 'App added', color: LOG_COLORS.edit, lines: [`**App** ${values.name}`], by: await actorName() });
});
export const deleteManagedApp = createServerFn({ method: 'POST' }).inputValidator((d) => z.string().uuid().parse(d)).handler(async ({ data }) => {
  let name = data;
  await change(current => { name = current.apps.find(a => a.id === data)?.name ?? data; return { ...current, apps: current.apps.filter(a => a.id !== data) }; });
  const { logEvent, LOG_COLORS, actorName } = await import('./audit-log.server');
  await logEvent({ title: 'App deleted', color: LOG_COLORS.bad, lines: [`**App** ${name}`], by: await actorName() });
});
