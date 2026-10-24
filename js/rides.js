// Public transport on the trip page: every train or van run of the trip's date both
// ways, with where its time comes from, its fare when the source states one, and how to
// buy the ticket (the railway's own booking site, or the van's phone number). Picking a
// run re-plans the same trip around it.
const SRT_BOOKING = 'https://dticket.railway.co.th/';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hhmm = (min) => { const m = Math.round(min); return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const KIND = { train: ['ti-train', 'รถไฟ'], van: ['ti-bus', 'รถตู้'], bus: ['ti-bus', 'รถทัวร์'] };
const DAYS = { weekday: 'จ–ศ', weekend: 'ส–อา' };
const key = (r) => `${r.row.operator}|${r.dep}`;

function fetched(source) {
  const got = /(\d{4})-(\d{2})-(\d{2})/.exec(source || '');
  return got ? new Date(`${got[0]}T12:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : '';
}

function runHtml(r, dir, chosen) {
  const row = r.row;
  const [icon, kind] = KIND[row.mode] || KIND.van;
  const time = r.until != null ? `${row.depart}–${row.last} (ไม่มีรอบแน่นอน)` : `${hhmm(r.dep)} → ${r.dur != null ? hhmm(r.dep + r.dur) : '?'}`;
  const status = row.checked === 'railway'
    ? `<span class="rd-ok"><i class="ti ti-circle-check"></i> ตามตารางการรถไฟฯ ${fetched(row.source)}</span>`
    : `<span class="rd-ok"><i class="ti ti-circle-check"></i> ทีมงานยืนยันแล้ว</span>`;
  const fare = row.fare ? `ค่าโดยสาร ${esc(row.fare)} (ตามหมายเหตุของการรถไฟฯ)` : 'ดูราคาในหน้าจองตั๋ว';
  const buy = row.mode === 'train'
    ? `<a class="rd-buy" href="${SRT_BOOKING}" target="_blank" rel="noopener"><i class="ti ti-ticket"></i> ซื้อตั๋ว</a>`
    : row.phone ? `<a class="rd-buy" href="tel:${row.phone.replace(/-/g, '')}"><i class="ti ti-phone"></i> โทรจอง ${esc(row.phone)}</a>` : '';
  return `
    <li class="rd-run ${chosen ? 'on' : ''} ${r.late ? 'late' : ''}">
      <button class="rd-pick" data-pick="${dir}" data-key="${esc(key(r))}" ${r.late ? 'disabled' : ''} aria-pressed="${chosen}">
        <span class="rd-time">${time}</span>
        <span class="rd-what"><i class="ti ${icon}"></i> ${kind} ${esc(row.operator.replace(/^ขบวน\s*/, 'ขบวน '))}${DAYS[row.days] ? ` <small>(${DAYS[row.days]})</small>` : ''}</span>
        <span class="rd-where">${esc(row.board)} → ${esc(row.alight)}</span>
        <span class="rd-meta">${r.late ? 'ไม่ทัน (เที่ยววันที่สองยังไม่จบ)' : chosen ? 'ทริปนี้ใช้รอบนี้' : 'แตะเพื่อใช้รอบนี้'} · ${fare}</span>
      </button>
      <div class="rd-foot">${status}${buy}</div>
    </li>`;
}

// ctx: { trip, onPick(dir, key) } - onPick should rebuild the trip and call update(trip)
export function mountRides(el, ctx) {
  let trip = ctx.trip;
  function render() {
    const runs = trip.runs;
    const list = (dir) => {
      const all = runs?.[dir] || [];
      if (!all.length) return '<p class="small muted">ยังไม่มีรอบรถที่ยืนยันแล้วสำหรับวันนี้ เวลาในแผนเป็นการประมาณ</p>';
      return `<ul class="rd-list">${all.map((r) => runHtml(r, dir, key(r) === runs[dir === 'out' ? 'outKey' : 'backKey'])).join('')}</ul>`;
    };
    el.innerHTML = `
      <div class="rides">
        <h4><i class="ti ti-train"></i> รถไป-กลับ <small class="muted">เลือกรอบเองได้ แผนจะจัดเวลาใหม่ให้</small></h4>
        <details open><summary>ขาไป · กรุงเทพฯ → ${esc(trip.dest.name)}</summary>${list('out')}</details>
        <details><summary>ขากลับ · ${esc(trip.dest.name)} → กรุงเทพฯ</summary>${list('back')}</details>
        <p class="fine">ตั๋วรถไฟซื้อที่ระบบ D-Ticket ของการรถไฟฯ หรือที่สถานี (บางขบวนไม่เปิดจองออนไลน์) เราไม่ได้ขายตั๋วเองและไม่ได้รับเงินค่าตั๋ว · เวลารถไฟดึงจากระบบตารางเดินรถของการรถไฟฯ ควรเช็กอีกครั้งก่อนเดินทาง</p>
      </div>`;
    el.querySelectorAll('.rd-pick').forEach((b) => (b.onclick = () => ctx.onPick(b.dataset.pick, b.dataset.key)));
  }
  render();
  return { update(t) { trip = t; const open = [...el.querySelectorAll('details')].map((d) => d.open); render(); el.querySelectorAll('details').forEach((d, i) => { d.open = open[i]; }); } };
}
