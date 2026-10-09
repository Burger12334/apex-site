import { createServerFn } from '@tanstack/react-start';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

export const getApex = createServerFn({ method: 'GET' }).handler(async () => {
  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_PUBLISHABLE_KEY'];
  if (!url || !key) throw new Error('Site connection unavailable');
  const client = createClient<Database>(url, key, { auth: { persistSession: false }, global: { fetch: (input, init) => { const headers = new Headers(init?.headers); headers.delete('Authorization'); headers.set('apikey', key); return fetch(input, { ...init, headers }); } } });
  const [settings, apps] = await Promise.all([client.from('site_settings').select('*').eq('id', 'main').single(), client.from('apps').select('*').eq('published', true).order('sort_order')]);
  if (settings.error) throw new Error(settings.error.message);
  if (apps.error) throw new Error(apps.error.message);
  return { settings: settings.data, apps: apps.data };
});
export type ApexData = Awaited<ReturnType<typeof getApex>>;
