import { useEffect, useRef } from 'react';
import type * as Leaflet from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import type { PinView } from '@/lib/worldmap.functions';

type L = typeof Leaflet;
export type MapStyle = 'satellite' | 'terrain' | 'streets';

// The three looks of the map. Satellite shows real mountains, with country and city names laid over it.
const ESRI = 'Tiles &copy; <a href="https://www.esri.com">Esri</a>, Maxar, Earthstar Geographics';
const OSM = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
function baseLayers(L: L): Record<MapStyle, Leaflet.Layer> {
  return {
    satellite: L.layerGroup([
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: ESRI, maxZoom: 18 }),
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18, pane: 'labels' }),
    ]),
    terrain: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { attribution: `${OSM}, SRTM | style &copy; <a href="https://opentopomap.org">OpenTopoMap</a>`, subdomains: 'abc', maxZoom: 17 }),
    streets: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: OSM, maxZoom: 18 }),
  };
}
const coord = (lat: number, lng: number) => `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}  ·  ${Math.abs(((lng + 540) % 360) - 180).toFixed(2)}° ${((lng + 540) % 360) - 180 >= 0 ? 'E' : 'W'}`;

// The interactive map. Leaflet only runs in the browser, so it is loaded after the page appears.
// Every pin shows its owner's Discord picture; nearby pins group into a numbered bubble until you zoom in.
// While `placing` is on, a click drops a draggable pin and reports where it is.
export function WorldMap({ pins, placing, draft, focus, onPick, onDelete, canDelete, mapStyle = 'satellite' }: {
  mapStyle?: MapStyle; pins: PinView[]; placing: boolean; draft: { lat: number; lng: number } | null; focus: { lat: number; lng: number; id?: string } | null;
  onPick: (at: { lat: number; lng: number }) => void; onDelete: (pin: PinView) => void; canDelete: (pin: PinView) => boolean;
}) {
  const box = useRef<HTMLDivElement>(null); const readout = useRef<HTMLSpanElement>(null);
  const api = useRef<{ L: L; map: Leaflet.Map; cluster: Leaflet.MarkerClusterGroup; markers: Map<string, Leaflet.Marker>; draft?: Leaflet.Marker | undefined; layers: Record<MapStyle, Leaflet.Layer>; style: MapStyle } | null>(null);
  const styleRef = useRef(mapStyle); styleRef.current = mapStyle;
  const handlers = useRef({ onPick, onDelete, canDelete, placing });
  handlers.current = { onPick, onDelete, canDelete, placing };

  // Build the map once.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const L = (await import('leaflet')).default;
      (window as unknown as { L: L }).L = L;
      await import('leaflet.markercluster');
      if (cancelled || !box.current || api.current) return;
      const map = L.map(box.current, { center: [25, 10], zoom: 2, minZoom: 2, maxBounds: [[-85, -200], [85, 200]], worldCopyJump: true, zoomControl: false,
        // No fade-in for map pictures: a fade waits on the browser's animation timer, and when that timer stalls the
        // pictures of a newly chosen map style stayed invisible until the page was refreshed.
        fadeAnimation: false });
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      map.attributionControl.setPrefix('');
      // Place names sit above the satellite pictures but below the pins.
      map.createPane('labels'); const labels = map.getPane('labels'); if (labels) { labels.style.zIndex = '450'; labels.style.pointerEvents = 'none'; }
      const layers = baseLayers(L); layers[styleRef.current].addTo(map);
      // The live position under the pointer, like the coordinates on the homepage.
      map.on('mousemove', e => { if (readout.current) readout.current.textContent = coord(e.latlng.lat, e.latlng.lng); });
      map.on('moveend', () => { if (readout.current && !readout.current.matches(':hover')) { const c = map.getCenter(); readout.current.textContent = coord(c.lat, c.lng); } });
      const cluster = L.markerClusterGroup({ showCoverageOnHover: false, removeOutsideVisibleBounds: false, maxClusterRadius: 48, iconCreateFunction: c => L.divIcon({ html: `<span>${c.getChildCount()}</span>`, className: 'pin-cluster', iconSize: [44, 44] }) });
      map.addLayer(cluster);
      map.on('click', e => { if (handlers.current.placing) handlers.current.onPick({ lat: e.latlng.lat, lng: e.latlng.lng }); });
      api.current = { L, map, cluster, markers: new Map(), layers, style: styleRef.current };
      // The map measures its box when it starts; redraw whenever that box changes size so no part stays blank.
      const resize = new ResizeObserver(() => { map.invalidateSize(); map.fire('moveend'); });
      resize.observe(box.current);
      map.once('unload', () => resize.disconnect());
      setTimeout(() => { map.invalidateSize(); map.fire('moveend'); }, 300);
      window.dispatchEvent(new Event('apex-map-ready'));
    })();
    return () => { cancelled = true; api.current?.map.remove(); api.current = null; };
  }, []);

  // Draw the pins whenever the list changes (and once the map has loaded).
  useEffect(() => {
    const draw = () => {
      const a = api.current; if (!a) return;
      const { L, cluster, markers } = a;
      cluster.clearLayers(); markers.clear();
      for (const pin of pins) {
        const icon = L.divIcon({ className: `pin-marker ${pin.source === 'postcard' ? 'postcard' : ''}`, html: `<span class="pin-face"><img src="${pin.author_avatar.replace(/"/g, '')}" alt="" loading="lazy" /></span>`, iconSize: [40, 50], iconAnchor: [20, 48], popupAnchor: [0, -44] });
        const marker = L.marker([pin.lat, pin.lng], { icon, title: `${pin.place} · @${pin.author_name}` });
        marker.bindPopup(() => popup(pin), { className: 'pin-popup', maxWidth: 260 });
        markers.set(pin.id, marker); cluster.addLayer(marker);
      }
    };
    draw();
    window.addEventListener('apex-map-ready', draw);
    return () => window.removeEventListener('apex-map-ready', draw);
  }, [pins]);

  // Popup contents are built from elements, never from HTML, since names and notes are typed by members.
  function popup(pin: PinView) {
    const el = (tag: string, cls: string, text = '') => { const n = document.createElement(tag); n.className = cls; if (text) n.textContent = text; return n; };
    const root = el('div', 'pin-card');
    const head = el('div', 'pin-card-head'); const img = document.createElement('img'); img.src = pin.author_avatar; img.alt = ''; head.append(img);
    const who = el('div', 'pin-card-who'); who.append(el('strong', '', `@${pin.author_name}`), el('small', '', new Date(pin.created_at).toLocaleDateString([], { dateStyle: 'medium' }))); head.append(who);
    root.append(head, el('p', 'pin-card-place', pin.place));
    if (pin.note) root.append(el('p', 'pin-card-note', pin.note));
    if (pin.source === 'postcard') root.append(el('span', 'pin-card-tag', '📮 From Apex Postcards'));
    if (handlers.current.canDelete(pin)) { const b = el('button', 'pin-card-remove', pin.mine ? 'Remove my pin' : 'Remove pin'); b.addEventListener('click', () => handlers.current.onDelete(pin)); root.append(b); }
    return root;
  }

  // The pin being placed: dragging it moves it.
  useEffect(() => {
    const a = api.current; if (!a) return;
    a.draft?.remove(); a.draft = undefined;
    if (!draft) return;
    const icon = a.L.divIcon({ className: 'pin-marker draft', html: '<span class="pin-face"><b>+</b></span>', iconSize: [40, 50], iconAnchor: [20, 48] });
    a.draft = a.L.marker([draft.lat, draft.lng], { icon, draggable: true, zIndexOffset: 1000 }).addTo(a.map);
    a.draft.on('dragend', () => { const at = a.draft?.getLatLng(); if (at) handlers.current.onPick({ lat: at.lat, lng: at.lng }); });
  }, [draft]);

  // Fly to a place picked from search or the list, opening that pin's card.
  useEffect(() => {
    const a = api.current; if (!a || !focus) return;
    a.map.flyTo([focus.lat, focus.lng], Math.max(a.map.getZoom(), focus.id ? 12 : 10), { duration: 1.2 });
    if (focus.id) { const m = a.markers.get(focus.id); if (m) setTimeout(() => a.cluster.zoomToShowLayer(m, () => m.openPopup()), 1300); }
  }, [focus]);

  useEffect(() => { box.current?.classList.toggle('placing', placing); }, [placing]);

  // Switch between satellite, terrain and street maps. The new style goes on top and the old one stays underneath
  // until the new pictures have arrived (6 seconds at most), so the map never sits blank while a slower map server
  // answers. A refresh is never needed.
  useEffect(() => {
    const a = api.current; if (!a || a.style === mapStyle) return;
    const chosen = a.layers[mapStyle];
    a.style = mapStyle;
    a.map.setMaxZoom(mapStyle === 'terrain' ? 17 : 18);
    const tiles: Leaflet.TileLayer[] = [];
    if (chosen instanceof a.L.TileLayer) tiles.push(chosen);
    else if (chosen instanceof a.L.LayerGroup) chosen.eachLayer(l => { if (l instanceof a.L.TileLayer) tiles.push(l); });
    // Switching back before the old style left: it is still on the map and already drawn.
    const already = a.map.hasLayer(chosen);
    if (!already) chosen.addTo(a.map);
    tiles.forEach(t => t.bringToFront());
    a.map.invalidateSize();
    let done = false;
    const finish = () => {
      if (done) return; done = true; clearTimeout(timer);
      for (const key of Object.keys(a.layers) as MapStyle[]) if (key !== a.style && a.map.hasLayer(a.layers[key])) a.map.removeLayer(a.layers[key]);
    };
    const timer = setTimeout(finish, 6000);
    if (already) finish(); else tiles[0]?.once('load', finish);
    return finish;
  }, [mapStyle]);

  return <>
    <div ref={box} className={`world-map style-${mapStyle}`} role="application" aria-label="World map of places Apex members have pinned" />
    <span className="map-readout" ref={readout} aria-hidden="true">25.00° N  ·  10.00° E</span>
  </>;
}
