// Low-poly 3D traveler drawn on top of the MapLibre map with three.js: the
// trip's vehicle or two walking people. Models are Kenney's CC0 Car Kit and
// Mini Characters (assets/3d/); simple box models stand in until they load.
// Effects: exhaust smoke while driving, a hop with a burst of smoke when a leg
// starts (go), a settle when it ends (stop), and a pop with a puff of smoke
// whenever the vehicle changes.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const VEHICLES = {
  car: { file: 'assets/3d/cars/sedan.glb', length: 4.2 },
  grab: { file: 'assets/3d/cars/hatchback-sports.glb', length: 4.2 },
  songthaew: { file: 'assets/3d/cars/truck.glb', length: 4.6 },
  van: { file: 'assets/3d/cars/van.glb', length: 4.9 },
};
const WALKERS = ['assets/3d/people/character-female-b.glb', 'assets/3d/people/character-male-a.glb'];
const PERSON_HEIGHT = 2;

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const easeOutCubic = (x) => 1 - (1 - x) ** 3;
const easeInBack = (x) => 2.70158 * x ** 3 - 1.70158 * x ** 2;
const easeOutElastic = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : 2 ** (-10 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1);
const rand = (a, b) => a + Math.random() * (b - a);
const clock = () => performance.now() / 1000;

// ---------- stand-in box models (used until the real models have loaded) ----------
const mat = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true });

function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  return m;
}

function boxWheel(x, z, r = 0.34) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.26, 10), mat(0x2b2b33));
  m.rotation.z = Math.PI / 2;
  m.position.set(x, r, z);
  return m;
}

function boxPerson() {
  const g = new THREE.Group();
  g.add(box(0.22, 0.8, 0.24, 0x3b4a7a, -0.13, 0.4, 0), box(0.22, 0.8, 0.24, 0x3b4a7a, 0.13, 0.4, 0));
  g.add(box(0.6, 0.75, 0.36, 0xff6b4a, 0, 1.18, 0), box(0.46, 0.55, 0.22, 0xffb020, 0, 1.2, -0.28));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 8), mat(0xf2c29b));
  head.position.set(0, 1.78, 0);
  g.add(head);
  return g;
}

function boxCar(color, roof, length = 4) {
  const g = new THREE.Group();
  g.add(box(1.8, 0.6, length, color, 0, 0.62, 0), box(1.6, 0.55, length * 0.52, roof, 0, 1.18, -0.25));
  g.add(boxWheel(-0.85, length * 0.31), boxWheel(0.85, length * 0.31), boxWheel(-0.85, -length * 0.31), boxWheel(0.85, -length * 0.31));
  return g;
}

// ---------- entries: one per vehicle kind ----------
function makeEntry(kind, object, { length, width, wheels = [], wheelR = 0.6, body = null, walkers = [] }) {
  const pivot = new THREE.Group(); // squash, stretch and hop
  pivot.add(object);
  const root = new THREE.Group(); // pop in and out
  root.add(pivot);
  root.visible = false;
  for (const w of wheels) w.userData.baseX = w.rotation.x;
  if (body) body.userData.baseY = body.position.y;
  return {
    kind, root, pivot, length, width, wheels, wheelR, body, walkers, spin: 0,
    exhaust: kind === 'walk' ? null : new THREE.Vector3(width * 0.26, 0.42, -length / 2 - 0.1),
  };
}

function fallbackEntries() {
  return {
    walk: makeEntry('walk', boxPerson(), { length: 0.8, width: 1 }),
    car: makeEntry('vehicle', boxCar(0x10a39a, 0x0b7d76), { length: 4, width: 1.8 }),
    grab: makeEntry('vehicle', boxCar(0x00b14f, 0x00964a), { length: 4, width: 1.8 }),
    songthaew: makeEntry('vehicle', boxCar(0x2e6bd6, 0xe8e8e8, 4.4), { length: 4.4, width: 1.9 }),
    van: makeEntry('vehicle', boxCar(0xf4f4f4, 0x37474f, 5), { length: 5, width: 2 }),
  };
}

function prepare(object) {
  object.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
}

