// Turns one destination's data into a concrete 2-day trip: one place per
// slot, real clock times, and the travel legs between every stop.

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

export function buildTrip(dest, opts) {
  const { transport, date } = opts;
  const chosen = {};
  for (const s of dest.slots) chosen[s.id] = pick(s.options);
  const day1 = new Date(date);
  const day2 = new Date(day1.getTime() + 86400000);
  const sun1 = sunTimes(day1, dest.center[1], dest.center[0]);
  const sun2 = sunTimes(day2, dest.center[1], dest.center[0]);

  const items = [];
  const getLeg = (a, b) => dest.legs[`${a}>${b}`];
  const pushLeg = (from, to, leg, start, isLong, reverse) => {
    if (!leg) return start;
    const vehicle = legVehicle(leg, transport, isLong);
    const slow = isLong && transport !== 'self' ? 1.3 : vehicle === 'walk' ? 1 : 1.15;
    const sec = leg.sec * slow + (isLong && transport !== 'self' ? 20 * 60 : 0);
    const geom = reverse ? [...leg.geom].reverse() : leg.geom;
    items.push({ type: 'leg', from, to, vehicle, sec, m: leg.m, cost: legCost(vehicle, leg.m),
      geom, start, end: start + sec / 60, isLong });
    return start + sec / 60;
  };

  // Day 1: leave Bangkok at 07:00
  let clock = toMin('07:00');
  let day = 1;
  items.push({ type: 'start', day, time: clock, name: 'ออกเดินทางจากกรุงเทพฯ',
    sub: transport === 'self' ? 'ขับรถออกจากบ้าน' : `ขึ้นรถตู้ที่${dest.terminal}` });
  clock = pushLeg('ORIGIN', 'ARRIVE', dest.legs['ORIGIN>ARRIVE'], clock, true, false);
  items.push({ type: 'arrive', day, time: clock, name: `ถึง${dest.name}`, sub: dest.province });

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

  // head home
  clock = Math.max(clock, toMin('14:00'));
  const backLeg = getLeg(prev, 'ARRIVE');
  clock = pushLeg(prev, 'ARRIVE', backLeg, clock, false, false);
  items.push({ type: 'depart', day: 2, time: clock, name: transport === 'self' ? 'ขับรถกลับกรุงเทพฯ' : `ขึ้นรถตู้กลับ${dest.terminal.replace('สถานีขนส่ง', 'ขนส่ง')}`, sub: dest.name });
  clock = pushLeg('ARRIVE', 'ORIGIN', dest.legs['ORIGIN>ARRIVE'], clock, true, true);
  items.push({ type: 'end', day: 2, time: clock, name: 'ถึงกรุงเทพฯ จบทริป', sub: 'กลับบ้านพร้อมแบตเต็ม' });

  const travelCost = items.filter((i) => i.type === 'leg').reduce((s, l) => s + l.cost, 0);
  return { dest, transport, date, items, chosen, sun1, sun2, travelCost, hotel: dest.pois[chosen.hotel] };
}
