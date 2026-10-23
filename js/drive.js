// Self-drive planner: when to leave, which route (TomTom traffic, or an estimate from
// the stored OSRM route when there is no key or TomTom fails), rest stops along the
// way, a travel-day mode that refreshes the ETA from the customer's location, and a
// hand-off to Google Maps for the live navigation.
import { CONFIG } from './config.js';

export const REST_MIN = 15;          // minutes at each rest stop
const DETOUR_MIN = 3;                // in and out of a rest stop, for the estimate
const STOP_EVERY = [60, 90];         // suggest a break after 60-90 minutes of driving
const LIVE_EVERY_MS = 5 * 60 * 1000;
const FASTER_SEC = 5 * 60;           // only suggest another route when it saves more than this

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const hhmm = (min) => { const m = Math.round(min); return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const dur = (sec) => { const m = Math.max(1, Math.round(sec / 60)); return m < 60 ? `${m} นาที` : `${Math.floor(m / 60)} ชม.${m % 60 ? ` ${m % 60} นาที` : ''}`; };
const KIND = { fuel: ['ti-gas-station', 'ปั๊มน้ำมัน'], cafe: ['ti-coffee', 'คาเฟ่'], restaurant: ['ti-tools-kitchen-2', 'ร้านอาหาร'] };
export const restIcon = (kind) => (KIND[kind] || KIND.fuel)[0];

function dist(a, b) {
  const p = Math.PI / 180;
  const h = Math.sin((b[1] - a[1]) * p / 2) ** 2 + Math.cos(a[1] * p) * Math.cos(b[1] * p) * Math.sin((b[0] - a[0]) * p / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(h));
}
const cumulative = (geom) => geom.reduce((acc, p, i) => { acc.push(i ? acc[i - 1] + dist(geom[i - 1], p) : 0); return acc; }, []);

// ---------- traffic estimate (no TomTom) ----------
// How much slower than the free-flow OSRM time a drive is, by when it leaves. These are
// our own rough assumptions, always shown as "ประมาณการ": leaving Bangkok on a weekday
// morning, coming back on a weekday evening or a Sunday afternoon is slow.
export function rushFactor(iso, min, dir) {
  const g = new Date(iso).getDay();
  const weekday = g >= 1 && g <= 5;
  const h = min / 60;
  if (dir === 'out') {
    if (weekday && h >= 6.5 && h < 9.5) return 1.3;
    if (g === 5 && h >= 16 && h < 20) return 1.3;
    if (!weekday && h >= 7 && h < 10) return 1.15;
    return 1.1;
  }
  if (weekday && h >= 15.5 && h < 19.5) return 1.35;
  if (g === 0 && h >= 14 && h < 20) return 1.3;
  return 1.1;
}

// The stored route, cut at the rest stops, with an estimated time for each piece.
function estimatePlan(leg, stops, factor, dir) {
  const geom = dir === 'out' ? leg.geom : [...leg.geom].reverse();
  const cum = cumulative(geom);
  const total = cum[cum.length - 1];
  const at = (s) => (dir === 'out' ? s.km * 1000 : total - s.km * 1000);
  const cuts = [...stops].sort((a, b) => at(a) - at(b));
  const segments = [];
  let piece = [geom[0]];
  let i = 1;
  let last = 0;
  for (const s of [...cuts, null]) {
    const end = s ? at(s) : Infinity;
    while (i < geom.length && cum[i] < end) piece.push(geom[i++]);
    const p = s ? [s.lon, s.lat] : geom[geom.length - 1];
    if (s || piece.length < 2) piece.push(p);
    const m = (s ? end : total) - last;
    segments.push({ geom: piece, m: Math.round(m), sec: (leg.sec * factor * m) / total + (s ? DETOUR_MIN * 60 : 0), exact: true });
    piece = [p];
    last = s ? end : total;
  }
  const sec = segments.reduce((a, g) => a + g.sec, 0);
  return { source: 'estimate', segments, sec, m: leg.m, extraSec: leg.sec * (factor - 1), stops: cuts };
}

// ---------- TomTom ----------
const ll = (p) => `${p[1].toFixed(6)},${p[0].toFixed(6)}`;
function thin(points, max = 400) {
  const step = Math.max(1, Math.ceil(points.length / max));
  const out = points.filter((_, i) => i % step === 0);
  if (out[out.length - 1] !== points[points.length - 1]) out.push(points[points.length - 1]);
  return out;
}
function fromTomTom(route, stops) {
  const segments = route.legs.map((leg) => ({
    geom: thin(leg.points.map((p) => [p.longitude, p.latitude])),
    sec: leg.summary.travelTimeInSeconds, m: leg.summary.lengthInMeters, exact: true,
  }));
  const s = route.summary;
  const free = s.noTrafficTravelTimeInSeconds ?? s.travelTimeInSeconds - (s.trafficDelayInSeconds || 0);
  return { source: 'tomtom', segments, sec: s.travelTimeInSeconds, m: s.lengthInMeters,
    extraSec: Math.max(0, s.travelTimeInSeconds - free), stops, arrival: s.arrivalTime };
}

// Routes from `points[0]` to the last point through the ones between, leaving at `depart`
// (an ISO time, or 'now'). Returns up to three plans: the best and two alternatives.
async function tomtom(points, depart, stops, { alternatives = 2, reference = null } = {}) {
  const q = new URLSearchParams({ key: CONFIG.tomtomKey, traffic: 'true', travelMode: 'car', routeType: 'fastest',
    computeTravelTimeFor: 'all', departAt: depart, maxAlternatives: String(alternatives), language: 'th-TH' });
  if (reference) q.set('alternativeType', 'betterRoute');
  const url = `https://api.tomtom.com/routing/1/calculateRoute/${points.map(ll).join(':')}/json?${q}`;
  const res = reference
    ? await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supportingPoints: thin(reference, 150).map((p) => ({ latitude: p[1], longitude: p[0] })) }) })
    : await fetch(url);
  if (!res.ok) throw new Error(`TomTom ${res.status}`);
  const data = await res.json();
  if (!data.routes?.length) throw new Error('TomTom: no route');
  return data.routes.map((r) => fromTomTom(r, stops));
}