async function loadVehicle(loader, spec) {
  const gltf = await loader.loadAsync(spec.file);
  const model = gltf.scene;
  prepare(model);
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const k = spec.length / size.z;
  model.position.set(-(bounds.min.x + bounds.max.x) / 2, -bounds.min.y, -(bounds.min.z + bounds.max.z) / 2);
  const fit = new THREE.Group();
  fit.add(model);
  fit.scale.setScalar(k);
  const wheels = [];
  let body = null;
  model.traverse((o) => {
    if (/^wheel/.test(o.name)) wheels.push(o);
    if (o.name === 'body') body = o;
  });
  // the wheel's centre height is its radius (the wheels stand on y = 0)
  const wheelR = wheels.length ? (wheels[0].position.y + model.position.y) * k : 0.6;
  return makeEntry('vehicle', fit, { length: spec.length, width: size.x * k, wheels, wheelR, body });
}

async function loadWalkers(loader) {
  const gltfs = await Promise.all(WALKERS.map((f) => loader.loadAsync(f)));
  const group = new THREE.Group();
  const walkers = gltfs.map((gltf, i) => {
    const model = gltf.scene;
    prepare(model);
    const bounds = new THREE.Box3().setFromObject(model);
    const holder = new THREE.Group();
    holder.add(model);
    holder.scale.setScalar(PERSON_HEIGHT / (bounds.max.y - bounds.min.y));
    holder.position.set(i ? 0.62 : -0.62, 0, i ? -0.15 : 0.2); // side by side, one a step ahead
    group.add(holder);
    const mixer = new THREE.AnimationMixer(model);
    const action = (name) => mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations, name));
    const walk = action('walk');
    const idle = action('idle');
    walk.play();
    idle.play();
    walk.time = i * 0.33; // out of step with each other
    idle.time = i * 0.6;
    return { mixer, walk, idle };
  });
  return makeEntry('walk', group, { length: 1.4, width: 2.4, walkers });
}

// ---------- smoke and dust puffs ----------
const PUFF = new THREE.IcosahedronGeometry(0.28, 0);

function createPuffs(parent, count = 72) {
  const items = [];
  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(PUFF, new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, flatShading: true }));
    mesh.visible = false;
    parent.add(mesh);
    items.push({ mesh, vel: new THREE.Vector3(), age: 0, life: 1, s0: 0.5, s1: 1.5, alpha: 0.5, spin: 0 });
  }
  let next = 0;
  return {
    emit(pos, vel, { life = 1, s0 = 0.45, s1 = 1.5, alpha = 0.5, color = 0xf2efe9 } = {}) {
      const p = items[next++ % items.length];
      p.mesh.position.copy(pos);
      p.vel.copy(vel);
      Object.assign(p, { age: 0, life, s0, s1, alpha, spin: rand(-2, 2) });
      p.mesh.material.color.set(color);
      p.mesh.rotation.set(rand(0, 6), rand(0, 6), 0);
      p.mesh.scale.setScalar(s0);
      p.mesh.visible = true;
    },
    // drift: how fast the ground slides backwards under the traveler (local units / s)
    update(dt, drift) {
      let alive = false;
      for (const p of items) {
        if (!p.mesh.visible) continue;
        p.age += dt;
        if (p.age >= p.life) { p.mesh.visible = false; continue; }
        alive = true;
        const k = p.age / p.life;
        p.mesh.position.addScaledVector(p.vel, dt);
        p.mesh.position.z -= drift * dt;
        p.vel.multiplyScalar(Math.max(0, 1 - 2.2 * dt));
        p.vel.y += 0.6 * dt; // smoke rises
        p.mesh.rotation.y += p.spin * dt;
        p.mesh.scale.setScalar(p.s0 + (p.s1 - p.s0) * easeOutCubic(k));
        p.mesh.material.opacity = p.alpha * (1 - k) ** 1.6;
      }
      return alive;
    },
    hide() { for (const p of items) p.mesh.visible = false; },
  };
}

