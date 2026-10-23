// Loading scene: the traveller's car drives past a scrolling background that
// matches the trip category. Art was generated with Higgsfield; the car is a
// 12-frame sprite sheet made by tools/animate_car.py.

const BACKGROUNDS = { nat: 'img/loader/bg-nat.webp', old: 'img/loader/bg-old.webp', sea: 'img/loader/bg-sea.webp' };
const SUBTITLE = {
  self: 'น้องหมาพร้อม กระเป๋าพร้อม ออกเดินทาง!',
  pub: 'นั่งรถชิล ๆ เดี๋ยวก็ถึง',
  grab: 'เรียกรถแล้ว กำลังไปรับ',
  walk: 'กำลังแพ็กกล่องสุ่มทริปให้',
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function loaderHtml(kind, title, { overlay = false, scene = 'nat' } = {}) {
  const bg = BACKGROUNDS[scene] || BACKGROUNDS.nat;
  title = esc(title);
  return `<div class="loader${overlay ? ' over' : ''}" role="status" aria-label="${title}">
    <div class="ld-stage" aria-hidden="true">
      <div class="ld-track"><img src="${bg}" alt=""><img src="${bg}" alt=""></div>
      <div class="ld-car"><img src="img/loader/car-dog.webp" alt=""></div>
    </div>
    <p class="ld-text">${title}<span class="ld-dots"><i>.</i><i>.</i><i>.</i></span></p>
    <p class="ld-sub">${SUBTITLE[kind] || SUBTITLE.self}</p>
  </div>`;
}