const departIso = (iso, min) => {
  const at = new Date(`${iso}T${hhmm(min)}:00+07:00`);
  return at.getTime() > Date.now() + 60000 ? `${iso}T${hhmm(min)}:00+07:00` : 'now';
};
const nextDay = (iso) => { const d = new Date(`${iso}T12:00:00+07:00`); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };

// ---------- rest stops ----------
// One stop about every 60-90 minutes: the place nearest each target time, preferring a
// fuel station with food next to it, then any fuel station, then a cafe.
export function suggestStops(list, driveMin, dir) {
  const n = driveMin > STOP_EVERY[1] ? Math.ceil(driveMin / STOP_EVERY[1]) - 1 : 0;
  const total = driveMin;
  const minute = (p) => (dir === 'out' ? p.min : total - p.min);
  const picked = [];
  for (let k = 1; k <= n; k++) {
    const target = Math.min(total - 20, Math.max(STOP_EVERY[0], (k * total) / (n + 1)));
    const rank = (p) => Math.abs(minute(p) - target) + (p.kind === 'fuel' ? (p.food ? 0 : 8) : 15);
    const best = [...list].filter((p) => !picked.includes(p)).sort((a, b) => rank(a) - rank(b))[0];
    if (best) picked.push(best);
  }
  return picked;
}

// ---------- Google Maps ----------
export function gmapsUrl(origin, destination, stops) {
  const q = new URLSearchParams({ api: '1', destination: ll(destination), travelmode: 'driving' });
  if (origin) q.set('origin', ll(origin));
  if (stops.length) q.set('waypoints', stops.map((s) => ll([s.lon, s.lat])).join('|'));
  return `https://www.google.com/maps/dir/?${q}`;
}

