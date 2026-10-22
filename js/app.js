import { CONFIG, CATEGORIES, TRANSPORT } from './config.js';
import { promptPayPayload } from './promptpay.js';
import { buildTrip, fmtTime, fmtDur, kindIcon, kindLabel, VEHICLE } from './itinerary.js';
import { createTripMap } from './tripmap.js';

const app = document.getElementById('app');
const S = { cat: 'nat', transport: 'pub', date: nextWeekday(), veto: null, dest: null, trip: null, paid: false };
let DATA = null;
let tripMap = null;

const fmt = (n) => Number(n).toLocaleString('th-TH');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function nextWeekday() {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  while (d.getDay() === 0 || d.getDay() >= 5) d.setDate(d.getDate() + 1);
  return localIso(d);
}
function localIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const rackFor = (d) => Math.round(d.rack * (isWeekend(S.date) ? 1.3 : 1) / 10) * 10;
const isWeekend = (iso) => { const g = new Date(iso).getDay(); return g === 0 || g === 5 || g === 6; };
const price = () => (isWeekend(S.date) ? CONFIG.prices.weekend : CONFIG.prices.weekday);
const thaiDate = (iso) => new Date(iso).toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' });

function steps(n) {
  return `<div class="steps" aria-label="ขั้นที่ ${n} จาก 5">${[1, 2, 3, 4, 5].map((i) => `<span class="${i <= n ? 'on' : ''}"></span>`).join('')}</div>`;
}

function candidates() {
  const list = DATA.destinations.filter((d) => d.cat === S.cat);
  const live = list.filter((d) => d.id !== S.veto);
  const goldOdds = 10;
  const normals = live.filter((d) => !d.gold);
  return list.map((d) => ({
    ...d,
    vetoed: d.id === S.veto,
    odds: d.id === S.veto ? 0 : d.gold ? goldOdds : Math.round((100 - (live.some((x) => x.gold) ? goldOdds : 0)) / normals.length),
  }));
}

function drawDestination() {
  const c = candidates().filter((d) => !d.vetoed);
  let r = Math.random() * c.reduce((s, d) => s + d.odds, 0);
  for (const d of c) { if ((r -= d.odds) <= 0) return d; }
  return c[c.length - 1];
}

