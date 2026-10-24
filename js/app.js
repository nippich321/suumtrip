import { CONFIG, CATEGORIES, TRANSPORT } from './config.js';
import { promptPayPayload } from './promptpay.js';
import { buildTrip, fmtTime, fmtDur, kindIcon, kindLabel, VEHICLE } from './itinerary.js';
import { createTripMap } from './tripmap.js';
import { showLoader } from './loader.js';
import { mountDatePicker } from './datepicker.js';
import { mountDrivePlanner, restIcon } from './drive.js';
import { mountRides } from './rides.js';
import { mountGiftBox } from './giftbox3d.js';

const app = document.getElementById('app');
const S = { cat: 'nat', transport: 'pub', date: nextWeekday(), veto: null, dest: null, trip: null, paid: false, reached: 0,
  // who travels; contact details stay in this page's memory only (nothing is sent yet)
  who: { adults: 2, kids: 0, name: '', phone: '', email: '' } };
let DATA = null;
let SCHED = null; // confirmed bus/van/train times (data/schedules.json)
let RAILS = null; // railway track between stations (data/rails.json), so trains run on rails on the map
let rides = null;
let tripMap = null;
let planner = null;
let ROADSIDE = null; // rest stops along each drive (data/roadside.json), loaded on the first self-drive trip

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
const isWeekend = (iso) => { const g = new Date(iso).getDay(); return g === 0 || g === 5 || g === 6; };
const price = () => (isWeekend(S.date) ? CONFIG.prices.weekend : CONFIG.prices.weekday);
const peopleText = () => `ผู้ใหญ่ ${S.who.adults}${S.who.kids ? ` · เด็ก ${S.who.kids}` : ''}`;
const thaiDate = (iso) => new Date(iso).toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' });

// ---------- booking pages ----------
// One page per step, laid out like a travel booking site: a numbered stepper on top, the
// step itself on the left, and the booking summary with the price and the button to the
// next step on the right (on a phone: a bar fixed at the bottom of the screen).
const WIZ = [
  { id: 'cat', label: 'แนวทริป', cta: 'ต่อไป: เลือกวันเดินทาง' },
  { id: 'date', label: 'วันเดินทาง', cta: 'ต่อไป: วิธีเดินทาง' },
  { id: 'choose', label: 'การเดินทาง', cta: 'ต่อไป: ผู้เดินทาง' },
  { id: 'who', label: 'ผู้เดินทาง', cta: 'ต่อไป: ดูปลายทางที่อาจได้' },
  { id: 'cands', label: 'ปลายทาง', cta: 'ไปชำระเงิน' },
  { id: 'pay', label: 'ชำระเงิน', cta: 'ชำระแล้ว ไปเปิดกล่อง' },
];
const stepOf = (id) => WIZ.findIndex((w) => w.id === id);
const returnIso = (iso) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + 1); return localIso(d); };

function stepperHtml(n) {
  const items = WIZ.map((w, i) => {
    const st = i === n ? 'now' : i <= S.reached ? 'done' : 'todo';
    const inner = `<span class="bk-dot">${st === 'done' ? '<i class="ti ti-check"></i>' : i + 1}</span><span class="bk-lbl">${w.label}</span>`;
    return `<li class="${st}">${st === 'done' ? `<a href="#${w.id}">${inner}</a>` : `<span ${st === 'now' ? 'aria-current="step"' : ''}>${inner}</span>`}</li>`;
  }).join('');
  return `<ol class="bk-steps" aria-label="ขั้นตอนการจอง">${items}</ol>
    <div class="bk-mstep"><span>ขั้นที่ ${n + 1} จาก ${WIZ.length}</span><b>${WIZ[n].label}</b></div>
    <div class="bk-progress" aria-hidden="true"><span style="width:${((n + 1) / WIZ.length) * 100}%"></span></div>`;
}

// the button to the next step; on the payment step it confirms the (demo) payment
function ctaHtml(n) {
  const w = WIZ[n];
  if (w.id === 'pay') return `<button class="btn btn-primary btn-block bk-cta" data-act="paid"><i class="ti ti-gift"></i> ${w.cta}</button>`;
  const label = w.id === 'cands' ? `${w.cta} · ${fmt(price())} บาท` : w.cta;
  return `<a class="btn btn-primary btn-block bk-cta" href="#${WIZ[n + 1].id}">${label} <i class="ti ti-arrow-right"></i></a>`;
}

