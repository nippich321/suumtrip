// Booking-style calendar for the travel date: two months side by side (one on a
// phone), Monday first, past days disabled, the box price under each day, and the
// return day (2 days 1 night) highlighted with the chosen day.

const DOW = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];
const MAX_MONTHS_AHEAD = 6;

// The month shown first, kept across re-renders of the screen so picking a day in
// the second month does not jump the view.
let viewStart = null;

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const monthKey = (d) => d.getFullYear() * 12 + d.getMonth();
const fmtPrice = (n) => Number(n).toLocaleString('th-TH');

/**
 * Render the calendar into el.
 * value, min: 'YYYY-MM-DD'. priceFor(iso) -> number shown under each day.
 * onChange(iso) is called when a day is picked; the calendar updates itself.
 */
export function mountDatePicker(el, { value, min, priceFor, onChange }) {
  const minDate = parse(min);
  const chosen = parse(value);
  const first = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  const last = new Date(minDate.getFullYear(), minDate.getMonth() + MAX_MONTHS_AHEAD, 1);
  const twoUp = () => el.clientWidth >= 480;
  // keep the remembered view if it still shows the chosen day, else start at its month
  if (!viewStart || monthKey(chosen) < monthKey(viewStart) || monthKey(chosen) > monthKey(viewStart) + 1) {
    viewStart = new Date(chosen.getFullYear(), chosen.getMonth(), 1);
  }
  if (monthKey(viewStart) < monthKey(first)) viewStart = first;


  function month(start) {
    const back = iso(addDays(parse(value), 1));
    const title = start.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
    const lead = (start.getDay() + 6) % 7; // Monday first
    const days = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
    let cells = '<span class="dp-cell"></span>'.repeat(lead);
    for (let d = 1; d <= days; d++) {
      const date = new Date(start.getFullYear(), start.getMonth(), d);
      const key = iso(date);
      const off = date < minDate;
      const cls = key === value ? ' on' : key === back ? ' back' : '';
      const label = date.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      cells += off
        ? `<span class="dp-cell dp-day off" aria-disabled="true">${d}</span>`
        : `<button type="button" class="dp-cell dp-day${cls}" data-day="${key}" aria-pressed="${key === value}"
             aria-label="${label} ราคา ${fmtPrice(priceFor(key))} บาท"><b>${d}</b><small>${fmtPrice(priceFor(key))}</small></button>`;
    }
    return `<div class="dp-month"><div class="dp-title">${title}</div>
      <div class="dp-grid">${DOW.map((w) => `<span class="dp-dow">${w}</span>`).join('')}${cells}</div></div>`;
  }

  function render() {
    const n = twoUp() ? 2 : 1;
    const shown = [0, 1].slice(0, n).map((i) => new Date(viewStart.getFullYear(), viewStart.getMonth() + i, 1));
    const canBack = monthKey(viewStart) > monthKey(first);
    const canNext = monthKey(viewStart) + n - 1 < monthKey(last);
    el.innerHTML = `
      <div class="dp">
        <div class="dp-nav">
          <button type="button" class="dp-arrow" data-move="-1" aria-label="เดือนก่อน" ${canBack ? '' : 'disabled'}><i class="ti ti-chevron-left"></i></button>
          <button type="button" class="dp-arrow" data-move="1" aria-label="เดือนถัดไป" ${canNext ? '' : 'disabled'}><i class="ti ti-chevron-right"></i></button>
        </div>
        <div class="dp-months">${shown.map(month).join('')}</div>
        <p class="dp-note"><span class="dp-key on"></span> วันไป <span class="dp-key back"></span> วันกลับ · ตัวเลขใต้วันที่คือราคากล่อง (บาท / 2 คน)</p>
      </div>`;
    el.querySelectorAll('[data-move]').forEach((b) => (b.onclick = () => {
      viewStart = new Date(viewStart.getFullYear(), viewStart.getMonth() + Number(b.dataset.move), 1);
      render();
    }));
    el.querySelectorAll('[data-day]').forEach((b) => (b.onclick = () => {
      value = b.dataset.day;
      render();
      onChange(value);
    }));
  }

  render();
}