// ---------- screens ----------
const screens = {
  home() {
    app.innerHTML = `
    <section class="screen hero">
      ${boxHtml('hero-box')}
      <h1>เลือกแค่แนว<br><span>ที่เหลือกล่องจัดให้</span></h1>
      <p>กล่องสุ่มทริป 2 วัน 1 คืน ตั้งแต่ออกจากบ้าน ที่พัก ร้านอาหาร ที่เที่ยว จนกลับถึงบ้าน ในราคาที่ถูกกว่าจองเอง</p>
      <a class="btn btn-primary" href="#choose"><i class="ti ti-gift"></i> สุ่มทริปของฉัน · เริ่ม ${fmt(CONFIG.prices.weekday)} บาท</a>
      <div class="how">
        <div><i class="ti ti-adjustments-horizontal"></i>เลือกแนว<br>วัน และการเดินทาง</div>
        <div><i class="ti ti-gift"></i>จ่ายแล้ว<br>เปิดกล่องลุ้น</div>
        <div><i class="ti ti-map-2"></i>ได้แผนครบ<br>ทุกชั่วโมง</div>
      </div>
      <div class="proof" style="text-align:left">
        <b>ทำไมถูกกว่า?</b> ที่พักปล่อยห้องว่างให้เราในราคาลับ เพราะห้องว่างคืนนี้ขายพรุ่งนี้ไม่ได้ คุณได้ราคาดี ที่พักได้ลูกค้า โดยไม่ต้องลดราคาหน้าเว็บ
        <ul class="small muted">
          <li>โมเดลเดียวกับ Waynabox (สเปน) ที่พาคนเที่ยวมาแล้วกว่า 200,000 คน</li>
          <li>JAL และ JR West ในญี่ปุ่นใช้การสุ่มปลายทางดึงคนไปเที่ยวเมืองรอง</li>
        </ul>
      </div>
    </section>`;
  },

  choose() {
    const catHtml = Object.entries(CATEGORIES).map(([k, v]) => `
      <button class="opt ${S.cat === k ? 'on' : ''}" data-cat="${k}"><i class="ti ${v.icon}"></i><span class="t">${v.label}</span><span class="d">${v.blurb}</span></button>`).join('');
    const trHtml = Object.entries(TRANSPORT).map(([k, v]) => `
      <button class="opt opt-row ${S.transport === k ? 'on' : ''}" data-tr="${k}"><i class="ti ${v.icon}"></i><span><span class="t">${v.label}</span><span class="d">${v.note}</span></span></button>`).join('');
    app.innerHTML = `
    <section class="screen">
      ${steps(1)}
      <h2>อยากได้ทริปแนวไหน?</h2>
      <p class="muted">ไม่ต้องเลือกจังหวัด เดี๋ยวกล่องเลือกให้</p>
      <div class="label">หมวด</div>
      <div class="opts three">${catHtml}</div>
      <div class="label">วันเดินทาง (2 วัน 1 คืน)</div>
      <label class="field"><input type="date" id="date" value="${S.date}" min="${localIso(new Date())}"></label>
      <div class="opt opt-row" style="box-shadow:none;background:transparent;padding:0">
        <span class="small muted">${isWeekend(S.date) ? 'วันหยุด (ศ–อา)' : 'วันธรรมดา (จ–พฤ) ราคาถูกกว่า'}</span><span class="price">${fmt(price())} บาท / 2 คน</span>
      </div>
      <div class="label">เดินทางยังไง</div>
      <div class="opts">${trHtml}</div>
      <p class="fine">ออกเดินทางจากกรุงเทพฯ · ใช้เวลาเดินทางไม่เกิน 4 ชม.</p>
      <button class="btn btn-primary btn-block" id="next">ดูปลายทางที่อาจได้</button>
    </section>`;
    app.querySelectorAll('[data-cat]').forEach((b) => (b.onclick = () => { S.cat = b.dataset.cat; S.veto = null; screens.choose(); }));
    app.querySelectorAll('[data-tr]').forEach((b) => (b.onclick = () => { S.transport = b.dataset.tr; screens.choose(); }));
    app.querySelector('#date').onchange = (e) => { if (e.target.value) { S.date = e.target.value; screens.choose(); } };
    app.querySelector('#next').onclick = () => go('cands');
  },

  cands() {
    const list = candidates();
    app.innerHTML = `
    <section class="screen">
      ${steps(2)}
      <h2>กล่อง${CATEGORIES[S.cat].label}นี้ อาจได้ไป…</h2>
      <p class="muted">เปิดโอกาสออกให้เห็นทุกที่ ตัดที่ที่ไม่อยากไปทิ้งได้ฟรี 1 ที่</p>
      ${list.map((d) => `
        <div class="cand ${d.gold ? 'gold' : ''} ${d.vetoed ? 'vetoed' : ''}">
          <div class="ic"><i class="ti ${d.gold ? 'ti-crown' : CATEGORIES[d.cat].icon}"></i></div>
          <div><div class="nm">${esc(d.name)}${d.gold ? '<span class="tag-gold">ทองคำ</span>' : ''}</div>
            <div class="pv">${esc(d.province)}${d.gold ? ' · ที่พักระดับพรีเมียม' : ''}</div></div>
          <div class="odds">${d.odds}%<small>โอกาสออก</small></div>
          ${d.gold ? '' : `<button class="veto" data-veto="${d.id}">${d.vetoed ? 'เอาคืน' : 'ตัดทิ้ง'}</button>`}
        </div>`).join('')}
      <div class="summary">
        <div><span>${CATEGORIES[S.cat].label} · ${thaiDate(S.date)} · ${TRANSPORT[S.transport].label}</span></div>
        <div><span>กล่องสุ่มทริป 2 วัน 1 คืน (2 คน)</span><b>${fmt(price())} บาท</b></div>
      </div>
      <button class="btn btn-primary btn-block" id="buy" style="margin-top:16px">ซื้อกล่องนี้ ${fmt(price())} บาท</button>
      <p class="fine">ราคารวมที่พัก 1 คืน และแผนเที่ยวครบทุกช่วง ไม่รวมค่าเดินทางและค่าอาหาร (มีประมาณการให้ในแผน)</p>
    </section>`;
    app.querySelectorAll('[data-veto]').forEach((b) => (b.onclick = () => { S.veto = S.veto === b.dataset.veto ? null : b.dataset.veto; screens.cands(); }));
    app.querySelector('#buy').onclick = () => go('pay');
  },

  pay() {
    const payload = promptPayPayload(CONFIG.promptPayId, price());
    const qr = window.qrcode(0, 'M');
    qr.addData(payload);
    qr.make();
    app.innerHTML = `
    <section class="screen">
      ${steps(3)}
      <div class="paybox">
        <span class="pp">PromptPay</span>
        <div class="qr">${qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true })}</div>
        <p class="amount">${fmt(price())} บาท</p>
        <p class="small muted">สแกนจ่ายด้วยแอปธนาคารใดก็ได้</p>
        <div class="summary">
          <div><span>กล่อง${CATEGORIES[S.cat].label}</span><span>${thaiDate(S.date)}</span></div>
          <div><span>การเดินทาง</span><span>${TRANSPORT[S.transport].label}</span></div>
          ${S.veto ? `<div><span>ตัดทิ้ง</span><span>${esc(DATA.destinations.find((d) => d.id === S.veto).name)}</span></div>` : ''}
        </div>
      </div>
      <button class="btn btn-primary btn-block" id="paid" style="margin-top:16px">ชำระแล้ว ไปเปิดกล่อง</button>
      <p class="fine">เวอร์ชันสาธิต: QR นี้สร้างตามมาตรฐานพร้อมเพย์จริง แต่ยังไม่ได้ตั้งเลขบัญชีรับเงิน กดปุ่มด้านบนเพื่อไปต่อได้เลย</p>
    </section>`;
    app.querySelector('#paid').onclick = () => { S.paid = true; S.dest = null; S.trip = null; go('open'); };
  },

  open() {
    if (!S.paid) return go('choose');
    app.innerHTML = `
    <section class="screen open-stage">
      ${steps(4)}
      <h2>แตะกล่องเพื่อเปิด</h2>
      <p class="muted">ข้างในคือทริปทั้งทริปของคุณ</p>
      <div style="position:relative">${boxHtml('the-box')}<div id="fx"></div></div>
      <div class="roulette" id="roulette">&nbsp;</div>
      <div id="reveal"></div>
    </section>`;
    const cube = app.querySelector('#the-box .cube');
    app.querySelector('#the-box').onclick = () => {
      if (cube.classList.contains('shake') || cube.classList.contains('open')) return;
      cube.classList.add('shake');
      const names = candidates().filter((d) => !d.vetoed).map((d) => d.name);
      const rl = app.querySelector('#roulette');
      let i = 0;
      const iv = setInterval(() => { rl.textContent = names[i++ % names.length]; }, 120);
      setTimeout(() => {
        clearInterval(iv);
        S.dest = drawDestination();
        S.trip = buildTrip(S.dest, { transport: S.transport, date: S.date });
        cube.classList.remove('shake');
        cube.classList.add('open');
        rl.textContent = '';
        confetti(app.querySelector('#fx'), S.dest.gold);
        showReveal();
      }, 2300);
    };
    if (S.trip) { cube.classList.add('open'); showReveal(); }
  },

  trip() {
    if (!S.trip) return go('choose');
    const t = S.trip;
    app.innerHTML = `
    <section class="screen wide">
      <div class="trip">
        <div class="mapwrap">
          <div id="map"></div>
          <div class="mode-chip" id="modechip"><i class="ti ti-map-2"></i> ${esc(t.dest.name)} · ${esc(t.dest.province)}</div>
          <div class="map-hud">
            <div class="hud-card" id="hud"><span class="muted">กดเล่นเพื่อดูทริปทั้งเส้นทาง</span><b>${esc(t.dest.name)} 2 วัน 1 คืน</b></div>
            <button class="hud-btn" id="playbtn" aria-label="เล่นทริป"><i class="ti ti-player-play"></i></button>
          </div>
        </div>
        <div class="timeline">
          <div class="tl-head"><div><h3 style="margin:0">ทริปของคุณ</h3><span class="small muted">${thaiDate(t.date)} · ${TRANSPORT[t.transport].label}</span></div>
            <a class="btn btn-ghost" href="#choose" style="padding:8px 14px;font-size:14px"><i class="ti ti-refresh"></i> สุ่มใหม่</a></div>
          ${timelineHtml(t)}
          <div class="summary">
            <div><span>ที่พัก</span><b>${esc(t.hotel.name)}</b></div>
            <div><span>ค่าเดินทางโดยประมาณ (ต่อคน)</span><b>~${fmt(t.travelCost)} บาท</b></div>
            <div><span>พระอาทิตย์ตก (วันแรก)</span><b>${fmtTime(t.sun1.sunset)}</b></div>
          </div>
          <div class="verify"><i class="ti ti-info-circle"></i> สถานที่ทั้งหมดดึงจากข้อมูลจริงของ OpenStreetMap ส่วนเวลาเดินทางคำนวณจากถนนจริง เวลาเปิดร้านและรอบรถยังต้องเช็กก่อนเดินทาง</div>
        </div>
      </div>
    </section>`;
    tripMap?.destroy();
    tripMap = createTripMap(app.querySelector('#map'), t, { onStep: highlight });
    const btn = app.querySelector('#playbtn');
    btn.onclick = () => {
      if (tripMap.isPlaying()) { tripMap.pause(); setPlayIcon(false); }
      else { const c = tripMap.current(); tripMap.play(c >= 0 && c < t.items.length - 1 ? c : 0); setPlayIcon(true); }
    };
    app.querySelectorAll('.stop').forEach((row) => (row.onclick = () => { tripMap.focus(Number(row.dataset.i)); setPlayIcon(false); }));
  },

  partner() { renderPartner(); },
  gift() { renderGift(); },
};