function summaryHtml(n) {
  const vetoed = S.veto && DATA.destinations.find((d) => d.id === S.veto);
  const rows = [
    ['cat', CATEGORIES[S.cat].icon, 'แนวทริป', CATEGORIES[S.cat].label],
    ['date', 'ti-calendar-event', 'วันเดินทาง', `${thaiDate(S.date)} – ${thaiDate(returnIso(S.date))}`],
    ['choose', TRANSPORT[S.transport].icon, 'การเดินทาง', TRANSPORT[S.transport].label],
    ['who', 'ti-users', 'ผู้เดินทาง', peopleText()],
  ];
  if (vetoed) rows.push(['cands', 'ti-ban', 'ไม่เอา', vetoed.name]);
  const people = S.who.adults + S.who.kids;
  return `
    <div class="bk-sum">
      <div class="bk-sum-head"><span class="bk-sum-ic"><i class="ti ti-gift"></i></span>
        <div><b>กล่องสุ่มทริป${CATEGORIES[S.cat].label}</b><small>2 วัน 1 คืน · รวมที่พัก</small></div></div>
      <dl class="bk-rows">${rows.map(([id, icon, k, v]) => `
        <div class="bk-row"><dt><i class="ti ${icon}"></i> ${k}</dt>
          <dd>${esc(v)}${stepOf(id) < n ? ` <a href="#${id}" class="bk-edit">แก้ไข</a>` : ''}</dd></div>`).join('')}
      </dl>
      <div class="bk-price"><span>ราคากล่อง (2 คน)<small>${isWeekend(S.date) ? 'ศ–อา' : 'จ–พฤ'}</small></span><b>${fmt(price())} บาท</b></div>
      ${people !== 2 ? `<p class="bk-note"><i class="ti ti-info-circle"></i> ${people} คน ทีมงานแจ้งราคาให้</p>` : ''}
      ${ctaHtml(n)}
      <p class="fine">ไม่รวมค่าเดินทางและอาหาร</p>
    </div>`;
}

function barHtml(n) {
  return `<div class="bk-bar-price"><small>ราคากล่อง (2 คน)</small><b>${fmt(price())} บาท</b></div>${ctaHtml(n)}`;
}

// still: the same page drawn again (no entry animation)
function wizard(id, { title, sub, body }, still = false) {
  const n = stepOf(id);
  S.reached = Math.max(S.reached, n);
  const prev = WIZ[n - 1];
  return `
    <section class="screen wide bk ${still ? 'still' : ''}">
      <nav class="bk-nav" id="bknav">${stepperHtml(n)}</nav>
      <div class="bk-grid">
        <div class="bk-main">
          <a class="bk-back" href="#${prev ? prev.id : 'home'}"><i class="ti ti-arrow-left"></i> ${prev ? prev.label : 'หน้าแรก'}</a>
          <h2>${title}</h2>
          ${sub ? `<p class="bk-sub">${sub}</p>` : ''}
          ${body}
        </div>
        <aside class="bk-side" id="bksum">${summaryHtml(n)}</aside>
      </div>
      <div class="bk-bar" id="bkbar">${barHtml(n)}</div>
    </section>`;
}

// a pick on a page changes the summary, the stepper and the bar, never the whole page
function refreshSide(id) {
  const n = stepOf(id);
  app.querySelector('#bknav').innerHTML = stepperHtml(n);
  app.querySelector('#bksum').innerHTML = summaryHtml(n);
  app.querySelector('#bkbar').innerHTML = barHtml(n);
}

// pick one card of a group in place: the chosen one is .on and aria-checked
function pickIn(attr, value) {
  app.querySelectorAll(`[${attr}]`).forEach((b) => {
    const on = b.getAttribute(attr) === value;
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', on);
  });
}

const CHECK_MARK = '<span class="choice-check" aria-hidden="true"><i class="ti ti-check"></i></span>';

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

