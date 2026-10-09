// Escena 3D del estudio gestual: muestra los escenarios (SCENARIOS) y la propuesta
// elegida. createStudioWorld() devuelve el grupo y sus métodos de actualización.
import * as THREE from 'three';
import { SCENARIOS } from '../tracking/index.js';

export function createStudioWorld() {
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(34, 1, 0.1, 80);
  camera.position.set(7, 7.2, 9);
  camera.lookAt(0, 0.4, 0);
  scene.add(new THREE.HemisphereLight(0xdce9ff, 0x12382b, 2.2));
  const key = new THREE.DirectionalLight(0xffeed6, 3.4);
  key.position.set(-3, 8, 5);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x7affd0, 1.2);
  fill.position.set(5, 2, -5);
  scene.add(fill);
  const root = new THREE.Group();
  scene.add(root);
  const boxGeo = new THREE.BoxGeometry(1, 1, 1),
    sphereGeo = new THREE.SphereGeometry(1, 8, 6);
  const materials = {
    stone: new THREE.MeshStandardMaterial({ color: 0xc7cec3, roughness: 0.43, metalness: 0.23 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x102d2a, roughness: 0.38, metalness: 0.55 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x32766a, roughness: 0.2, metalness: 0.65 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xc6a66d, roughness: 0.33, metalness: 0.55 }),
    green: new THREE.MeshStandardMaterial({ color: 0x356d49, roughness: 0.8 }),
    solar: new THREE.MeshStandardMaterial({ color: 0x164765, roughness: 0.19, metalness: 0.6 }),
    light: new THREE.MeshBasicMaterial({ color: 0xa1ffd7 }),
    road: new THREE.MeshStandardMaterial({ color: 0x1b2527, roughness: 0.9 }),
  };
  const box = (group, x, y, z, w, h, d, mat = 'stone') => {
    const m = new THREE.Mesh(boxGeo, materials[mat]);
    m.position.set(x, y, z);
    m.scale.set(w, h, d);
    group.add(m);
    return m;
  };
  function trace(group, points, color = 0x76d9b5) {
    const geo = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(...p)));
    group.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.65 })));
  }
  function tree(group, x, z) {
    box(group, x, 0.27, z, 0.05, 0.4, 0.05, 'gold');
    const m = new THREE.Mesh(sphereGeo, materials.green);
    m.position.set(x, 0.54, z);
    m.scale.set(0.22, 0.31, 0.22);
    group.add(m);
  }
  function building(g, x, z, w, d, h) {
    box(g, x, h / 2 + 0.06, z, w, h, d);
    box(g, x, h + 0.1, z, w + 0.08, 0.07, d + 0.08, 'gold');
    box(g, x, h / 2 + 0.1, z + d / 2 + 0.008, w * 0.79, h * 0.8, 0.025, 'glass');
    const rows = Math.floor(h / 0.23);
    for (let j = 1; j <= rows; j++) box(g, x, 0.13 + j * 0.22, z + d / 2 + 0.026, w * 0.8, 0.017, 0.02, 'light');
    box(g, x + w / 2 + 0.006, h / 2 + 0.1, z, 0.02, h * 0.8, d * 0.75, 'glass');
  }
  function solar(g, x, z) {
    box(g, x, 0.4, z, 0.045, 0.7, 0.045, 'gold');
    const p = box(g, x, 0.77, z, 0.84, 0.045, 0.54, 'solar');
    p.rotation.x = -0.24;
    for (let i = -1; i <= 1; i++) box(g, x + i * 0.23, 0.797, z, 0.012, 0.008, 0.51, 'light');
  }
  const models = {};
  for (const name of Object.keys(SCENARIOS)) {
    const group = new THREE.Group();
    root.add(group);
    const energy = Array.from({ length: 3 }, () => new THREE.Group()),
      capacity = Array.from({ length: 3 }, () => new THREE.Group()),
      automation = Array.from({ length: 3 }, () => new THREE.Group());
    [...energy, ...capacity, ...automation].forEach(g => group.add(g));
    box(group, 0, -0.12, 0, 6.5, 0.24, 4.6, 'dark');
    box(group, 0, 0.015, 0, 6.38, 0.045, 4.48, 'road');
    trace(
      group,
      [
        [-3.26, 0.01, -2.31],
        [3.26, 0.01, -2.31],
        [3.26, 0.01, 2.31],
        [-3.26, 0.01, 2.31],
        [-3.26, 0.01, -2.31],
      ],
      SCENARIOS[name].color,
    );
    for (let i = 0; i < 12; i++) box(group, -2.9 + i * 0.52, 0.05, 0.45, 0.18, 0.012, 0.035, 'gold');
    for (let i = 0; i < 3; i++) {
      solar(energy[i], -2.4 + i * 0.9, 1.5);
      trace(
        automation[i],
        [
          [-2.8, 0.11, -1.8 + i * 0.7],
          [-0.2, 0.11, -1.8 + i * 0.7],
          [-0.2, 0.11, 1.9],
          [2.8, 0.11, 1.9],
        ],
        0x9dffcf,
      );
      for (let j = 0; j < 3; j++) {
        const node = new THREE.Mesh(sphereGeo, materials.light);
        node.scale.setScalar(0.055);
        node.position.set(-2.6 + j * 1.9, 0.12, -1.8 + i * 0.7);
        automation[i].add(node);
      }
    }
    const movers = [];
    if (name === 'city') {
      building(group, -1.75, -0.65, 0.83, 0.85, 1.65);
      building(group, -0.5, -1.1, 0.9, 1.2, 2.55);
      building(group, 0.9, -0.6, 0.94, 0.8, 1.15);
      for (let i = 0; i < 3; i++) building(capacity[i], 1.95, -1.55 + i * 0.9, 0.75, 0.68, 1.05 + i * 0.48);
      for (let i = 0; i < 5; i++) tree(group, -2.75 + i * 1.1, 1.97);
      for (let i = 0; i < 3; i++) movers.push(box(automation[i], 0, 0.15, 0.5, 0.3, 0.16, 0.13, 'light'));
    } else if (name === 'industry') {
      box(group, -0.6, 0.54, -0.7, 3.7, 1, 1.75);
      box(group, -0.6, 1.07, -0.7, 3.8, 0.12, 1.84, 'gold');
      for (let i = 0; i < 6; i++) box(group, -2.1 + i * 0.57, 0.56, 0.186, 0.31, 0.49, 0.026, 'glass');
      box(group, 0.1, 0.2, 0.87, 4.8, 0.22, 0.52, 'dark');
      for (let i = 0; i < 11; i++) box(group, -2.05 + i * 0.42, 0.32, 0.87, 0.027, 0.02, 0.48, 'gold');
      for (let i = 0; i < 3; i++) {
        box(capacity[i], 2.35, 0.43, -1.5 + i * 1.02, 0.95, 0.75, 0.8, 'glass');
        const arm = new THREE.Group();
        arm.position.set(-1.65 + i * 1.25, 0.36, 1.15);
        automation[i].add(arm);
        box(arm, 0, 0.12, 0, 0.27, 0.22, 0.3, 'gold');
        const elbow = box(arm, 0, 0.45, 0, 0.11, 0.6, 0.12, 'gold');
        elbow.rotation.z = 0.38;
        box(arm, -0.26, 0.67, 0, 0.43, 0.1, 0.12, 'light');
        movers.push(arm);
      }
    } else {
      for (let i = 0; i < 3; i++) {
        const x = -1.7 + i * 1.48;
        box(group, x, 0.54, -0.7, 1.28, 1, 1.5);
        box(group, x, 0.57, 0.065, 1.12, 0.7, 0.035, 'glass');
        box(group, x, 1.13, -0.15, 1.45, 0.12, 0.86, 'gold');
        box(group, x, 1.3, -0.7, 0.6, 0.1, 0.12, 'light');
        box(capacity[i], x, 0.34, 1.14, 1.05, 0.53, 0.8, 'glass');
        box(capacity[i], x, 0.67, 1.14, 1.15, 0.13, 0.9, 'gold');
        movers.push(box(automation[i], x, 0.32, 0.61, 0.18, 0.54, 0.14, 'light'));
      }
      [-2.8, 2.8].forEach(x => {
        tree(group, x, -1.7);
        tree(group, x, 1.75);
      });
    }
    models[name] = { group, energy, capacity, automation, movers };
    group.visible = false;
  }
  let selected = 'city',
    choices = { energy: 0, automation: 0, capacity: 0 },
    yaw = -0.05,
    zoom = 1,
    shown = 0,
    build = 0,
    preview = true;
  function set(next, isPreview = false) {
    preview = isPreview;
    if (selected !== next.scenario) build = 0;
    selected = next.scenario;
    choices = { ...next };
    for (const [name, m] of Object.entries(models)) {
      m.group.visible = name === selected;
      for (const kind of ['energy', 'automation', 'capacity'])
        m[kind].forEach((g, i) => {
          g.visible = i < next[kind];
        });
    }
  }
  set({ scenario: 'city', energy: 0, automation: 0, capacity: 0 });
  return {
    set,
    reveal() {
      build = 0;
    },
    transform(nextYaw, nextZoom) {
      yaw = nextYaw;
      zoom = THREE.MathUtils.clamp(nextZoom, 0.7, 1.3);
    },
    render(renderer, rect, { dt, time, reducedMotion, active }) {
      shown += (Number(active) - shown) * (1 - Math.exp(-dt * 7));
      if (shown < 0.01 || rect.width < 1) return;
      build = reducedMotion ? 1 : Math.min(1, build + dt * 1.6);
      root.visible = !preview;
      root.scale.set(zoom * shown, zoom * shown * (0.03 + 0.97 * (1 - Math.pow(1 - build, 3))), zoom * shown);
      root.rotation.y = yaw;
      root.position.y = -0.2 * (1 - build);
      const m = models[selected];
      m.movers.forEach((item, i) => {
        if (selected === 'city') item.position.x = reducedMotion ? -1 + i : ((time * 0.6 + i * 1.8) % 5.6) - 2.8;
        if (selected === 'industry') item.rotation.y = reducedMotion ? 0 : Math.sin(time * 0.85 + i) * 0.4;
        if (selected === 'commerce') item.position.z = reducedMotion ? 0.6 : 0.6 + Math.sin(time * 0.65 + i) * 0.09;
      });
      camera.aspect = rect.width / rect.height;
      camera.updateProjectionMatrix();
      const oldAuto = renderer.autoClear,
        oldTone = renderer.toneMapping;
      renderer.autoClear = false;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.setScissor(rect.left, innerHeight - rect.bottom, rect.width, rect.height);
      renderer.setScissorTest(true);
      renderer.setViewport(rect.left, innerHeight - rect.bottom, rect.width, rect.height);
      renderer.clearDepth();
      renderer.render(scene, camera);
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, innerWidth, innerHeight);
      renderer.autoClear = oldAuto;
      renderer.toneMapping = oldTone;
    },
  };
}