function setPlayIcon(on) {
  const b = document.getElementById('playbtn');
  if (b) b.innerHTML = `<i class="ti ${on ? 'ti-player-pause' : 'ti-player-play'}"></i>`;
}

function highlight(i, playing) {
  if (!playing) setPlayIcon(false);
  const t = S.trip;
  document.querySelectorAll('.stop').forEach((r) => r.classList.toggle('active', Number(r.dataset.i) === i));
  const row = document.querySelector(`.stop[data-i="${i}"]`);
  if (row && playing) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  const it = t.items[i];
  const hud = document.getElementById('hud');
  if (!hud || !it) return;
  if (it.type === 'leg') {
    const v = VEHICLE[it.vehicle];
    hud.innerHTML = `<span class="muted"><i class="ti ${v.icon}"></i> ${v.label} · ${fmtDur(it.sec)}</span><b>${it.isLong ? (it.to === 'ORIGIN' ? 'กลับกรุงเทพฯ' : `กรุงเทพฯ → ${esc(t.dest.name)}`) : 'กำลังไปจุดถัดไป'}</b>`;
  } else if (it.type === 'stop') {
    hud.innerHTML = `<span class="muted">${fmtTime(it.time)} · ${esc(it.slot.label)}</span><b>${esc(it.poi.name)}</b>`;
  } else {
    hud.innerHTML = `<span class="muted">${fmtTime(it.time)}</span><b>${esc(it.name)}</b>`;
  }
}