// How a public-transport trip gets there: by train when the timetable has trains
function rideTag(id) {
  const runs = SCHED?.confirmed?.[id];
  const train = runs && [...runs.out, ...runs.back].some((r) => r.mode === 'train');
  return train ? ' · <span class="ride train"><i class="ti ti-train"></i> รถไฟ</span>' : ' · <span class="ride"><i class="ti ti-bus"></i> รถตู้</span>';
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
      <p>ไม่ต้องหาที่เที่ยว ไม่ต้องเถียงกันว่าไปไหน กล่องสุ่มทริป 2 วัน 1 คืนจัดให้ครบ ตั้งแต่ขึ้นรถไฟ ที่พัก ร้านอาหาร ที่เที่ยว จนกลับถึงบ้าน</p>
      <a class="btn btn-primary" href="#cat"><i class="ti ti-gift"></i> สุ่มทริปของฉัน · เริ่ม ${fmt(CONFIG.prices.weekday)} บาท</a>
      <div class="how">
        <div><i class="ti ti-adjustments-horizontal"></i>เลือกแนว<br>วัน และการเดินทาง</div>
        <div><i class="ti ti-gift"></i>จ่ายแล้ว<br>เปิดกล่องลุ้น</div>
        <div><i class="ti ti-map-2"></i>ได้แผนครบ<br>ทุกชั่วโมง</div>
      </div>
      <div class="proof" style="text-align:left">
        <b>ต่างจากจองโรงแรมเองยังไง?</b> เว็บจองโรงแรมขายห้องพัก แต่คุณยังต้องคิดเองว่าจะไปไหน เที่ยวอะไร นั่งรถรอบไหน กล่องของเราขายทั้งทริป: เลือกปลายทางให้ จัดแผนรายชั่วโมงพร้อมรอบรถไฟจริง พาไปร้านท้องถิ่นในเมืองรอง ส่วนที่พักพาร์ตเนอร์ได้ลูกค้าจากห้องที่ยังว่าง
        <ul class="small muted">
          <li>Waynabox ในสเปนขายทริปสุ่มปลายทางแบบนี้มาหลายปี</li>
          <li>ในญี่ปุ่น JAL ("どこかにマイル") และ JR East ("どこかにビューーン!") ใช้การสุ่มปลายทางพาคนไปเที่ยวเมืองรอง</li>
        </ul>
      </div>
    </section>`;
    mountGiftBox(app.querySelector('#hero-box'));
  },

  cat() {
    const count = (k) => DATA.destinations.filter((d) => d.cat === k).length;
    const cards = Object.entries(CATEGORIES).map(([k, v]) => `
      <button class="choice choice-pic ${S.cat === k ? 'on' : ''}" role="radio" aria-checked="${S.cat === k}" data-cat="${k}">
        <span class="choice-img" style="background-image:url('img/loader/scene-${k}.svg')"></span>
        <span class="choice-body"><b><i class="ti ${v.icon}"></i> ${v.label}</b><small>${v.blurb}</small>
          <small class="choice-meta">${count(k)} ปลายทาง</small></span>
        ${CHECK_MARK}
      </button>`).join('');
    app.innerHTML = wizard('cat', {
      title: 'อยากได้ทริปแนวไหน?',
      sub: 'ปลายทางเป็นความลับจนเปิดกล่อง',
      body: `<div class="choices three" role="radiogroup" aria-label="แนวทริป">${cards}</div>`,
    });
    app.querySelectorAll('[data-cat]').forEach((b) => (b.onclick = () => { S.cat = b.dataset.cat; S.veto = null; pickIn('data-cat', S.cat); refreshSide('cat'); }));
  },

  date() {
    const range = () => `<span><small>ไป</small><b>${thaiDate(S.date)}</b></span><i class="ti ti-arrow-right"></i>
      <span><small>กลับ</small><b>${thaiDate(returnIso(S.date))}</b></span><span class="bk-range-tag">2 วัน 1 คืน</span>`;
    app.innerHTML = wizard('date', {
      title: 'ไปวันไหนดี?',
      sub: '2 วัน 1 คืน · จ–พฤ ราคาถูกกว่า',
      body: `<div id="date"></div><div class="bk-range" id="range">${range()}</div>`,
    });
    mountDatePicker(app.querySelector('#date'), {
      value: S.date, min: localIso(new Date()),
      priceFor: (iso) => (isWeekend(iso) ? CONFIG.prices.weekend : CONFIG.prices.weekday),
      onChange: (iso) => { S.date = iso; app.querySelector('#range').innerHTML = range(); refreshSide('date'); },
    });
  },

  choose() {
    const facts = {
      pub: ['รถไฟตามตารางจริง', 'ฝากกระเป๋าที่พักก่อนเที่ยว'],
      self: ['แผนขับรถพร้อมจุดพัก', 'นำทางด้วย Google Maps'],
    };
    const cards = Object.entries(TRANSPORT).map(([k, v]) => `
      <button class="choice choice-row ${S.transport === k ? 'on' : ''}" role="radio" aria-checked="${S.transport === k}" data-tr="${k}">
        <span class="choice-ic"><i class="ti ${v.icon}"></i></span>
        <span class="choice-body"><b>${v.label}</b>
          <ul class="choice-list">${facts[k].map((f) => `<li><i class="ti ti-check"></i> ${f}</li>`).join('')}</ul></span>
        ${CHECK_MARK}
      </button>`).join('');
    app.innerHTML = wizard('choose', {
      title: 'เดินทางแบบไหน?',
      sub: 'ออกจากกรุงเทพฯ ไม่เกิน 4 ชม.',
      body: `<div class="choices two" role="radiogroup" aria-label="วิธีเดินทาง">${cards}</div>`,
    });
    app.querySelectorAll('[data-tr]').forEach((b) => (b.onclick = () => { S.transport = b.dataset.tr; pickIn('data-tr', S.transport); refreshSide('choose'); }));
  },

  who() {
    const W = S.who;
    const counter = (key, label, hint, min) => `
      <div class="pp-row"><span class="pp-lbl"><b>${label}</b>${hint ? `<small>${hint}</small>` : ''}</span>
        <span class="ppl-step" role="group" aria-label="${label}">
          <button type="button" data-step="${key}:-1" aria-label="ลด${label}" ${W[key] <= min ? 'disabled' : ''}><i class="ti ti-minus"></i></button>
          <output id="n-${key}" aria-live="polite">${W[key]}</output>
          <button type="button" data-step="${key}:1" aria-label="เพิ่ม${label}" ${W[key] >= 10 ? 'disabled' : ''}><i class="ti ti-plus"></i></button>
        </span></div>`;
    // the label sits in the box and moves up once something is typed
    const field = (key, label, type, auto, icon) => `
      <label class="in"><i class="ti ${icon}"></i>
        <input name="${key}" type="${type}" autocomplete="${auto}" placeholder=" " value="${esc(W[key])}" aria-required="true" ${type === 'tel' ? 'inputmode="tel"' : ''}>
        <span>${label} *</span></label>
      <small class="hint" id="h-${key}" hidden></small>`;
    app.innerHTML = wizard('who', {
      title: 'ผู้เดินทาง',
      body: `
        <div class="bk-card who2">
          ${counter('adults', 'ผู้ใหญ่', '', 1)}
          ${counter('kids', 'เด็ก', 'ต่ำกว่า 12 ปี', 0)}
        </div>
        <div class="bk-card who2">
          <div class="who2-h"><b>ผู้ติดต่อ</b><span class="tag-dev">ช่วงทดสอบ ข้ามได้</span></div>
          ${field('name', 'ชื่อ-นามสกุล', 'text', 'name', 'ti-user')}
          ${field('phone', 'เบอร์โทร', 'tel', 'tel', 'ti-phone')}
          ${field('email', 'อีเมล', 'email', 'email', 'ti-mail')}
        </div>`,
    });
    app.querySelectorAll('[data-step]').forEach((b) => (b.onclick = () => {
      const [key, d] = b.dataset.step.split(':');
      W[key] = Math.min(10, Math.max(key === 'adults' ? 1 : 0, W[key] + Number(d)));
      app.querySelector(`#n-${key}`).textContent = W[key];
      app.querySelector(`[data-step="${key}:-1"]`).disabled = W[key] <= (key === 'adults' ? 1 : 0);
      app.querySelector(`[data-step="${key}:1"]`).disabled = W[key] >= 10;
      refreshSide('who');
    }));
    // a wrong format shows a short hint; nothing blocks "next" while the site is in testing
    const RULES = {
      name: (v) => (v.trim().length >= 2 ? '' : 'ชื่อสั้นเกินไป'),
      phone: (v) => (/^0\d{8,9}$/.test(v.replace(/[\s-]/g, '')) ? '' : 'เบอร์ 9–10 หลัก ขึ้นต้นด้วย 0'),
      email: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? '' : 'อีเมลไม่ถูกต้อง'),
    };
    app.querySelectorAll('.in input').forEach((inp) => {
      const hint = app.querySelector(`#h-${inp.name}`);
      const test = () => { const msg = inp.value ? RULES[inp.name](inp.value) : ''; hint.textContent = msg; hint.hidden = !msg; inp.setAttribute('aria-invalid', !!msg); };
      inp.oninput = () => { W[inp.name] = inp.value; if (!hint.hidden) test(); };
      inp.onblur = test;
    });
  },

  cands(still = false) {
    const list = candidates();
    const rows = list.map((d) => `
      <div class="cand2 ${d.gold ? 'gold' : ''} ${d.vetoed ? 'vetoed' : ''}">
        <span class="cand2-ic"><i class="ti ${d.gold ? 'ti-crown' : CATEGORIES[d.cat].icon}"></i></span>
        <div class="cand2-body">
          <b>${esc(d.name)}${d.gold ? ' <span class="tag-gold">ทองคำ</span>' : ''}</b>
          <small>${esc(d.province)}${d.gold ? ' · ที่พักระดับพรีเมียม' : ''}${S.transport === 'pub' ? rideTag(d.id) : ''}</small>
          <span class="odds-bar" aria-hidden="true"><span style="width:${d.odds}%"></span></span>
        </div>
        <div class="cand2-odds"><b>${d.odds}%</b><small>โอกาสออก</small></div>
        ${d.gold ? '<span class="cand2-keep">ตัดไม่ได้</span>' : `<button class="cand2-veto" data-veto="${d.id}" aria-pressed="${d.vetoed}">${d.vetoed ? '<i class="ti ti-arrow-back-up"></i> เอาคืน' : '<i class="ti ti-x"></i> ไม่เอา'}</button>`}
      </div>`).join('');
    app.innerHTML = wizard('cands', {
      title: `กล่อง${CATEGORIES[S.cat].label}นี้ อาจได้ไป…`,
      sub: 'ไม่อยากไปที่ไหน ตัดทิ้งได้ 1 ที่',
      body: `<div class="cands2">${rows}</div>`,
    }, still);
    app.querySelectorAll('[data-veto]').forEach((b) => (b.onclick = () => { S.veto = S.veto === b.dataset.veto ? null : b.dataset.veto; screens.cands(true); }));
  },

  pay() {
    const payload = promptPayPayload(CONFIG.promptPayId, price());
    const qr = window.qrcode(0, 'M');
    qr.addData(payload);
    qr.make();
    app.innerHTML = wizard('pay', {
      title: 'ชำระเงิน',
      sub: 'สแกนจ่ายด้วยแอปธนาคาร',
      body: `
        <div class="bk-card pay2">
          <div class="pay2-qr"><span class="pp">PromptPay</span>${qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true })}
            <b class="pay2-amt">${fmt(price())} บาท</b></div>
          <ol class="pay2-steps">
            <li>เปิดแอปธนาคาร</li>
            <li>สแกน QR นี้</li>
            <li>กด "ชำระแล้ว"</li>
          </ol>
        </div>
        <p class="bk-demo"><i class="ti ti-flask"></i> เดโม: QR ยังไม่ผูกบัญชีรับเงิน กด "ชำระแล้ว" ได้เลย</p>`,
    });
  },

  open() {
    if (!S.paid) return go('choose');
    app.innerHTML = `
    <section class="screen open-stage">
      ${steps(4)}
      <h2 id="openh">แตะกล่องเพื่อเปิด</h2>
      <p class="muted" id="opensub">ข้างในคือทริปทั้งทริปของคุณ</p>
      <div style="position:relative">${boxHtml('the-box')}<div id="fx"></div></div>
      <div class="roulette" id="roulette">&nbsp;</div>
      <div id="reveal"></div>
    </section>`;
    const cube = app.querySelector('#the-box .cube');
    mountGiftBox(app.querySelector('#the-box'));
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
        S.trip = buildTrip(S.dest, tripOpts());
        cube.classList.remove('shake');
        cube.classList.add('open');
        rl.textContent = '';
        opened();
        confetti(app.querySelector('#fx'), S.dest.gold);
        showReveal();
      }, 2300);
    };
    // once open, the heading stops asking to tap the box
    const opened = () => { app.querySelector('#openh').textContent = 'เปิดกล่องแล้ว!'; app.querySelector('#opensub').textContent = 'นี่คือทริปของคุณ'; };
    if (S.trip) { cube.classList.add('open'); opened(); showReveal(); }
  },

  trip() {
    if (!S.trip) return go('choose');
    const t = S.trip;
    app.innerHTML = `
    <section class="screen wide trip-screen">
      <div class="trip">
        <div class="mapwrap">
          <div id="map"></div>
          <div class="mode-chip" id="modechip"><i class="ti ti-map-2"></i> ${esc(t.dest.name)} · ${esc(t.dest.province)}</div>
          <div class="map-hud">
            <div class="hud-card"><div id="hud"><span class="muted">กดเล่นเพื่อดูทริปทั้งเส้นทาง</span><b>${esc(t.dest.name)} 2 วัน 1 คืน</b></div>
              <div class="hud-progress" aria-hidden="true"><span id="hudbar"></span></div></div>
            <button class="hud-btn" id="playbtn" aria-label="เล่นทริป"><i class="ti ti-player-play"></i></button>
          </div>
        </div>
        <div class="timeline">
          <div class="tl-head"><div><h3 style="margin:0">ทริปของคุณ</h3><span class="small muted">${thaiDate(t.date)} · ${TRANSPORT[t.transport].label}</span></div>
            <a class="btn btn-ghost" href="#choose" style="padding:8px 14px;font-size:14px"><i class="ti ti-refresh"></i> สุ่มใหม่</a></div>
          <div class="trip-chips" id="chips">${chipsHtml(t)}</div>
          ${t.transport === 'self' ? '<div id="drive"></div>' : '<div id="rides"></div>'}
          <div id="tl">${timelineHtml(t)}</div>
          <div class="verify"><i class="ti ti-info-circle"></i> สถานที่ทั้งหมดดึงจากข้อมูลจริงของ OpenStreetMap ส่วนเวลาเดินทางคำนวณจากถนนจริง เวลาเปิดร้านและรอบรถยังต้องเช็กก่อนเดินทาง</div>
        </div>
      </div>
    </section>`;
    tripMap?.destroy();
    const loader = showLoader(t.transport, `กำลังพาไป${t.dest.name}`, { scene: t.dest.cat });
    tripMap = createTripMap(app.querySelector('#map'), t, { onStep: highlight });
    finishWhenMapReady(loader, tripMap.map);
    const btn = app.querySelector('#playbtn');
    btn.onclick = () => {
      if (tripMap.isPlaying()) { tripMap.pause(); setPlayIcon(false); }
      else {
        // on a phone the map may be scrolled away: show it once, then leave the page alone
        const m = app.querySelector('.mapwrap').getBoundingClientRect();
        if (m.top < 0 || m.bottom > innerHeight) app.querySelector('.mapwrap').scrollIntoView({ block: 'start', behavior: 'smooth' });
        const c = tripMap.current(); tripMap.play(c >= 0 && c < t.items.length - 1 ? c : 0); setPlayIcon(true);
      }
    };
    bindTimeline();
    planner?.destroy();
    planner = null;
    rides = null;
    if (t.transport === 'self') mountPlanner(t);
    else {
      // the customer picks the train/van each way; the same trip is re-planned around it
      rides = mountRides(app.querySelector('#rides'), {
        trip: t,
        onPick: (dir, key) => { S.pick = { ...S.pick, [dir]: key }; S.trip = buildTrip(S.dest, tripOpts({ chosen: S.trip.chosen })); refreshTrip(); },
      });
    }
  },

  partner() { renderPartner(); },
  gift() { renderGift(); },
};

