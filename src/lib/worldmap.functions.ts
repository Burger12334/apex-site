import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

// The Apex World Map: anyone can look; anyone who linked Discord can pin places; staff can remove any pin.
export type PinView = { id: string; author_id: string; author_name: string; author_avatar: string; lat: number; lng: number; place: string; note: string; created_at: string; source: 'map' | 'postcard'; mine: boolean };

async function who() {
  const { readSession } = await import('./discord.server'); const { accessFor } = await import('./staff.server');
  const me = await readSession();
  return { me, staff: (await accessFor(me)).staff };
}

export const getPins = createServerFn({ method: 'GET' }).handler(async () => {
  const { localMode } = await import('./local-store.server');
  const { me, staff } = await who();
  const pins = localMode() ? await (await import('./worldmap.server')).readPins() : [];
  return { pins: pins.map(({ postcard_id: _, ...p }): PinView => ({ ...p, mine: me?.id === p.author_id })), linked: !!me, staff: localMode() && staff, limit: (await import('./worldmap.server')).PIN_LIMIT };
});

const pinInput = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), place: z.string().trim().min(2, 'Name the place you are pinning').max(80), note: z.string().trim().max(200).default('') });
export const addMapPin = createServerFn({ method: 'POST' }).inputValidator((d) => pinInput.parse(d)).handler(async ({ data }) => {
  const { localMode } = await import('./local-store.server');
  if (!localMode()) throw new Error('Not available while the site is connected to the database.');
  const { me } = await who();
  if (!me) throw new Error('Link your Discord to pin a place.');
  const { avatarUrl } = await import('./community.server');
  const pin = await (await import('./worldmap.server')).addPin({ author_id: me.id, author_name: me.username, author_avatar: avatarUrl(me), lat: data.lat, lng: data.lng, place: data.place, note: data.note, source: 'map' });
  const { logEvent, LOG_COLORS } = await import('./audit-log.server');
  await logEvent({ title: 'World Map pin added', color: LOG_COLORS.good, lines: [`**By** <@${me.id}> (${me.username})`, `**Place** ${data.place}`, data.note && `**Note** ${data.note}`] });
  return { id: pin.id };
});

export const deleteMapPin = createServerFn({ method: 'POST' }).inputValidator((d) => z.string().uuid().parse(d)).handler(async ({ data }) => {
  const { localMode } = await import('./local-store.server');
  if (!localMode()) throw new Error('Not available while the site is connected to the database.');
  const { me, staff } = await who();
  const { readPins, writePins } = await import('./worldmap.server');
  const pins = await readPins(); const pin = pins.find(p => p.id === data);
  if (!pin) throw new Error('That pin is already gone.');
  if (!staff && me?.id !== pin.author_id) throw new Error('You can only remove your own pins.');
  await writePins(pins.filter(p => p.id !== data));
  const { logEvent, LOG_COLORS, actorName } = await import('./audit-log.server');
  await logEvent({ title: 'World Map pin removed', color: LOG_COLORS.bad, lines: [`**Pinned by** <@${pin.author_id}> (${pin.author_name})`, `**Place** ${pin.place}`], by: await actorName() });
});
