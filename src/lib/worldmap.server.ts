// Pins on the Apex World Map, kept in map-pins.json in the site's own storage.
// Positions are rounded to two decimal places (about a kilometre), so a pin marks a town or landmark, never a door.
export type MapPin = { id: string; author_id: string; author_name: string; author_avatar: string; lat: number; lng: number; place: string; note: string; created_at: string; source: 'map' | 'postcard'; postcard_id?: string };

export const PIN_LIMIT = 250;
export const roundCoord = (n: number) => Math.round(n * 100) / 100;

export async function readPins() { return (await import('./local-store.server')).readLocalList<MapPin>('map-pins'); }
export async function writePins(pins: MapPin[]) { await (await import('./local-store.server')).writeLocalList('map-pins', pins); }

export async function addPin(pin: Omit<MapPin, 'id' | 'created_at' | 'lat' | 'lng'> & { lat: number; lng: number }) {
  const pins = await readPins();
  if (pins.filter(p => p.author_id === pin.author_id).length >= PIN_LIMIT) throw new Error(`You have reached the limit of ${PIN_LIMIT} pins. Remove one to add another.`);
  const saved: MapPin = { ...pin, id: crypto.randomUUID(), lat: Math.max(-85, Math.min(85, roundCoord(pin.lat))), lng: Math.max(-180, Math.min(180, roundCoord(pin.lng))), created_at: new Date().toISOString() };
  await writePins([saved, ...pins]);
  return saved;
}