// ---------- the planner panel ----------
// ctx: { trip, roadside (this destination's list), state (from an earlier planner.state,
// to keep the customer's choices), onPlan(drive) } - onPlan gets { depart, out, back }
// and should rebuild the trip; then call planner.update(trip).
export function mountDrivePlanner(el, ctx) {
  const dest = ctx.trip.dest;
  const leg = dest.legs['ORIGIN>ARRIVE'];
  const home = [CONFIG.origin.lon, CONFIG.origin.lat];
  const town = leg.geom[leg.geom.length - 1];
  const list = ctx.roadside || [];
  const baseMin = leg.sec / 60;
  const st = ctx.state ? Object.assign(ctx.state, { trip: ctx.trip, live: null, routes: { out: null, back: null } }) : {
    trip: ctx.trip, depart: '07:00',
    stops: { out: suggestStops(list, baseMin * 1.15, 'out'), back: suggestStops(list, baseMin * 1.15, 'back') },
    routes: { out: null, back: null }, pick: { out: 0, back: 0 }, note: { out: '', back: '' },
    open: { out: false, back: false }, live: null,
  };
  const hasKey = () => !!CONFIG.tomtomKey;
  const backDepart = () => st.trip.items.find((i) => i.type === 'depart')?.time ?? toMin('14:00');
  const firstStop = () => st.trip.items.find((i) => i.type === 'stop');
  const lastStop = () => [...st.trip.items].reverse().find((i) => i.type === 'stop');
  const ends = (dir) => (dir === 'out' ? [home, town] : [town, home]);

  function estimate(dir) {
    const min = dir === 'out' ? toMin(st.depart) : backDepart();
    const iso = dir === 'out' ? st.trip.date : nextDay(st.trip.date);
    return [estimatePlan(leg, st.stops[dir], rushFactor(iso, min, dir), dir)];
  }

  const seq = { out: 0, back: 0 };
  async function route(dir) {
    const mine = ++seq[dir];
    st.routes[dir] = estimate(dir);
    st.pick[dir] = 0;
    st.note[dir] = hasKey() ? 'กำลังถามสภาพจราจรจาก TomTom…' : '';
    if (!hasKey()) return;
    const [a, b] = ends(dir);
    const pts = [a, ...st.stops[dir].map((s) => [s.lon, s.lat]), b];
    const iso = dir === 'out' ? st.trip.date : nextDay(st.trip.date);
    const min = dir === 'out' ? toMin(st.depart) : backDepart();
    try {
      let plans;
      try { plans = await tomtom(pts, departIso(iso, min), st.stops[dir]); }
      catch (e) { plans = await tomtom(pts, departIso(iso, min), st.stops[dir], { alternatives: 0 }); } // in case alternatives are refused with stops
      if (mine !== seq[dir]) return; // a newer request for this direction is on its way
      st.routes[dir] = plans;
      st.note[dir] = '';
    } catch (e) {
      console.warn('TomTom', e);
      st.note[dir] = 'ติดต่อ TomTom ไม่ได้ ใช้เวลาประมาณการแทน';
    }
  }

  const plan = (dir) => st.routes[dir]?.[st.pick[dir]] || estimate(dir)[0];
  const emit = () => ctx.onPlan({ depart: toMin(st.depart), out: plan('out'), back: plan('back') });

  async function replan(dirs = ['out', 'back']) {
    for (const d of dirs) st.routes[d] = estimate(d);
    render();
    emit();
    if (!hasKey()) return;
    await Promise.all(dirs.map(route));
    render();
    emit();
  }

  function routeCard(dir) {
    const plans = st.routes[dir] || estimate(dir);
    const p = plans[st.pick[dir]] || plans[0];
    const isEst = p.source !== 'tomtom';
    const opts = plans.length > 1 ? `<div class="dr-alts">${plans.map((r, i) => `
      <button class="dr-alt ${i === st.pick[dir] ? 'on' : ''}" data-pick="${dir}:${i}">
        <b>${i ? `ทางเลือก ${i}` : 'เร็วสุด'}</b><span>${dur(r.sec)} · ${(r.m / 1000).toFixed(0)} กม.</span></button>`).join('')}</div>` : '';
    const stopsHtml = st.stops[dir].map((s, i) => `
      <li><i class="ti ${restIcon(s.kind)}"></i><span>${esc(s.name)}<small>${KIND[s.kind]?.[1] || ''} · กม. ${dir === 'out' ? s.km : (leg.m / 1000 - s.km).toFixed(1)}${s.food ? ' · มีร้านกาแฟ/อาหาร' : ''}</small></span>
        <button class="dr-x" data-del="${dir}:${i}" aria-label="เอาจุดพักนี้ออก"><i class="ti ti-x"></i></button></li>`).join('');
    const more = st.open[dir] ? `<ul class="dr-more">${list.filter((s) => !st.stops[dir].includes(s)).map((s) => `
      <li><i class="ti ${restIcon(s.kind)}"></i><span>${esc(s.name)}<small>${KIND[s.kind]?.[1] || ''} · ${dir === 'out' ? s.min : Math.round(baseMin - s.min)} นาทีจาก${dir === 'out' ? 'กรุงเทพฯ' : dest.name}</small></span>
        <button class="dr-add" data-add="${dir}:${list.indexOf(s)}">เพิ่ม</button></li>`).join('') || '<li class="muted">ไม่มีจุดพักอื่นในข้อมูล</li>'}</ul>` : '';
    const [o, d] = dir === 'out' ? [null, firstStop() ? [firstStop().poi.lon, firstStop().poi.lat] : town] : [lastStop() ? [lastStop().poi.lon, lastStop().poi.lat] : town, home];
    return `
      <div class="dr-leg">
        <div class="dr-h"><b>${dir === 'out' ? `ขาไป · ออก ${st.depart}` : `ขากลับ · ออก ${hhmm(backDepart())}`}</b>
          <span class="dr-src ${isEst ? 'est' : ''}">${isEst ? 'ประมาณการ' : 'TomTom จราจร'}</span></div>
        <div class="dr-eta"><span class="big">${dur(p.sec)}</span><span>${(p.m / 1000).toFixed(0)} กม.${st.stops[dir].length ? ` · พัก ${st.stops[dir].length} จุด (+${st.stops[dir].length * REST_MIN} นาที)` : ''}</span>
          ${p.extraSec > 60 ? `<span class="dr-jam"><i class="ti ti-traffic-lights"></i> รถติดเพิ่ม${isEst ? 'ประมาณ' : ''} ${dur(p.extraSec)}</span>` : ''}</div>
        ${st.note[dir] ? `<div class="small muted">${esc(st.note[dir])}</div>` : ''}
        ${opts}
        <div class="dr-sub">จุดแวะพัก</div>
        <ul class="dr-stops">${stopsHtml || '<li class="muted">ไม่แวะพัก</li>'}</ul>
        <button class="dr-link" data-more="${dir}">${st.open[dir] ? 'ซ่อนรายการ' : '+ เพิ่มจุดพัก'}</button>
        ${more}
        <a class="btn btn-ghost dr-gmaps" target="_blank" rel="noopener" href="${gmapsUrl(o, d, st.stops[dir])}"><i class="ti ti-brand-google-maps"></i> นำทางด้วย Google Maps</a>
      </div>`;
  }

  function liveHtml() {
    const L = st.live;
    if (!L) return `<button class="btn btn-ghost btn-block" id="dr-live"><i class="ti ti-navigation"></i> โหมดวันเดินทาง (ใช้ตำแหน่งของคุณ)</button>`;
    return `<div class="dr-live">
      <div class="dr-h"><b><i class="ti ti-navigation"></i> โหมดวันเดินทาง · ${L.dir === 'out' ? 'ขาไป' : 'ขากลับ'}</b><button class="dr-link" id="dr-live-off">ปิด</button></div>
      ${L.error ? `<div class="warn">${esc(L.error)}</div>` : L.eta == null ? '<div class="small muted">กำลังหาตำแหน่ง…</div>' : `
        <div class="dr-eta"><span class="big">ถึงประมาณ ${hhmm(L.eta)}</span><span>เหลือ ${(L.leftM / 1000).toFixed(0)} กม. · อัปเดต ${hhmm(L.at)}</span>
        <span class="dr-src ${L.source === 'tomtom' ? '' : 'est'}">${L.source === 'tomtom' ? 'TomTom จราจรตอนนี้' : 'ประมาณการจากระยะทาง'}</span></div>
        ${L.faster ? `<div class="dr-faster"><i class="ti ti-bolt"></i> ทางเร็วกว่า ${dur(L.faster.save)} <a target="_blank" rel="noopener" href="${L.faster.url}">เปิดใน Google Maps</a></div>` : ''}
        ${!hasKey() ? '<div class="small muted">ยังไม่มีคีย์ TomTom จึงยังเทียบหาทางที่เร็วกว่าไม่ได้</div>' : ''}`}
      <div class="small muted">อัปเดตทุก 5 นาที ตำแหน่งใช้ในเครื่องนี้เท่านั้น</div></div>`;
  }

  function render() {
    el.innerHTML = `
      <div class="drive">
        <div class="dr-top"><h4><i class="ti ti-steering-wheel"></i> แผนขับรถ</h4>
          <label class="dr-time">ออกจากบ้าน <input type="time" id="dr-depart" value="${st.depart}" step="900"></label></div>
        ${routeCard('out')}
        ${routeCard('back')}
        ${liveHtml()}
        <p class="fine">${hasKey() ? 'เวลาจาก TomTom Routing (รวมสภาพจราจรที่คาดการณ์ตามวันและเวลา)' : 'ยังไม่ได้ใส่คีย์ TomTom: เวลาเป็นประมาณการจากเส้นทาง OSRM บวกช่วงรถติดโดยประมาณ'} · จุดพักจาก OpenStreetMap ห่างเส้นทางไม่เกิน 500 ม.</p>
      </div>`;
    el.querySelector('#dr-depart').onchange = (e) => { if (e.target.value) { st.depart = e.target.value; replan(['out']); } };
    el.querySelectorAll('[data-pick]').forEach((b) => (b.onclick = () => { const [d, i] = b.dataset.pick.split(':'); st.pick[d] = Number(i); render(); emit(); }));
    el.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => { const [d, i] = b.dataset.del.split(':'); st.stops[d].splice(Number(i), 1); replan([d]); }));
    el.querySelectorAll('[data-add]').forEach((b) => (b.onclick = () => {
      const [d, i] = b.dataset.add.split(':');
      st.stops[d].push(list[Number(i)]);
      st.stops[d].sort((x, y) => (d === 'out' ? x.km - y.km : y.km - x.km));
      replan([d]);
    }));
    el.querySelectorAll('[data-more]').forEach((b) => (b.onclick = () => { st.open[b.dataset.more] = !st.open[b.dataset.more]; render(); }));
    el.querySelector('#dr-live')?.addEventListener('click', startLive);
    el.querySelector('#dr-live-off')?.addEventListener('click', stopLive);
  }

  // ---------- travel-day mode ----------
  function startLive() {
    if (!navigator.geolocation) { st.live = { error: 'เบราว์เซอร์นี้ไม่ให้ใช้ตำแหน่ง' }; render(); return; }
    const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
    st.live = { dir: today === nextDay(st.trip.date) ? 'back' : 'out', eta: null, pos: null };
    const L = st.live;
    L.watch = navigator.geolocation.watchPosition((p) => {
      const first = !L.pos;
      L.pos = [p.coords.longitude, p.coords.latitude];
      if (first) refreshLive();
    }, (err) => { L.error = err.code === 1 ? 'ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง เปิดสิทธิ์ตำแหน่งในเบราว์เซอร์แล้วลองใหม่' : 'หาตำแหน่งไม่ได้ ลองใหม่อีกครั้ง'; render(); },
    { enableHighAccuracy: true, maximumAge: 60000 });
    L.timer = setInterval(refreshLive, LIVE_EVERY_MS);
    render();
  }
  function stopLive() {
    if (st.live?.watch != null) navigator.geolocation.clearWatch(st.live.watch);
    clearInterval(st.live?.timer);
    st.live = null;
    render();
  }

  async function refreshLive() {
    const L = st.live;
    if (!L?.pos) return;
    const p = plan(L.dir);
    const geom = p.segments.flatMap((s) => s.geom);
    // where along the planned route we are now
    const nearest = (pt) => geom.reduce((best, g, i) => (dist(g, pt) < dist(geom[best], pt) ? i : best), 0);
    const near = nearest(L.pos);
    const rest = geom.slice(near);
    const cum = cumulative(rest);
    const now = new Date(Date.now() + 7 * 3600000);
    const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
    const [, b] = ends(L.dir);
    const leftStops = p.stops.filter((s) => nearest([s.lon, s.lat]) > near);
    Object.assign(L, { at: nowMin, leftM: Math.max(cum[cum.length - 1], dist(L.pos, b)), faster: null, error: null });
    if (hasKey()) {
      try {
        const pts = [L.pos, ...leftStops.map((s) => [s.lon, s.lat]), b];
        // reconstruct the planned route from here and ask only for routes that beat it
        const plans = await tomtom(pts, 'now', leftStops, rest.length > 2 && !leftStops.length ? { alternatives: 1, reference: [L.pos, ...rest] } : { alternatives: 0 });
        L.eta = nowMin + plans[0].sec / 60;
        L.leftM = plans[0].m;
        L.source = 'tomtom';
        if (plans[1] && plans[0].sec - plans[1].sec > FASTER_SEC) {
          const mid = plans[1].segments[0].geom[Math.floor(plans[1].segments[0].geom.length / 2)];
          L.faster = { save: plans[0].sec - plans[1].sec, url: gmapsUrl(null, b, [{ lon: mid[0], lat: mid[1] }]) };
        }
      } catch (e) {
        console.warn('TomTom live', e);
        L.source = 'estimate';
        L.eta = nowMin + (p.sec * (L.leftM / p.m)) / 60;
      }
    } else {
      L.source = 'estimate';
      L.eta = nowMin + (p.sec * (L.leftM / p.m)) / 60 + leftStops.length * REST_MIN;
    }
    render();
  }

  render();
  replan();
  return {
    update(trip) {
      const backChanged = backDepart() !== (trip.items.find((i) => i.type === 'depart')?.time ?? 0);
      st.trip = trip;
      if (backChanged) replan(['back']);
      else render();
    },
    state: st,
    // a stop picked on the map
    addStop(dir, stop) {
      if (st.stops[dir].includes(stop)) return;
      st.stops[dir].push(stop);
      st.stops[dir].sort((x, y) => (dir === 'out' ? x.km - y.km : y.km - x.km));
      replan([dir]);
    },
    destroy: () => { if (st.live) stopLive(); },
  };
}