function timelineHtml(t) {
  let html = '';
  let day = 0;
  t.items.forEach((it, i) => {
    const d = it.day ?? day;
    if (it.type !== 'leg' && d !== day) { day = d; html += `<div class="day-h">วันที่ ${day} · ${thaiDate(new Date(new Date(t.date).getTime() + (day - 1) * 86400000).toISOString())}</div>`; }
    if (it.type === 'leg') {
      const v = VEHICLE[it.vehicle];
      const km = it.m >= 1000 ? `${(it.m / 1000).toFixed(1)} กม.` : `${it.m} ม.`;
      html += `<div class="stop leg" data-i="${i}"><div class="tm"></div><div class="dot"><i class="ti ${v.icon}"></i></div>
        <div class="nm">${v.label} ${fmtDur(it.sec)} · ${km}${it.cost ? ` · ~${fmt(it.cost)}฿` : ''}</div></div>`;
    } else if (it.type === 'stop') {
      const sun = it.sun === 'sunset' ? ` · <i class="ti ti-sunset-2"></i> ตก ${fmtTime(t.sun1.sunset)}` : it.sun === 'sunrise' ? ` · <i class="ti ti-sunrise"></i> ขึ้น ${fmtTime(t.sun2.sunrise)}` : '';
      html += `<div class="stop" data-i="${i}"><div class="tm">${fmtTime(it.time)}</div><div class="dot"><i class="ti ${kindIcon(it.poi.kind)}"></i></div>
        <div><div class="what">${esc(it.slot.label)} · ${kindLabel(it.poi.kind)}${sun}</div><div class="nm">${esc(it.poi.name)}</div>${it.poi.nameEn ? `<div class="sub">${esc(it.poi.nameEn)}</div>` : ''}</div></div>`;
    } else {
      const icon = { start: 'ti-home', arrive: 'ti-flag', night: 'ti-moon', depart: 'ti-bus', end: 'ti-home-heart' }[it.type];
      html += `<div class="stop" data-i="${i}"><div class="tm">${fmtTime(it.time)}</div><div class="dot"><i class="ti ${icon}"></i></div>
        <div><div class="nm">${esc(it.name)}</div>${it.sub ? `<div class="sub">${esc(it.sub)}</div>` : ''}</div></div>`;
    }
  });
  return html;
}

