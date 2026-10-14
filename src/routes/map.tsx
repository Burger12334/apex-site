import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Globe2, Layers, Loader2, MapPin, MapPinned, Mountain, Search, Satellite, Stamp, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ApplyShell, DiscordIcon, apexQuery, useApplyAccess } from '@/components/apply-shell';
import { DiscordAvatar } from '@/components/community';
import { HeroBackdrop } from '@/components/hero-slides';
import { WorldMap, type MapStyle } from '@/components/world-map';
import { addMapPin, deleteMapPin, getPins, type PinView } from '@/lib/worldmap.functions';

export const Route = createFileRoute('/map')({
  head: () => ({ meta: [{ title: 'World Map — Apex' }, { name: 'description', content: 'Every place Apex has been: pin where you have climbed, travelled or taken the Apex name.' }, { property: 'og:title', content: 'Apex World Map' }, { property: 'og:description', content: 'Every place Apex has been.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(apexQuery),
  component: WorldMapPage,
});

type Found = { lat: number; lng: number; label: string };
// Place names come from OpenStreetMap's free lookup service, asked only when someone searches or drops a pin.
async function lookUp(q: string): Promise<Found[]> {
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=en&q=${encodeURIComponent(q)}`);
  if (!r.ok) return [];
  return ((await r.json()) as { lat: string; lon: string; display_name: string }[]).map(x => ({ lat: Number(x.lat), lng: Number(x.lon), label: x.display_name }));
}
async function nameOf(lat: number, lng: number): Promise<string> {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&accept-language=en&lat=${lat}&lon=${lng}`);
    const a = ((await r.json()) as { address?: Record<string, string> }).address ?? {};
    return [a['city'] ?? a['town'] ?? a['village'] ?? a['municipality'] ?? a['county'] ?? a['state'], a['country']].filter(Boolean).join(', ');
  } catch { return ''; }
}
const country = (place: string) => place.split(',').pop()?.trim().toLowerCase() ?? '';

function WorldMapPage() {
  const { me, linkDiscord } = useApplyAccess();
  const qc = useQueryClient();
  const load = useServerFn(getPins); const add = useServerFn(addMapPin); const remove = useServerFn(deleteMapPin);
  const data = useQuery({ queryKey: ['map-pins', me.data?.id ?? 'guest'], refetchInterval: 60000, queryFn: () => load() });
  const pins = data.data?.pins ?? [];
  const [notice, setNotice] = useState('');
  const [placing, setPlacing] = useState(false); const [draft, setDraft] = useState<{ lat: number; lng: number } | null>(null);
  const [place, setPlace] = useState(''); const [edited, setEdited] = useState(false); const [naming, setNaming] = useState(false); const [busy, setBusy] = useState(false);
  const [focus, setFocus] = useState<{ lat: number; lng: number; id?: string } | null>(null);
  const [q, setQ] = useState(''); const [results, setResults] = useState<Found[]>([]); const [searching, setSearching] = useState(false);
  // The chosen map look is remembered in this browser.
  const [mapStyle, setMapStyle] = useState<MapStyle>('satellite');
  useEffect(() => { try { const saved = localStorage.getItem('apex-map-style'); if (saved === 'satellite' || saved === 'terrain' || saved === 'streets') setMapStyle(saved); } catch { /* default look */ } }, []);
  const chooseStyle = (s: MapStyle) => { setMapStyle(s); try { localStorage.setItem('apex-map-style', s); } catch { /* not remembered */ } };

  const stats = useMemo(() => ({ pins: pins.length, countries: new Set(pins.map(p => country(p.place)).filter(Boolean)).size, climbers: new Set(pins.map(p => p.author_id)).size }), [pins]);
  const mine = pins.filter(p => p.mine).length;

  async function pick(at: { lat: number; lng: number }) {
    setDraft(at); setNaming(true);
    // The name is filled in from the map unless the member already typed their own.
    const name = await nameOf(at.lat, at.lng); setNaming(false);
    if (!edited && name) setPlace(name);
  }
  function startPlacing() { setPlacing(true); setDraft(null); setPlace(''); setEdited(false); setNotice(''); }
  function stopPlacing() { setPlacing(false); setDraft(null); setPlace(''); setEdited(false); }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!draft) return;
    const note = String(new FormData(e.currentTarget).get('note') ?? '');
    setBusy(true);
    try { await add({ data: { lat: draft.lat, lng: draft.lng, place, note } }); stopPlacing(); setNotice('Pinned. Apex was here.'); await qc.invalidateQueries({ queryKey: ['map-pins'] }); }
    catch (err) { setNotice(err instanceof Error ? err.message : 'Could not save the pin.'); } finally { setBusy(false); }
  }
  async function takeDown(pin: PinView) {
    if (!confirm(`Remove the pin at ${pin.place}?`)) return;
    try { await remove({ data: pin.id }); setNotice('Pin removed.'); await qc.invalidateQueries({ queryKey: ['map-pins'] }); }
    catch (err) { setNotice(err instanceof Error ? err.message : 'Could not remove the pin.'); }
  }
  async function search(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (q.trim().length < 2) return;
    setSearching(true); try { setResults(await lookUp(q.trim())); } finally { setSearching(false); }
  }
  function go(found: Found) {
    setResults([]); setQ(found.label.split(',')[0] ?? found.label); setFocus({ lat: found.lat, lng: found.lng });
    if (placing) void pick({ lat: found.lat, lng: found.lng });
  }

  return <ApplyShell active="map" notice={notice} onNotice={setNotice}>
    <section className="page-hero page-banner banner-slim"><HeroBackdrop /><div className="site-width page-hero-inner">
      <div className="eyebrow"><span className="line" />APEX WAS HERE</div>
      <h1 className="apply-title">World Map</h1>
      <p className="apply-lede">Every place the Apex crew has been. Drop a pin where you have climbed, travelled or flown the Apex flag, and see everyone else’s.</p>
    </div></section>
    <section className="site-width map-section">
      <div className={`map-console ${placing ? 'is-placing' : ''}`}>
      <header className="map-console-head">
        <div className="map-console-title"><span className="live-dot" aria-hidden="true" /><div><small>LIVE MAP</small><strong>Apex was here</strong></div></div>
        <div className="map-console-stats">
          <span><MapPin /><strong>{stats.pins}</strong>{stats.pins === 1 ? 'pin' : 'pins'}</span>
          <span><Globe2 /><strong>{stats.countries}</strong>{stats.countries === 1 ? 'country' : 'countries'}</span>
          <span><Users /><strong>{stats.climbers}</strong>{stats.climbers === 1 ? 'climber' : 'climbers'}</span>
        </div>
        <div className="map-style-switch" role="radiogroup" aria-label="Map style">
          {([['satellite', 'Satellite', Satellite], ['terrain', 'Terrain', Mountain], ['streets', 'Streets', Layers]] as const).map(([key, label, Icon]) => <button key={key} type="button" role="radio" aria-checked={mapStyle === key} className={mapStyle === key ? 'on' : ''} onClick={() => chooseStyle(key)}><Icon />{label}</button>)}
        </div>
      </header>
      <div className="map-shell">
        <WorldMap mapStyle={mapStyle} pins={pins} placing={placing} draft={draft} focus={focus} onPick={p => void pick(p)} onDelete={p => void takeDown(p)} canDelete={p => p.mine || !!data.data?.staff} />
        <div className="map-overlay top">
          <form className="map-search" onSubmit={search} role="search"><Search /><input value={q} onChange={e => { setQ(e.target.value); setResults([]); }} placeholder="Search a city, mountain or country" aria-label="Search the map" />{searching && <Loader2 className="spin" />}</form>
          {results.length > 0 && <ul className="map-results">{results.map(r => <li key={`${r.lat},${r.lng}`}><button type="button" onClick={() => go(r)}><MapPin />{r.label}</button></li>)}</ul>}
        </div>
        <div className="map-overlay corner">
          {!data.data?.linked ? <Button onClick={linkDiscord} disabled={me.isLoading}><DiscordIcon />Link Discord to add a pin</Button>
            : placing ? <Button variant="outline" onClick={stopPlacing}><X />Cancel</Button>
            : <Button onClick={startPlacing}><MapPinned />Pin a place</Button>}
        </div>
        {placing && !draft && <div className="map-hint"><MapPinned />Click the map where Apex was, or search a place above.</div>}
        {placing && draft && <form className="map-form" onSubmit={save}>
          <h3><MapPinned />Pin this place</h3>
          <label>Place<input value={place} onChange={e => { setPlace(e.target.value); setEdited(true); }} required minLength={2} maxLength={80} placeholder={naming ? 'Finding the name…' : 'Town, landmark or mountain'} /></label>
          <label>Note <small>(optional)</small><textarea name="note" rows={2} maxLength={200} placeholder="What happened here?" /></label>
          <small className="field-hint">Drag the pin to adjust it. Pins are rounded to about a kilometre, so pick a town or landmark, never your home.</small>
          <div className="map-form-actions"><Button type="button" variant="ghost" onClick={stopPlacing}>Cancel</Button><Button disabled={busy || naming || place.trim().length < 2}><MapPin />{busy ? 'Saving…' : 'Save pin'}</Button></div>
        </form>}
      </div>
      <footer className="map-console-foot">
        <span>{data.data?.linked ? <>You have pinned <strong>{mine}</strong> {mine === 1 ? 'place' : 'places'}{data.data.limit ? ` of ${data.data.limit}` : ''}. Click your own pin to remove it.</> : 'Link Discord to put your own pins on the map.'}</span>
        <span className="map-legend"><span><i className="legend-pin" />Member pin</span><span><i className="legend-pin gold" /><Stamp />From Postcards</span><span><i className="legend-cluster">3</i>Pins nearby</span></span>
      </footer>
      </div>
      <div className="section-header map-latest-head"><div><div className="eyebrow">LATEST PINS</div><h2>Where Apex has been</h2></div></div>
      {data.isLoading ? <div className="apply-card review-empty"><p>Loading the map…</p></div>
        : pins.length === 0 ? <div className="apply-card review-empty"><Globe2 /><p>No pins yet. Be the first to put Apex on the map.</p></div>
        : <div className="pin-list">{pins.slice(0, 24).map(p => <button key={p.id} className="pin-item" onClick={() => { window.scrollTo({ top: 0, behavior: 'smooth' }); setFocus({ lat: p.lat, lng: p.lng, id: p.id }); }}>
          <DiscordAvatar user={{ avatar_url: p.author_avatar, username: p.author_name }} />
          <span><strong>{p.place}</strong><small>@{p.author_name} · {new Date(p.created_at).toLocaleDateString([], { dateStyle: 'medium' })}</small>{p.note && <em>{p.note}</em>}</span>
          {p.source === 'postcard' && <span className="pin-badge">📮</span>}
        </button>)}</div>}
    </section>
  </ApplyShell>;
}
