// Turns one destination's data into a concrete 2-day trip: one place per
// slot, real clock times, and the travel legs between every stop.
import { REST_MIN } from './drive.js';

const KIND_ICON = {
  cafe: 'ti-coffee', food: 'ti-tools-kitchen-2', stay: 'ti-bed', view: 'ti-mountain',
  beach: 'ti-beach', waterfall: 'ti-ripple', market: 'ti-building-store', temple: 'ti-building-monument',
  museum: 'ti-building-bank', park: 'ti-trees', sight: 'ti-camera',
};
const KIND_LABEL = {
  cafe: 'คาเฟ่', food: 'ร้านอาหาร', stay: 'ที่พัก', view: 'จุดชมวิว', beach: 'ชายหาด',
  waterfall: 'น้ำตก', market: 'ตลาด', temple: 'วัด', museum: 'พิพิธภัณฑ์', park: 'สวน/อุทยาน', sight: 'ที่เที่ยว',
};

export const kindIcon = (k) => KIND_ICON[k] || 'ti-map-pin';
export const kindLabel = (k) => KIND_LABEL[k] || 'สถานที่';

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
export const fmtTime = (min) => {
  const m = Math.round(min);
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
export const fmtDur = (sec) => {
  const m = Math.max(1, Math.round(sec / 60));
  return m < 60 ? `${m} นาที` : `${Math.floor(m / 60)} ชม. ${m % 60 ? (m % 60) + ' นาที' : ''}`.trim();
};

function sunTimes(date, lat, lon) {
  const t = window.SunCalc.getTimes(date, lat, lon);
  const local = (d) => {
    // minutes since local Thai midnight (UTC+7)
    const utc = d.getUTCHours() * 60 + d.getUTCMinutes();
    return (utc + 7 * 60) % (24 * 60);
  };
  return { sunrise: local(t.sunrise), sunset: local(t.sunset) };
}

// How a leg is travelled, given its routed mode and the traveller's choice.
function legVehicle(leg, transport, isLong) {
  if (isLong) return transport === 'self' ? 'car' : 'van';
  if (leg.mode === 'walk') return 'walk';
  return transport === 'grab' ? 'grab' : transport === 'self' ? 'car' : 'songthaew';
}

export const VEHICLE = {
  walk: { label: 'เดินเท้า', icon: 'ti-walk' },
  car: { label: 'ขับรถ', icon: 'ti-car' },
  grab: { label: 'Grab', icon: 'ti-car' },
  songthaew: { label: 'สองแถว/วิน', icon: 'ti-bus' },
  van: { label: 'รถตู้', icon: 'ti-bus' },
};

function legCost(vehicle, meters) {
  const km = meters / 1000;
  if (vehicle === 'walk') return 0;
  if (vehicle === 'grab') return Math.round((40 + km * 9) / 10) * 10;
  if (vehicle === 'songthaew') return Math.round((20 + km * 4) / 10) * 10;
  if (vehicle === 'van') return Math.round((70 + km * 0.9) / 10) * 10;
  return Math.round((km * 3.5) / 10) * 10; // fuel
}

const MODE = { train: { label: 'รถไฟ', icon: 'ti-train' }, van: { label: 'รถตู้', icon: 'ti-bus' }, bus: { label: 'รถบัส', icon: 'ti-bus' } };
const TRANSFER = { label: 'สองแถว/แท็กซี่', icon: 'ti-car' };
// data/schedules.json may name the mode in Thai (as on the check sheet); the code uses English
const MODE_KEY = { รถไฟ: 'train', 'รถตู้/มินิบัส': 'van', รถตู้: 'van', รถบัส: 'bus', รถทัวร์: 'bus' };

// Confirmed public-transport departures (data/schedules.json) running on this date, as
// minutes after midnight. A row with `last` repeats every `every` minutes; without
// `every` it only says "some time between depart and last" (flex).
function departures(rows, date) {
  const g = new Date(date).getDay();
  const weekend = g === 0 || g === 6;
  const out = [];
  for (const raw of rows || []) {
    const r = MODE_KEY[raw.mode] ? { ...raw, mode: MODE_KEY[raw.mode] } : raw;
    if (!MODE[r.mode]) continue; // a mode the site cannot show
    if ((r.days === 'weekday' && weekend) || (r.days === 'weekend' && !weekend)) continue;
    const dep = toMin(r.depart);
    const dur = r.arrive ? (toMin(r.arrive) - dep + 1440) % 1440 : null;
    if (r.last && r.every) for (let t = dep; t <= toMin(r.last); t += r.every) out.push({ dep: t, dur, row: r });
    else out.push({ dep, dur, row: r, until: r.last ? toMin(r.last) : null });
  }
  return out.sort((a, b) => a.dep - b.dep);
}

// With `before`: the latest run whose departure plus lead(run) (its ride time) is at or
// before `want`, i.e. that gets there in time. Otherwise the first run leaving at or after
// `want`. Runs with a fixed time win over flex ones.
function pickRun(runs, want, before, lead = () => 0) {
  const fixed = runs.filter((r) => r.until == null);
  return pickFrom(fixed, want, before, lead) || pickFrom(runs.filter((r) => r.until != null), want, before, lead);
}

function pickFrom(runs, want, before, lead) {
  const goal = (r) => (before ? want - lead(r) : want);
  const at = (r) => (r.until != null ? Math.min(Math.max(goal(r), r.dep), r.until) : r.dep);
  const ok = runs.map((r) => ({ ...r, dep: at(r) })).filter((r) => (before ? r.dep <= goal(r) : r.dep >= want));
  if (!ok.length) return null;
  return before ? ok.reduce((a, b) => (b.dep > a.dep ? b : a)) : ok.reduce((a, b) => (b.dep < a.dep ? b : a));
}

export function buildTrip(dest, opts) {
  // transfer: the road legs between a far-away train station and the destination
  // chosen: keep these places (re-planning the same trip); drive: the self-drive plan from
  // js/drive.js ({ depart, out, back }, each cut into timed pieces at the rest stops)
  const { transport, date, schedule, transfer, drive } = opts;
  const chosen = {};
  for (const s of dest.slots) chosen[s.id] = opts.chosen?.[s.id] ?? pick(s.options);
  const day1 = new Date(date);
  const day2 = new Date(day1.getTime() + 86400000);
  const sun1 = sunTimes(day1, dest.center[1], dest.center[0]);
  const sun2 = sunTimes(day2, dest.center[1], dest.center[0]);

  const items = [];
  const getLeg = (a, b) => dest.legs[`${a}>${b}`];
  // run: a timetabled departure, which sets the long leg's duration and its label;
  // tag: label/icon for a leg that is not timetabled (the ride to or from a station)
  const pushLeg = (from, to, leg, start, isLong, reverse, run, tag) => {
    if (!leg) return start;
    const vehicle = legVehicle(leg, transport, isLong);
    const slow = isLong && transport !== 'self' ? 1.3 : vehicle === 'walk' ? 1 : 1.15;
    const sec = run?.dur != null ? run.dur * 60 : leg.exact ? leg.sec : leg.sec * slow + (isLong && transport !== 'self' ? 20 * 60 : 0);
    const geom = reverse ? [...leg.geom].reverse() : leg.geom;
    const mode = (run && MODE[run.row.mode]) || tag;
    items.push({ type: 'leg', from, to, vehicle, sec, m: leg.m, cost: legCost(vehicle, leg.m),
      geom, start, end: start + sec / 60, isLong, label: mode?.label, icon: mode?.icon });
    return start + sec / 60;
  };
  const longLeg = dest.legs['ORIGIN>ARRIVE'];
  // a planned drive: its pieces with a rest stop between each two
  const pushDrive = (plan, from, to, start, day) => {
    let t = start;
    plan.segments.forEach((seg, i) => {
      const last = i === plan.segments.length - 1;
      t = pushLeg(i ? `REST${day}.${i}` : from, last ? to : `REST${day}.${i + 1}`, seg, t, true, false);
      if (last) return;
      const stop = plan.stops[i];
      items.push({ type: 'rest', day, time: t, name: `แวะพัก ${stop.name}`, sub: `พัก ${REST_MIN} นาที`, rest: stop });
      t += REST_MIN;
    });
    return t;
  };
  const pub = transport !== 'self';
  const outRuns = pub ? departures(schedule?.out, date) : [];
  const backRuns = pub ? departures(schedule?.back, date) : [];
  const WAIT = 'รอทีมงานยืนยันเวลารถ เวลาในแผนนี้เป็นการประมาณ';
  const runSub = (r, verb) => `${MODE[r.row.mode].label} ${r.row.operator} · ${verb} ${r.row.board}`
    + (r.until != null ? ` (ไม่มีรอบแน่นอน มีรถระหว่าง ${r.row.depart}–${r.row.last})` : '');

  // A train to a station far from the destination needs a songthaew/taxi ride (plus a wait).
  const station = (run) => (run?.row.mode === 'train' && transfer ? transfer : null);
  const rideMin = transfer ? (transfer.toTown.sec * 1.15) / 60 + 10 : 0;

  // Day 1: leave Bangkok at 07:00, or on the latest confirmed run that gets us to the
  // first stop in time (30 minutes to spare), counting the ride from the station
  let clock = toMin('07:00');
  let day = 1;
  const firstAt = /:/.test(dest.slots[0].time) ? toMin(dest.slots[0].time) : toMin('10:30');
  const estimate = (longLeg.sec * 1.3) / 60 + 20;
  const lead = (r) => (r.dur ?? estimate) + (station(r) ? rideMin : 0);
  // none in time: the one that gets there first
  const soonest = outRuns.length ? outRuns.reduce((a, b) => (b.dep + lead(b) < a.dep + lead(a) ? b : a)) : null;
  const outRun = pickRun(outRuns, firstAt - 30, true, lead) || soonest;
  if (outRun) clock = outRun.dep;
  if (!pub && drive) clock = drive.depart;
  items.push({ type: 'start', day, time: clock, name: 'ออกเดินทางจากกรุงเทพฯ',
    sub: !pub ? 'ขับรถออกจากบ้าน' : outRun ? runSub(outRun, 'ขึ้นที่') : `ขึ้นรถตู้ที่${dest.terminal}`,
    warn: pub && !outRun ? WAIT : null });
  const outVia = station(outRun);
  clock = !pub && drive ? pushDrive(drive.out, 'ORIGIN', 'ARRIVE', clock, 1)
    : pushLeg('ORIGIN', 'ARRIVE', outVia ? outVia.fromBangkok : longLeg, clock, true, false, outRun);
  if (outVia) {
    const km = (outVia.toTown.m / 1000).toFixed(1);
    items.push({ type: 'arrive', day, time: clock, name: `ถึง${outVia.station}`, sub: `ต่อสองแถว/แท็กซี่ไป${dest.name} ~${km} กม.` });
    clock = pushLeg('STATION', 'ARRIVE', outVia.toTown, clock + 10, false, false, null, TRANSFER);
  }
  items.push({ type: 'arrive', day, time: clock, name: `ถึง${dest.name}`,
    sub: outRun && !outVia ? `ลงที่ ${outRun.row.alight}` : dest.province });

  let prev = 'ARRIVE';
  const visit = (slot, poiId) => {
    const poi = dest.pois[poiId];
    let at;
    if (slot.time === 'sunset') at = (slot.day === 1 ? sun1 : sun2).sunset - 30;
    else if (slot.time === 'sunrise') at = (slot.day === 1 ? sun1 : sun2).sunrise - 10;
    else at = toMin(slot.time);
    const legEnd = pushLeg(prev, poiId, getLeg(prev, poiId), Math.max(clock, at - 30), false, false);
    const time = Math.max(at, legEnd);
    items.push({ type: 'stop', day: slot.day, time, slot, poi, sun: slot.time });
    clock = time + (slot.id === 'hotel' ? 45 : 60);
    prev = poiId;
  };

  for (const slot of dest.slots) {
    if (slot.day === 2 && day === 1) {
      // back to the hotel for the night
      const hotel = chosen.hotel;
      if (prev !== hotel) pushLeg(prev, hotel, getLeg(prev, hotel), clock, false, false);
      items.push({ type: 'night', day: 1, time: Math.max(clock + 20, toMin('20:30')), name: 'พักผ่อนที่ที่พัก', poi: dest.pois[hotel] });
      day = 2;
      prev = hotel;
      clock = sun2.sunrise - 50;
    }
    visit(slot, chosen[slot.id]);
  }

  // head home: not before 14:00, or with a timetable, on the first run from 13:30 that we can
  // reach (10 minutes to buy a ticket, plus the ride to a far-away station)
  if (!backRuns.length) clock = Math.max(clock, toMin('14:00'));
  const backLeg = getLeg(prev, 'ARRIVE');
  clock = pushLeg(prev, 'ARRIVE', backLeg, clock, false, false);
  const firstBack = pickRun(backRuns, Math.max(clock + 10, toMin('13:30')), false);
  const backRun = station(firstBack) ? pickRun(backRuns, Math.max(clock + rideMin + 10, toMin('13:30')), false) : firstBack;
  const backVia = station(backRun);
  if (backVia) clock = pushLeg('ARRIVE', 'STATION', backVia.fromTown, clock + 10, false, false, null, TRANSFER);
  if (backRun) clock = backRun.dep;
  items.push({ type: 'depart', day: 2, time: clock,
    name: !pub ? 'ขับรถกลับกรุงเทพฯ' : backRun ? `ขึ้น${MODE[backRun.row.mode].label}กลับกรุงเทพฯ` : `ขึ้นรถตู้กลับ${dest.terminal.replace('สถานีขนส่ง', 'ขนส่ง')}`,
    sub: backRun ? `${runSub(backRun, 'ที่')} · ถึง ${backRun.row.alight}` : dest.name,
    warn: pub && !backRun ? (backRuns.length ? 'ไม่มีรอบกลับที่ยืนยันแล้วหลังเวลานี้ ต้องเช็กรอบรถกับทีมงาน' : WAIT) : null });
  clock = !pub && drive ? pushDrive(drive.back, 'ARRIVE', 'ORIGIN', clock, 2)
    : pushLeg('ARRIVE', 'ORIGIN', backVia ? backVia.fromBangkok : longLeg, clock, true, true, backRun);
  items.push({ type: 'end', day: 2, time: clock, name: 'ถึงกรุงเทพฯ จบทริป', sub: 'กลับบ้านพร้อมแบตเต็ม' });

  const travelCost = items.filter((i) => i.type === 'leg').reduce((s, l) => s + l.cost, 0);
  return { dest, transport, date, items, chosen, sun1, sun2, travelCost, hotel: dest.pois[chosen.hotel] };
}