function showReveal() {
  const d = S.dest;
  const save = rackFor(d) - price();
  app.querySelector('#reveal').innerHTML = `
    <div class="reveal ${d.gold ? 'gold' : ''}">
      <div class="kicker">${d.gold ? '<i class="ti ti-crown"></i> ได้ปลายทางทองคำ!' : 'คุณได้ไป…'}</div>
      <h2>${esc(d.name)}</h2>
      <div class="muted">${esc(d.province)} · พักที่ ${esc(S.trip.hotel.name)}</div>
      <div class="price-cmp"><span>ราคาปกติประมาณ <s>${fmt(rackFor(d))}</s></span><b>คุณจ่าย ${fmt(price())}</b>${save > 0 ? `<span class="save">คุ้มขึ้น ${fmt(save)} บาท</span>` : ''}</div>
      <a class="btn btn-primary btn-block" href="#trip" style="margin-top:16px"><i class="ti ti-map-2"></i> ดูแผนเที่ยวทั้งทริป</a>
    </div>`;
}

function boxHtml(id) {
  return `<div class="box3d" id="${id}" role="button" aria-label="กล่องสุ่มทริป">
  <svg class="cube" viewBox="0 0 200 210" aria-hidden="true">
    <ellipse cx="100" cy="192" rx="72" ry="14" fill="#000" opacity=".08"/>
    <g class="rays" stroke="#ffb020" stroke-width="5" stroke-linecap="round">
      <line x1="100" y1="70" x2="100" y2="10"/><line x1="100" y1="70" x2="45" y2="25"/><line x1="100" y1="70" x2="155" y2="25"/>
      <line x1="100" y1="70" x2="20" y2="60"/><line x1="100" y1="70" x2="180" y2="60"/>
    </g>
    <polygon points="30,95 100,130 100,190 30,155" fill="#d94a2b"/>
    <polygon points="100,130 170,95 170,155 100,190" fill="#ff6b4a"/>
    <polygon points="61.5,110.75 68.5,114.25 68.5,174.25 61.5,170.75" fill="#e09400"/>
    <polygon points="131.5,114.25 138.5,110.75 138.5,170.75 131.5,174.25" fill="#ffb020"/>
    <g class="lid">
      <polygon points="24,90 100,128 100,142 24,104" fill="#e55a3a"/>
      <polygon points="100,128 176,90 176,104 100,142" fill="#ff7b5c"/>
      <polygon points="100,52 176,90 100,128 24,90" fill="#ff8a6e"/>
      <line x1="138" y1="71" x2="62" y2="109" stroke="#ffb020" stroke-width="10"/>
      <line x1="62" y1="71" x2="138" y2="109" stroke="#ffc547" stroke-width="10"/>
      <ellipse cx="86" cy="80" rx="15" ry="9" fill="#ffb020" transform="rotate(-25 86 80)"/>
      <ellipse cx="114" cy="80" rx="15" ry="9" fill="#ffb020" transform="rotate(25 114 80)"/>
      <circle cx="100" cy="86" r="6" fill="#e09400"/>
    </g>
  </svg></div>`;
}

