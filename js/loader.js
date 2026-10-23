// Full-screen loading scene: the road scrolls by, the traveller's car drives in
// and idles, and when the page is ready it revs and speeds off to the right.
// Art was generated with Higgsfield; the car is a 12-frame sprite sheet made by
// tools/animate_car.py. Timings live in css/style.css (ld-* keyframes).

const BACKGROUNDS = { nat: 'img/loader/bg-nat.webp', old: 'img/loader/bg-old.webp', sea: 'img/loader/bg-sea.webp' };
const SUBTITLE = {
  self: 'น้องหมาพร้อม กระเป๋าพร้อม ออกเดินทาง!',
  pub: 'นั่งรถชิล ๆ เดี๋ยวก็ถึง',
  grab: 'เรียกรถแล้ว กำลังไปรับ',
  walk: 'กำลังแพ็กกล่องสุ่มทริปให้',
};
const ARRIVED_MS = 3000; // road alone, then the car drives in (see .loader.ready .ld-car)
const HOLD_MS = 1000;    // the car idles a moment before it may leave
const LEAVE_MS = 900;    // rev and speed off
const FADE_MS = 450;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Shows the scene over the whole page. Call finish() when the page is ready;
// the car leaves only after it has arrived and idled.
export function showLoader(kind, title, { scene = 'nat' } = {}) {
  const el = document.createElement('div');
  el.className = 'loader';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-label', title);
  const bg = BACKGROUNDS[scene] || BACKGROUNDS.nat;
  el.innerHTML = `
    <div class="ld-track" aria-hidden="true"><img src="${bg}" alt=""><img src="${bg}" alt=""></div>
    <div class="ld-caption"><p class="ld-text">${esc(title)}<span class="ld-dots"><i>.</i><i>.</i><i>.</i></span></p>
      <p class="ld-sub">${SUBTITLE[kind] || SUBTITLE.self}</p></div>
    <div class="ld-car" aria-hidden="true"><img src="img/loader/car-dog.webp" alt=""></div>`;
  document.body.appendChild(el);
  document.documentElement.classList.add('ld-lock');

  let readyAt = null;
  const img = el.querySelector('.ld-track img');
  const ready = new Promise((res) => {
    const go = () => {
      if (readyAt !== null) return;
      readyAt = performance.now();
      el.classList.add('ready');
      res();
    };
    if (img.complete && img.naturalWidth) go();
    img.addEventListener('load', go);
    img.addEventListener('error', go);
    setTimeout(go, 3000); // never wait forever for the picture
  });

  let finishing = null;
  return {
    finish() {
      finishing ??= ready
        .then(() => wait(Math.max(0, readyAt + ARRIVED_MS + HOLD_MS - performance.now())))
        .then(() => { el.classList.add('go'); return wait(LEAVE_MS); })
        .then(() => { el.classList.add('done'); return wait(FADE_MS); })
        .then(() => {
          el.remove();
          if (!document.querySelector('.loader')) document.documentElement.classList.remove('ld-lock');
        });
      return finishing;
    },
  };
}
