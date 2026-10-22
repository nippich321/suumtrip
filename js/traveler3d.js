// Low-poly 3D traveler drawn on top of the MapLibre map with three.js.
// The same traveler swaps between a walking person and vehicles.
import * as THREE from 'three';

const mat = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true });

function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  return m;
}

function wheel(x, z, r = 0.34) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.26, 10), mat(0x2b2b33));
  m.rotation.z = Math.PI / 2;
  m.position.set(x, r, z);
  return m;
}

function person() {
  const g = new THREE.Group();
  const legL = box(0.22, 0.8, 0.24, 0x3b4a7a, -0.13, 0.4, 0);
  const legR = box(0.22, 0.8, 0.24, 0x3b4a7a, 0.13, 0.4, 0);
  legL.geometry.translate(0, -0.4, 0); legL.position.y = 0.8;
  legR.geometry.translate(0, -0.4, 0); legR.position.y = 0.8;
  const body = box(0.6, 0.75, 0.36, 0xff6b4a, 0, 1.18, 0);
  const pack = box(0.46, 0.55, 0.22, 0xffb020, 0, 1.2, -0.28);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 8), mat(0xf2c29b));
  head.position.set(0, 1.78, 0);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.12, 10), mat(0x10a39a));
  cap.position.set(0, 1.98, 0);
  const brim = box(0.34, 0.04, 0.24, 0x10a39a, 0, 1.94, 0.24);
  g.add(legL, legR, body, pack, head, cap, brim);
  g.userData.legs = [legL, legR];
  return g;
}

function car(color, roof = null) {
  const g = new THREE.Group();
  g.add(box(1.8, 0.6, 4, color, 0, 0.62, 0));
  g.add(box(1.6, 0.55, 2.1, roof ?? color, 0, 1.18, -0.25));
  g.add(box(1.5, 0.42, 0.05, 0xbfe3ff, 0, 1.18, 0.82));
  g.add(wheel(-0.85, 1.25), wheel(0.85, 1.25), wheel(-0.85, -1.25), wheel(0.85, -1.25));
  return g;
}

function songthaew() {
  const g = new THREE.Group();
  g.add(box(1.9, 0.6, 4.4, 0x2e6bd6, 0, 0.62, 0));
  g.add(box(1.8, 0.6, 1.2, 0x2e6bd6, 0, 1.2, 1.4));
  g.add(box(1.95, 0.12, 3.1, 0xe8e8e8, 0, 2.0, -0.6));
  for (const x of [-0.9, 0.9]) for (const z of [-2, 0.8]) g.add(box(0.08, 0.9, 0.08, 0xe8e8e8, x, 1.45, z));
  g.add(wheel(-0.9, 1.4), wheel(0.9, 1.4), wheel(-0.9, -1.4), wheel(0.9, -1.4));
  return g;
}

function van() {
  const g = new THREE.Group();
  g.add(box(2, 1.5, 5, 0xf4f4f4, 0, 1.1, 0));
  g.add(box(2.02, 0.45, 3.6, 0x37474f, 0, 1.45, -0.4));
  g.add(box(1.8, 0.5, 0.05, 0xbfe3ff, 0, 1.45, 2.5));
  g.add(box(2.04, 0.18, 5, 0xff6b4a, 0, 0.75, 0));
  g.add(wheel(-0.95, 1.6, 0.38), wheel(0.95, 1.6, 0.38), wheel(-0.95, -1.6, 0.38), wheel(0.95, -1.6, 0.38));
  return g;
}

export function createTravelerLayer(maplibregl) {
  const models = {
    walk: person(),
    car: car(0x10a39a, 0x0b7d76),
    grab: car(0x00b14f, 0x00964a),
    songthaew: songthaew(),
    van: van(),
  };
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.6, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18 }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;

  const state = { lngLat: [0, 0], heading: 0, vehicle: 'walk', visible: false, t: 0, size: 1 };
  let map, camera, scene, renderer;

  const layer = {
    id: 'traveler-3d',
    type: 'custom',
    renderingMode: '3d',
    onAdd(m, gl) {
      map = m;
      camera = new THREE.Camera();
      scene = new THREE.Scene();
      scene.add(new THREE.AmbientLight(0xffffff, 1.4));
      const sun = new THREE.DirectionalLight(0xffffff, 1.6);
      sun.position.set(30, 80, 40);
      scene.add(sun);
      for (const k in models) scene.add(models[k]);
      scene.add(shadow);
      renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false;
    },
    render(gl, matrix) {
      if (!state.visible) return;
      for (const k in models) models[k].visible = k === state.vehicle;
      const w = models.walk.userData.legs;
      const swing = state.vehicle === 'walk' ? Math.sin(state.t * 14) * 0.6 : 0;
      w[0].rotation.x = swing; w[1].rotation.x = -swing;
      shadow.scale.setScalar(state.vehicle === 'walk' ? 0.5 : state.vehicle === 'van' ? 1.8 : 1.4);

      const mc = maplibregl.MercatorCoordinate.fromLngLat(state.lngLat, 0);
      // keep the traveler a readable size at any zoom
      const s = mc.meterInMercatorCoordinateUnits() * Math.pow(2, 16.2 - map.getZoom()) * 9 * state.size;
      const l = new THREE.Matrix4()
        .makeTranslation(mc.x, mc.y, mc.z)
        .scale(new THREE.Vector3(s, -s, s))
        .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))
        .multiply(new THREE.Matrix4().makeRotationY(-state.heading));
      camera.projectionMatrix = new THREE.Matrix4().fromArray(matrix).multiply(l);
      renderer.resetState();
      renderer.render(scene, camera);
    },
  };

  return {
    layer,
    set(next) { Object.assign(state, next); if (map) map.triggerRepaint(); },
  };
}