function confetti(host, gold) {
  const colors = gold ? ['#ffb020', '#ffd36b', '#ff6b4a', '#fff'] : ['#ff6b4a', '#ffb020', '#10a39a', '#7a5af8'];
  for (let i = 0; i < 46; i++) {
    const s = document.createElement('span');
    s.className = 'burst';
    s.style.background = colors[i % colors.length];
    s.style.setProperty('--x', `${(Math.random() - 0.5) * 420}px`);
    s.style.setProperty('--y', `${-80 - Math.random() * 220}px`);
    s.style.animationDelay = `${Math.random() * 0.15}s`;
    host.appendChild(s);
    setTimeout(() => s.remove(), 1400);
  }
}

// ---------- partner (hotel) ----------
const PKEY = 'suumtrip.rooms';
function loadRooms() {
  try { const r = JSON.parse(localStorage.getItem(PKEY)); if (Array.isArray(r)) return r; } catch { /* ignore */ }
  return [
    { date: '2026-11-03', room: 'Deluxe วิวสวน', public: 2200, secret: 800, status: 'sold' },
    { date: '2026-11-04', room: 'Deluxe วิวสวน', public: 2200, secret: 800, status: 'sold' },
    { date: '2026-11-10', room: 'Family', public: 3200, secret: 1200, status: 'wait' },
  ];
}
function saveRooms(r) { try { localStorage.setItem(PKEY, JSON.stringify(r)); } catch { /* ignore */ } }

