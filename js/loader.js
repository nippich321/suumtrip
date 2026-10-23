// Full-screen loading scene: the road scrolls by, the traveller's car drives in
// and idles, and when the page is ready it revs and speeds off to the right.
// The art is vector (img/loader/*.svg, built by tools/loader_art.py from the
// Higgsfield pictures); sky, sun, road and dashes are drawn in css/style.css.
// The layers scroll at different speeds (clouds slow, scene, road fastest).
// The car is three pictures (body, dog head, wheel) moved separately on the GPU.

const SCENES = {
  nat: { src: 'img/loader/scene-nat.svg', sun: true },
  old: { src: 'img/loader/scene-old.svg', sun: false },
  sea: { src: 'img/loader/scene-sea.svg', sun: true },
};
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
const SUN = '<svg class="ld-sun" viewBox="-64 -64 128 128" aria-hidden="true"><circle r="63" fill="#feecbc"/><circle r="49" fill="#fbe18a"/></svg>';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const track = (cls, src) => `<div class="ld-track ${cls}"><img src="${src}" alt=""><img src="${src}" alt=""></div>`;

// Shows the scene over the whole page. Call finish() when the page is ready;
// the car leaves only after it has arrived and idled.
export function showLoader(kind, title, { scene = 'nat' } = {}) {
  const sc = SCENES[scene] || SCENES.nat;
  const el = document.createElement('div');
  el.className = 'loader';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-label', title);
  el.innerHTML = `
    <div class="ld-world" aria-hidden="true">
      ${sc.sun ? SUN : ''}
      ${track('ld-clouds', 'img/loader/clouds.svg')}
      ${track('ld-scene', sc.src)}
      <div class="ld-road"></div><div class="ld-dashes"></div>
    </div>
    <div class="ld-caption"><p class="ld-text">${esc(title)}<span class="ld-dots"><i>.</i><i>.</i><i>.</i></span></p>
      <p class="ld-sub">${SUBTITLE[kind] || SUBTITLE.self}</p></div>
    <div class="ld-car" aria-hidden="true"><div class="ld-shadow"></div>
      <div class="ld-bounce"><img src="img/loader/car-body.svg" alt=""><img class="ld-head" src="img/loader/car-head.svg" alt=""></div>
      <img class="ld-wheel" src="img/loader/car-wheel.svg" alt=""><img class="ld-wheel ld-wheel2" src="img/loader/car-wheel.svg" alt=""></div>`;
  document.body.appendChild(el);
  document.documentElement.classList.add('ld-lock');

  let readyAt = null;
  const img = el.querySelector('.ld-scene img');
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
