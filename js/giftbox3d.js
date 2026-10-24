// The mystery box in 3D (assets/3d/gifts/giftbox.glb, modelled in Blender by
// tools/build_giftbox.py in the site's colours), drawn with
// three.js over the flat SVG box, which stays as the stand-in until the model has loaded.
// It follows the SVG's state classes, so js/app.js keeps driving it the same way:
// .cube = idle (floats and turns), .cube.shake = shaking, .cube.open = the lid pops off.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const MODEL = 'assets/3d/gifts/giftbox.glb';
let cached = null; // one download for every box on the site

const easeOutBack = (x) => 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2;
const clamp01 = (x) => Math.min(1, Math.max(0, x));

export function mountGiftBox(holder) {
  const svg = holder.querySelector('.cube');
  const canvas = document.createElement('canvas');
  canvas.className = 'gift3d';
  canvas.setAttribute('aria-hidden', 'true');
  holder.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xf3d9c8, 2.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.position.set(3, 6, 4);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  camera.position.set(2.3, 2.1, 3.1);
  camera.lookAt(0, 0.45, 0);

  // a soft shadow under the box
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 32),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.07, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  scene.add(shadow);

  const box = new THREE.Group(); // floats, turns and shakes
  scene.add(box);
  let lid = null;
  let lidBase = null;
  let openAt = null;
  let alive = true;

  (cached ||= new GLTFLoader().loadAsync(MODEL)).then((gltf) => {
    if (!alive) return;
    const model = gltf.scene.clone(true);
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    const k = 1 / Math.max(size.x, size.y, size.z);
    model.scale.setScalar(k);
    model.position.set(-(bounds.min.x + bounds.max.x) / 2 * k, -bounds.min.y * k, -(bounds.min.z + bounds.max.z) / 2 * k);
    box.add(model);
    model.traverse((o) => { if (o.name === 'lid') lid = o; });
    lidBase = lid ? lid.position.clone() : null;
    holder.classList.add('gl'); // hide the flat stand-in
  }).catch((err) => { console.warn('3D gift box', err); canvas.remove(); alive = false; });

  let lastW = 0;
  let lastH = 0;
  function resize() {
    // the canvas is drawn larger than the box (room for the lid), so size it by itself
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h || (w === lastW && h === lastH)) return;
    lastW = w;
    lastH = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  const t0 = performance.now();
  function frame(now) {
    if (!alive) return;
    if (!holder.isConnected) { alive = false; renderer.dispose(); return; }
    resize();
    const t = (now - t0) / 1000;
    const shaking = svg?.classList.contains('shake');
    const open = svg?.classList.contains('open');
    if (open && openAt === null) openAt = t;
    if (!open) openAt = null;

    // idle: float and turn a little; shaking: rattle on the spot; open: settle
    const settle = openAt === null ? 1 : Math.max(0, 1 - (t - openAt) * 2);
    box.position.y = shaking ? Math.abs(Math.sin(t * 28)) * 0.05 : Math.sin(t * 2.4) * 0.05 * settle;
    box.rotation.y = 0.35 + (shaking ? 0 : Math.sin(t * 0.8) * 0.3 * settle);
    box.rotation.z = shaking ? Math.sin(t * 57) * 0.09 : 0;
    box.rotation.x = shaking ? Math.cos(t * 43) * 0.05 : 0;
    shadow.scale.setScalar(1 - box.position.y * 1.5);

    // the lid pops up, tips over and floats beside the box
    if (lid && lidBase) {
      const p = openAt === null ? 0 : easeOutBack(clamp01((t - openAt) / 0.7));
      const bob = openAt === null ? 0 : Math.sin((t - openAt) * 2.2) * 0.03 * clamp01((t - openAt) - 0.7);
      lid.position.set(lidBase.x - 0.42 * p, lidBase.y + 0.38 * p + bob, lidBase.z + 0.1 * p);
      lid.rotation.set(0.1 * p, 0.3 * p, 0.6 * p);
    }
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return { destroy() { alive = false; renderer.dispose(); canvas.remove(); } };
}