function renderPartner() {
  const rooms = loadRooms();
  const sold = rooms.filter((r) => r.status === 'sold');
  app.innerHTML = `
  <section class="screen">
    <h2>ปล่อยห้องว่างแบบลับ</h2>
    <p class="muted">ห้องที่ยังว่าง ขายให้ลูกค้ากล่องสุ่มในราคาลับ ราคาหน้าเว็บของคุณไม่เปลี่ยน ไม่มีค่าสมัคร จ่ายเฉพาะเมื่อขายได้</p>
    <div class="row2" style="margin-bottom:16px">
      <div class="stat"><b>${sold.length}</b><span>คืนที่ขายได้เดือนนี้</span></div>
      <div class="stat"><b>${fmt(sold.reduce((s, r) => s + r.secret, 0))}฿</b><span>รายได้จากห้องที่จะว่าง</span></div>
    </div>
    <form class="panel" id="roomform" novalidate>
      <h3>เพิ่มห้องว่าง</h3>
      <label class="field"><span>วันที่ว่าง</span><input type="date" name="date" required></label>
      <label class="field"><span>ประเภทห้อง</span><input name="room" placeholder="Deluxe วิวภูเขา" required></label>
      <div class="row2">
        <label class="field"><span>ราคาหน้าเว็บ (บาท)</span><input type="number" name="public" min="0" placeholder="2200" required></label>
        <label class="field"><span>ราคาลับขั้นต่ำ (บาท)</span><input type="number" name="secret" min="0" placeholder="800" required></label>
      </div>
      <div class="err" id="formerr" role="alert"></div>
      <button class="btn btn-primary btn-block">ปล่อยห้องนี้</button>
    </form>
    <div class="panel">
      <h3>ห้องของคุณ</h3>
      <table class="list"><thead><tr><th>วันที่</th><th>ห้อง</th><th>ราคาลับ</th><th>สถานะ</th></tr></thead>
      <tbody>${rooms.map((r) => `<tr><td>${new Date(r.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}</td><td>${esc(r.room)}</td><td>${fmt(r.secret)}฿</td>
        <td><span class="pill ${r.status === 'sold' ? '' : 'wait'}">${r.status === 'sold' ? 'ขายแล้ว' : 'รอจับคู่'}</span></td></tr>`).join('')}</tbody></table>
    </div>
  </section>`;
  const form = app.querySelector('#roomform');
  form.oninput = () => { app.querySelector('#formerr').textContent = ''; };
  form.onsubmit = (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    if (!f.date || !f.room || !f.public || !f.secret) { app.querySelector('#formerr').textContent = 'กรอกให้ครบทุกช่องก่อน'; return; }
    if (Number(f.secret) >= Number(f.public)) { app.querySelector('#formerr').textContent = 'ราคาลับควรต่ำกว่าราคาหน้าเว็บ'; return; }
    rooms.unshift({ date: f.date, room: f.room, public: Number(f.public), secret: Number(f.secret), status: 'wait' });
    saveRooms(rooms);
    renderPartner();
  };
}

// ---------- corporate gift ----------
function renderGift() {
  app.innerHTML = `
  <section class="screen">
    <h2>ของขวัญปีใหม่ที่พนักงานอยากได้จริง</h2>
    <p class="muted">แทนกระเช้า ให้บัตรกล่องสุ่มทริป ผู้รับเลือกแนวและวันเองได้ภายใน 6 เดือน</p>
    <form class="panel" id="giftform" novalidate>
      <label class="field"><span>ชื่อบริษัท</span><input name="company" placeholder="บริษัท ตัวอย่าง จำกัด" required></label>
      <div class="row2">
        <label class="field"><span>จำนวนบัตร</span><input type="number" name="qty" min="1" value="20" required></label>
        <label class="field"><span>ประเภทบัตร</span><select name="type"><option value="${CONFIG.prices.weekday}">วันธรรมดา</option><option value="${CONFIG.prices.weekend}">ทุกวัน</option></select></label>
      </div>
      <div class="err" id="gifterr" role="alert"></div>
      <div class="summary" id="quote"></div>
      <button class="btn btn-primary btn-block" style="margin-top:12px">ขอใบเสนอราคา</button>
    </form>
    <div id="giftdone"></div>
  </section>`;
  const form = app.querySelector('#giftform');
  const calc = () => {
    const f = Object.fromEntries(new FormData(form));
    const qty = Math.max(0, Math.floor(Number(f.qty) || 0));
    const unit = Number(f.type);
    const disc = qty >= 50 ? 0.12 : qty >= 20 ? 0.08 : 0;
    const total = Math.round(qty * unit * (1 - disc));
    app.querySelector('#quote').innerHTML = `<div><span>${fmt(qty)} ใบ × ${fmt(unit)} บาท</span><span>${fmt(qty * unit)} บาท</span></div>
      ${disc ? `<div><span>ส่วนลดองค์กร ${disc * 100}%</span><span>−${fmt(qty * unit - total)} บาท</span></div>` : ''}
      <div><b>รวม</b><b>${fmt(total)} บาท</b></div>`;
    app.querySelector('#gifterr').textContent = '';
    return { qty, total, company: f.company };
  };
  form.oninput = calc;
  calc();
  form.onsubmit = (e) => {
    e.preventDefault();
    const q = calc();
    if (!q.company.trim()) { app.querySelector('#gifterr').textContent = 'ใส่ชื่อบริษัทก่อน'; return; }
    if (q.qty < 1) { app.querySelector('#gifterr').textContent = 'จำนวนบัตรต้องมากกว่า 0'; return; }
    app.querySelector('#giftdone').innerHTML = `<div class="panel"><h3><i class="ti ti-circle-check" style="color:var(--teal)"></i> ได้รับคำขอแล้ว</h3>
      <p class="muted">ใบเสนอราคา ${fmt(q.qty)} ใบ รวม ${fmt(q.total)} บาท สำหรับ ${esc(q.company)} (เวอร์ชันสาธิต ยังไม่ได้ส่งอีเมลจริง)</p></div>`;
  };
}

// ---------- router ----------
function go(name) { location.hash = name; }
function route() {
  const name = location.hash.slice(1) || 'home';
  if (name !== 'trip') { tripMap?.destroy(); tripMap = null; }
  (screens[name] || screens.home)();
  window.scrollTo(0, 0);
}

async function init() {
  app.innerHTML = '<p class="muted" style="text-align:center;padding:60px">กำลังโหลด…</p>';
  try {
    DATA = await (await fetch('data/destinations.json')).json();
  } catch (e) {
    app.innerHTML = '<p style="text-align:center;padding:60px">โหลดข้อมูลไม่สำเร็จ ลองรีเฟรชอีกครั้ง</p>';
    return;
  }
  const cats = new Set(DATA.destinations.map((d) => d.cat));
  if (!cats.has(S.cat)) S.cat = [...cats][0];
  window.addEventListener('hashchange', route);
  route();
}
init();