// everything buildTrip needs for the current booking
function tripOpts(extra = {}) {
  return { transport: S.transport, date: S.date, schedule: SCHED?.confirmed?.[S.dest.id], transfer: SCHED?.transfers?.[S.dest.id],
    rails: RAILS, pick: S.pick, ...extra };
}

// the trip was re-planned (another run, drive or rest stop): redraw what depends on it
function refreshTrip() {
  app.querySelector('#chips').innerHTML = chipsHtml(S.trip);
  app.querySelector('#tl').innerHTML = timelineHtml(S.trip);
  bindTimeline();
  tripMap?.setTrip(S.trip);
  planner?.update(S.trip);
  rides?.update(S.trip);
}

function chipsHtml(t) {
  const startLeg = t.items.find((i) => i.type === 'leg' && i.isLong);
  const endLeg = [...t.items].reverse().find((i) => i.type === 'leg' && i.isLong);
  const startTime = startLeg ? fmtTime(startLeg.start) : '—';
  const endTime = endLeg ? fmtTime(endLeg.end) : '—';
  return `<span title="ที่พัก"><i class="ti ti-bed"></i> ${esc(t.hotel.name)}</span>
    <span title="เดินทาง"><i class="ti ti-bus"></i> ${startTime}–${endTime}</span>
    <span title="ค่าเดินทางโดยประมาณ ต่อคน"><i class="ti ti-coin"></i> ~${fmt(t.travelCost)} บาท/คน</span>
    <span title="พระอาทิตย์ตก วันแรก"><i class="ti ti-sunset-2"></i> ตก ${fmtTime(t.sun1.sunset)}</span>`;
}

