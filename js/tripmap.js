// Tilted (2.5D) MapLibre map that plays the trip: the 3D traveler moves along
// every real route, walking or riding depending on the leg.
import { createTravelerLayer } from './traveler3d.js';
import { kindIcon, VEHICLE } from './itinerary.js';

const STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const VEHICLE_COLOR = { walk: '#10a39a', car: '#ff6b4a', grab: '#00b14f', songthaew: '#2e6bd6', van: '#7a5af8' };

function lineLength(coords) {
  let d = 0;
  for (let i = 1; i < coords.length; i++) d += dist(coords[i - 1], coords[i]);
  return d;
}
function dist(a, b) {
  const p = Math.PI / 180;
  const h = Math.sin((b[1] - a[1]) * p / 2) ** 2 + Math.cos(a[1] * p) * Math.cos(b[1] * p) * Math.sin((b[0] - a[0]) * p / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(h));
}
function bearing(a, b) {
  const p = Math.PI / 180;
  const y = Math.sin((b[0] - a[0]) * p) * Math.cos(b[1] * p);
  const x = Math.cos(a[1] * p) * Math.sin(b[1] * p) - Math.sin(a[1] * p) * Math.cos(b[1] * p) * Math.cos((b[0] - a[0]) * p);
  return Math.atan2(y, x);
}
function along(coords, total, frac) {
  let target = total * frac;
  for (let i = 1; i < coords.length; i++) {
    const seg = dist(coords[i - 1], coords[i]);
    if (target <= seg || i === coords.length - 1) {
      const f = seg ? Math.min(1, target / seg) : 0;
      const a = coords[i - 1], b = coords[i];
      return { pos: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], heading: bearing(a, b) };
    }
    target -= seg;
  }
  return { pos: coords[coords.length - 1], heading: 0 };
}
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createTripMap(container, trip, { onStep } = {}) {
  const { dest, items } = trip;
  const map = new maplibregl.Map({
    container, style: STYLE, center: dest.center, zoom: 12.5, pitch: 58, bearing: -20,
    attributionControl: { compact: true }, maxPitch: 75,
  });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
  const traveler = createTravelerLayer(maplibregl);
  let playing = false;
  let stopFlag = false;
  let current = -1;
  let camBearing = -20;

  const legs = items.map((it, i) => ({ it, i })).filter((x) => x.it.type === 'leg');
  const stops = items.map((it, i) => ({ it, i })).filter((x) => x.it.type === 'stop');

  map.on('load', () => {
    // 3D buildings if the style does not already extrude them
    const hasExtrusion = map.getStyle().layers.some((l) => l.type === 'fill-extrusion');
    if (!hasExtrusion && map.getSource('openmaptiles')) {
      map.addLayer({
        id: 'bld-3d', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 14,
        paint: { 'fill-extrusion-color': '#e9dfd6', 'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6], 'fill-extrusion-opacity': 0.85 },
      });
    }
    const feats = legs.map(({ it }) => ({
      type: 'Feature', properties: { v: it.vehicle, long: it.isLong ? 1 : 0, color: VEHICLE_COLOR[it.vehicle] },
      geometry: { type: 'LineString', coordinates: it.geom },
    }));
    map.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: feats } });
    map.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 4, 15, 9] } });
    const width = ['interpolate', ['linear'], ['zoom'], 8, 2, 15, 5];
    map.addLayer({ id: 'route-line', type: 'line', source: 'route', filter: ['!=', ['get', 'v'], 'walk'],
      layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': width } });
    map.addLayer({ id: 'route-walk', type: 'line', source: 'route', filter: ['==', ['get', 'v'], 'walk'],
      layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': width, 'line-dasharray': [1, 1.6] } });
    map.addSource('done', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

    stops.forEach(({ it }, n) => {
      const el = document.createElement('button');
      el.className = 'pin-wrap';
      el.setAttribute('aria-label', it.poi.name);
      el.innerHTML = `<div class="pin"><i class="ti ${kindIcon(it.poi.kind)}"></i><span>${n + 1}</span></div>`;
      const gmaps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(it.poi.name)}&query_place_id=&center=${it.poi.lat},${it.poi.lon}`;
      const popup = new maplibregl.Popup({ offset: 44, closeButton: false }).setHTML(
        `<b>${it.poi.name}</b><br><span class="small muted">${it.slot.label}</span><br><a href="${gmaps}" target="_blank" rel="noopener">เปิดใน Google Maps</a>`);
      new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([it.poi.lon, it.poi.lat]).setPopup(popup).addTo(map);
    });

    map.addLayer(traveler.layer);
    traveler.set({ lngLat: dest.center, visible: false });
    fitLocal();
  });

  function fitLocal() {
    const pts = stops.map(({ it }) => [it.poi.lon, it.poi.lat]);
    if (!pts.length) return;
    const b = pts.reduce((bb, p) => bb.extend(p), new maplibregl.LngLatBounds(pts[0], pts[0]));
    map.fitBounds(b, { padding: 60, pitch: 55, bearing: camBearing, duration: 900, maxZoom: 15 });
  }

  async function animateLeg(it) {
    const total = lineLength(it.geom);
    const ms = it.isLong ? 7000 : Math.min(6500, Math.max(2600, total * (it.vehicle === 'walk' ? 6 : 1.1)));
    const zoom = it.isLong ? 8.6 : it.vehicle === 'walk' ? 16.2 : 14.8;
    const startPos = it.geom[0];
    map.easeTo({ center: startPos, zoom, pitch: it.isLong ? 45 : 62, duration: 900 });
    await sleep(950);
    traveler.set({ vehicle: it.vehicle, visible: true, size: it.isLong ? 1.6 : it.vehicle === 'walk' ? 1.8 : 1.1 });
    const t0 = performance.now();
    return new Promise((resolve) => {
      const frame = (now) => {
        if (stopFlag) return resolve(false);
        const f = Math.min(1, (now - t0) / ms);
        const { pos, heading } = along(it.geom, total, it.isLong ? ease(f) : f);
        camBearing += 0.04;
        traveler.set({ lngLat: pos, heading: heading + Math.PI, t: now / 1000 });
        map.jumpTo({ center: pos, bearing: camBearing });
        if (f < 1) requestAnimationFrame(frame);
        else resolve(true);
      };
      requestAnimationFrame(frame);
    });
  }

  async function play(fromIndex = 0) {
    if (playing) return;
    playing = true;
    stopFlag = false;
    for (let i = fromIndex; i < items.length; i++) {
      if (stopFlag) break;
      current = i;
      onStep?.(i, playing);
      const it = items[i];
      if (it.type === 'leg') {
        const ok = await animateLeg(it);
        if (!ok) break;
      } else if (it.type === 'stop') {
        map.easeTo({ center: [it.poi.lon, it.poi.lat], zoom: 16.4, pitch: 64, duration: 700 });
        await sleep(1300);
      } else {
        await sleep(700);
      }
    }
    playing = false;
    onStep?.(current, false);
  }

  function pause() { stopFlag = true; playing = false; }

  function focus(i) {
    pause();
    current = i;
    const it = items[i];
    if (it.type === 'stop') {
      traveler.set({ lngLat: [it.poi.lon, it.poi.lat], vehicle: 'walk', visible: true, size: 1.8 });
      map.flyTo({ center: [it.poi.lon, it.poi.lat], zoom: 16.4, pitch: 64, duration: 900 });
    } else if (it.type === 'leg') {
      const b = it.geom.reduce((bb, p) => bb.extend(p), new maplibregl.LngLatBounds(it.geom[0], it.geom[0]));
      traveler.set({ lngLat: it.geom[0], vehicle: it.vehicle, visible: true, size: it.isLong ? 1.6 : 1 });
      map.fitBounds(b, { padding: 70, pitch: 55, duration: 900, maxZoom: 16 });
    }
    onStep?.(i, false);
  }

  return { map, play, pause, focus, isPlaying: () => playing, current: () => current, fitLocal, destroy: () => { pause(); map.remove(); } };
}

export { VEHICLE };