// ---------- the map layer ----------
export function createTravelerLayer(maplibregl) {
  const state = { lngLat: [0, 0], heading: 0, vehicle: 'walk', visible: false, size: 1 };
  const entries = fallbackEntries();
  const world = new THREE.Group();
  for (const e of Object.values(entries)) world.add(e.root);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  world.add(shadow);
  const puffs = createPuffs(world);

  let map, camera, scene, renderer;
  let shown = null;      // entry key on screen
  let leaving = null;    // entry key popping away
  let swapAt = -10;
  let popDelay = 0;
  let hopAt = -10;
  let settleAt = -10;
  let size = null;       // smoothed state.size
  let lastMc = null;
  let lastNow = clock();
  let speed = 0;         // local units per second
  let smokeClock = 0;
  let stepClock = 0;

  const repaint = () => map?.triggerRepaint();
  const sc = (e) => e.root.scale.x;

  function poof() {
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const dir = new THREE.Vector3(Math.cos(a), rand(0.2, 0.9), Math.sin(a));
      puffs.emit(new THREE.Vector3(Math.cos(a) * 0.6, rand(0.4, 1.4), Math.sin(a) * 0.6), dir.multiplyScalar(rand(2, 3.4)),
        { life: rand(0.45, 0.65), s0: 0.9, s1: 2.6, alpha: 0.75, color: 0xffffff });
    }
  }

  function burst(e) {
    if (e.kind === 'walk') {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        puffs.emit(new THREE.Vector3(Math.cos(a) * 0.5, 0.1, Math.sin(a) * 0.5), new THREE.Vector3(Math.cos(a) * 2, 0.3, Math.sin(a) * 2),
          { life: 0.6, s0: 0.5, s1: 1.4, alpha: 0.45, color: 0xe3d3b4 });
      }
      return;
    }
    for (let i = 0; i < 10; i++) {
      puffs.emit(e.exhaust.clone().multiplyScalar(sc(e)), new THREE.Vector3(rand(-1, 1), rand(0.4, 1.4), rand(-2.2, -0.6)),
        { life: rand(0.9, 1.3), s0: 0.6, s1: 2.4, alpha: 0.6, color: 0xeeeae2 });
    }
  }

  function show(key, now) {
    if (shown === key) return;
    if (shown) {
      leaving = shown;
      poof();
    }
    popDelay = shown ? 0.14 : 0;
    shown = key;
    swapAt = now;
  }

  // swap the stand-in for the real model once it has loaded
  function install(key, entry) {
    const old = entries[key];
    world.remove(old.root);
    entry.root.visible = old.root.visible;
    entry.root.scale.copy(old.root.scale);
    entries[key] = entry;
    world.add(entry.root);
    if (leaving === key) leaving = null;
    repaint();
  }
  const loader = new GLTFLoader();
  for (const [key, spec] of Object.entries(VEHICLES)) {
    loadVehicle(loader, spec).then((e) => install(key, e)).catch((err) => console.warn('3D model', spec.file, err));
  }
  loadWalkers(loader).then((e) => install('walk', e)).catch((err) => console.warn('3D walkers', err));

  const layer = {
    id: 'traveler-3d',
    type: 'custom',
    renderingMode: '3d',
    onAdd(m, gl) {
      map = m;
      camera = new THREE.Camera();
      scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xffffff, 0xd8cbb8, 2.2));
      const sun = new THREE.DirectionalLight(0xffffff, 1.7);
      sun.position.set(30, 80, 40);
      scene.add(sun);
      scene.add(world);
      renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false;
    },
    render(gl, matrix) {
      const now = clock();
      const dt = Math.min(0.1, Math.max(0, now - lastNow));
      lastNow = now;
      if (!state.visible || !shown) {
        for (const e of Object.values(entries)) e.root.visible = false;
        puffs.hide();
        shadow.visible = false;
        return;
      }

      size = size === null ? state.size : size + (state.size - size) * Math.min(1, dt * 5);
      const mc = maplibregl.MercatorCoordinate.fromLngLat(state.lngLat, 0);
      // keep the traveler a readable size at any zoom
      const s = mc.meterInMercatorCoordinateUnits() * Math.pow(2, 16.2 - map.getZoom()) * 12 * size;
      if (lastMc && dt > 0) {
        const d = Math.hypot(mc.x - lastMc.x, mc.y - lastMc.y) / s;
        if (d < 12) speed += (Math.min(40, d / dt) - speed) * Math.min(1, dt * 8); // a jump to another place is not speed
      }
      lastMc = mc;

      // pop the old model away and the new one in
      const tSwap = now - swapAt;
      for (const [key, e] of Object.entries(entries)) e.root.visible = key === shown || key === leaving;
      if (leaving) {
        const k = clamp01(tSwap / 0.24);
        entries[leaving].root.scale.setScalar(Math.max(0.001, 1 - easeInBack(k)));
        if (k >= 1) { entries[leaving].root.visible = false; leaving = null; }
      }
      const e = entries[shown];
      e.root.scale.setScalar(Math.max(0.001, easeOutElastic(clamp01((tSwap - popDelay) / 0.65))));

      // hop when a leg starts, wobble when it ends, a little bounce while driving
      let y = 0;
      let squash = 0;
      const tHop = now - hopAt;
      const jump = e.kind === 'walk' ? 0.9 : 1.3;
      if (tHop >= 0 && tHop < 0.12) squash = 0.18 * easeOutCubic(tHop / 0.12);
      else if (tHop >= 0.12 && tHop < 0.5) {
        const p = Math.sin(Math.PI * (tHop - 0.12) / 0.38);
        y = jump * p;
        squash = -0.12 * p;
      } else if (tHop >= 0.5 && tHop < 1) {
        const p = tHop - 0.5;
        squash = 0.2 * Math.exp(-6 * p) * Math.cos(p * 18);
      }
      const tSettle = now - settleAt;
      if (tSettle >= 0 && tSettle < 0.7) squash += 0.14 * Math.exp(-6 * tSettle) * Math.cos(tSettle * 18);
      if (e.kind === 'vehicle' && speed > 0.3) y += 0.05 * Math.abs(Math.sin(now * 14));
      e.pivot.position.y = y;
      e.pivot.scale.set(1 + squash * 0.6, 1 - squash, 1 + squash * 0.6);

      // wheels roll with the speed, the body rocks on its springs
      if (e.wheels.length) {
        e.spin += Math.min(speed / e.wheelR, 30) * dt;
        for (const w of e.wheels) w.rotation.x = w.userData.baseX + e.spin;
      }
      if (e.body) e.body.position.y = e.body.userData.baseY + (speed > 0.3 ? 0.012 * Math.sin(now * 23) : 0);
      for (const key of [shown, leaving]) {
        for (const w of key ? entries[key].walkers : []) {
          const walking = clamp01((speed - 0.15) / 0.6);
          w.walk.setEffectiveWeight(walking);
          w.idle.setEffectiveWeight(1 - walking);
          w.walk.timeScale = 1.5;
          w.mixer.update(dt);
        }
      }

      // exhaust smoke while driving, dust at the walkers' feet
      if (speed > 0.3 && e.exhaust) {
        smokeClock += dt;
        while (smokeClock > 0.06) {
          smokeClock -= 0.06;
          const at = e.exhaust.clone().multiplyScalar(sc(e)).add(new THREE.Vector3(rand(-0.1, 0.1), y, 0));
          puffs.emit(at, new THREE.Vector3(rand(-0.3, 0.3), rand(0.5, 1), rand(-0.8, -0.2)), { life: rand(0.8, 1.2) });
        }
      } else if (speed > 0.3) {
        stepClock += dt;
        if (stepClock > 0.33) {
          stepClock = 0;
          puffs.emit(new THREE.Vector3(rand(-0.8, 0.8), 0.1, rand(-0.3, 0.1)), new THREE.Vector3(rand(-0.3, 0.3), 0.3, -0.3),
            { life: 0.5, s0: 0.3, s1: 0.9, alpha: 0.35, color: 0xe3d3b4 });
        }
      }
      const smoke = puffs.update(dt, Math.min(speed, 9));

      shadow.visible = true;
      shadow.scale.set((e.width / 2) * 1.15 * sc(e), (e.length / 2) * 1.1 * sc(e), 1);
      shadow.material.opacity = 0.18 * clamp01(1 - y / 2);

      const l = new THREE.Matrix4()
        .makeTranslation(mc.x, mc.y, mc.z)
        .scale(new THREE.Vector3(s, -s, s))
        .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))
        .multiply(new THREE.Matrix4().makeRotationY(-state.heading));
      camera.projectionMatrix = new THREE.Matrix4().fromArray(matrix).multiply(l);
      renderer.resetState();
      renderer.render(scene, camera);

      const busy = smoke || leaving || tSwap < 1 || (tHop >= 0 && tHop < 1) || (tSettle >= 0 && tSettle < 0.7)
        || speed > 0.01 || e.kind === 'walk'; // the walkers' idle animation keeps going
      if (busy) repaint();
    },
  };

  return {
    layer,
    set(next) {
      const now = clock();
      const wasVisible = state.visible;
      Object.assign(state, next);
      if (!state.visible) {
        shown = null;
        leaving = null;
      } else if (!wasVisible || !shown) {
        leaving = null;
        shown = null;
        show(state.vehicle, now);
      } else if (state.vehicle !== shown) {
        show(state.vehicle, now);
      }
      repaint();
    },
    // a leg starts: hop (after any pop has finished) with a burst of smoke
    go() {
      const now = clock();
      hopAt = Math.max(now, swapAt + popDelay + 0.45);
      if (shown) setTimeout(() => { if (shown) burst(entries[shown]); repaint(); }, (hopAt - now) * 1000);
      repaint();
    },
    // a leg ends: settle with a small wobble
    stop() {
      settleAt = clock();
      repaint();
    },
  };
}