function bindTimeline() {
  app.querySelectorAll('#tl .stop').forEach((row) => (row.onclick = () => { tripMap.focus(Number(row.dataset.i)); setPlayIcon(false); }));
}

// Self-drive: departure time, route and rest stops re-plan the same trip (same places).
async function mountPlanner(t) {
  if (!ROADSIDE) { try { ROADSIDE = await (await fetch('data/roadside.json')).json(); } catch { ROADSIDE = { destinations: {} }; } }
  const el = app.querySelector('#drive');
  if (!el || S.trip !== t) return; // the customer left the page meanwhile
  planner = mountDrivePlanner(el, {
    trip: t,
    roadside: ROADSIDE.destinations[t.dest.id],
    state: S.driveState,
    onPlan: (drive) => {
      S.trip = buildTrip(S.dest, tripOpts({ chosen: S.trip.chosen, drive }));
      refreshTrip();
    },
  });
  S.driveState = planner.state;
  const fuel = (ROADSIDE.destinations[t.dest.id] || []).filter((p) => p.kind === 'fuel');
  tripMap?.setFuel(fuel, (stop, dir) => planner?.addStop(dir, stop));
}

// Let the loading car leave once the map has drawn (or after 9 s at most).
function finishWhenMapReady(loader, map) {
  let done = false;
  const go = () => { if (!done) { done = true; loader.finish(); } };
  map.once('idle', go);
  setTimeout(go, 9000);
}

// While the trip plays, keep its row in view, but only inside the side timeline (desktop),
// which scrolls on its own; on a phone the timeline is under the map, and scrolling the page
// there would pull the map out of sight.
function followRow(row) {
  const tl = row.closest('.timeline');
  if (!tl || getComputedStyle(tl).overflowY === 'visible' || tl.scrollHeight <= tl.clientHeight + 1) return;
  const r = row.getBoundingClientRect();
  const b = tl.getBoundingClientRect();
  if (r.top < b.top + 60 || r.bottom > b.bottom - 20) tl.scrollTo({ top: tl.scrollTop + r.top - b.top - b.height / 3, behavior: 'smooth' });
}

function setPlayIcon(on) {
  const b = document.getElementById('playbtn');
  if (b) b.innerHTML = `<i class="ti ${on ? 'ti-player-pause' : 'ti-player-play'}"></i>`;
}

function highlight(i, playing) {
  if (!playing) setPlayIcon(false);
  const t = S.trip;
  document.querySelectorAll('.stop').forEach((r) => r.classList.toggle('active', Number(r.dataset.i) === i));
  const row = document.querySelector(`.stop[data-i="${i}"]`);
  if (row && playing) followRow(row);
  const it = t.items[i];
  const hud = document.getElementById('hud');
  if (!hud || !it) return;
  document.getElementById('hudbar').style.width = `${((i + 1) / t.items.length) * 100}%`;
  if (it.type === 'leg') {
    const v = it.label ? { label: it.label, icon: it.icon } : VEHICLE[it.vehicle];
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
      const v = it.label ? { label: it.label, icon: it.icon } : VEHICLE[it.vehicle];
      const km = it.m >= 1000 ? `${(it.m / 1000).toFixed(1)} กม.` : `${it.m} ม.`;
      html += `<div class="stop leg" data-i="${i}"><div class="tm"></div><div class="dot"><i class="ti ${v.icon}"></i></div>
        <div class="nm">${v.label} ${fmtDur(it.sec)} · ${km}${it.cost ? ` · ~${fmt(it.cost)}฿` : ''}</div></div>`;
    } else if (it.type === 'stop') {
      const sun = it.sun === 'sunset' ? ` · <i class="ti ti-sunset-2"></i> ตก ${fmtTime(t.sun1.sunset)}` : it.sun === 'sunrise' ? ` · <i class="ti ti-sunrise"></i> ขึ้น ${fmtTime(t.sun2.sunrise)}` : '';
      html += `<div class="stop" data-i="${i}"><div class="tm">${fmtTime(it.time)}</div><div class="dot"><i class="ti ${kindIcon(it.poi.kind)}"></i></div>
        <div><div class="what">${esc(it.slot.label)} · ${kindLabel(it.poi.kind)}${sun}</div><div class="nm">${esc(it.poi.name)}</div>${it.poi.nameEn ? `<div class="sub">${esc(it.poi.nameEn)}</div>` : ''}</div></div>`;
    } else {
      const icon = { start: 'ti-home', arrive: 'ti-flag', night: 'ti-moon', depart: 'ti-bus', end: 'ti-home-heart', rest: restIcon(it.rest?.kind), bags: 'ti-luggage' }[it.type];
      html += `<div class="stop" data-i="${i}"><div class="tm">${fmtTime(it.time)}</div><div class="dot"><i class="ti ${icon}"></i></div>
        <div><div class="nm">${esc(it.name)}</div>${it.sub ? `<div class="sub">${esc(it.sub)}</div>` : ''}${it.src ? `<div class="src"><i class="ti ti-info-circle"></i> ${esc(it.src)}</div>` : ''}${it.warn ? `<div class="warn"><i class="ti ti-clock-exclamation"></i> ${esc(it.warn)}</div>` : ''}</div></div>`;
    }
  });
  return html;
}

function showReveal() {
  const d = S.dest;
  app.querySelector('#reveal').innerHTML = `
    <div class="reveal ${d.gold ? 'gold' : ''}">
      <div class="kicker">${d.gold ? '<i class="ti ti-crown"></i> ได้ปลายทางทองคำ!' : 'คุณได้ไป…'}</div>
      <h2>${esc(d.name)}</h2>
      <div class="muted">${esc(d.province)} · พักที่ ${esc(S.trip.hotel.name)}</div>
      <div class="price-cmp"><b>คุณจ่าย ${fmt(price())} บาท / 2 คน</b><span>รวมที่พัก 1 คืน และแผนเที่ยวทั้งทริป</span></div>
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
  if (name !== 'trip') { tripMap?.destroy(); tripMap = null; planner?.destroy(); planner = null; rides = null; }
  (screens[name] || screens.home)();
  window.scrollTo(0, 0);
}

// "ชำระแล้ว ไปเปิดกล่อง" sits in the summary card and in the phone's bottom bar
app.addEventListener('click', (e) => {
  if (!e.target.closest('[data-act="paid"]')) return;
  S.paid = true; S.dest = null; S.trip = null; S.driveState = null; S.pick = null;
  go('open');
});

async function init() {
  // the full intro plays once per tab; later reloads just show a short text
  let seen = false;
  try { seen = sessionStorage.getItem('suumtrip.intro') === '1'; sessionStorage.setItem('suumtrip.intro', '1'); } catch { /* ignore */ }
  const intro = seen ? null : showLoader('walk', 'กำลังเตรียมกล่องสุ่มทริป', { scene: 'nat' });
  if (seen) app.innerHTML = '<p class="muted" style="text-align:center;padding:60px">กำลังโหลด…</p>';
  try {
    DATA = await (await fetch('data/destinations.json')).json();
  } catch (e) {
    intro?.finish();
    app.innerHTML = '<p style="text-align:center;padding:60px">โหลดข้อมูลไม่สำเร็จ ลองรีเฟรชอีกครั้ง</p>';
    return;
  }
  // timetables are optional: without them trips show estimated times marked "waiting for a check"
  try { SCHED = await (await fetch('data/schedules.json')).json(); } catch { SCHED = null; }
  try { RAILS = await (await fetch('data/rails.json')).json(); } catch { RAILS = null; }
  const cats = new Set(DATA.destinations.map((d) => d.cat));
  if (!cats.has(S.cat)) S.cat = [...cats][0];
  window.addEventListener('hashchange', route);
  route();
  intro?.finish();
}
init();
