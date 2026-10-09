// Manos de la persona en la página del reloj: dos ranuras con identidad por cercanía, gesto
// (abierta o agarre, con histéresis) y esqueleto de partículas proyectado en la escena.
import * as THREE from 'three';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const remap = (v, a, b) => clamp((v - a) / (b - a), 0, 1);

export function createHandSlots({ scene, camera, magic }) {
  const state = { lastHandTime: -1e9 };
  function glowTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.15, 'rgba(255,255,255,0.8)');
    grd.addColorStop(0.4, 'rgba(255,255,255,0.18)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }
  const glowTex = glowTexture();
  const COL_OPEN = magic.clone(),
    COL_GRAB = new THREE.Color('#ffffff');

  const BONES = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [0, 5],
    [5, 6],
    [6, 7],
    [7, 8],
    [5, 9],
    [9, 10],
    [10, 11],
    [11, 12],
    [9, 13],
    [13, 14],
    [14, 15],
    [15, 16],
    [13, 17],
    [17, 18],
    [18, 19],
    [19, 20],
    [0, 17],
  ];
  const PER_BONE = 9;
  function handSkeleton() {
    const mat = size =>
      new THREE.PointsMaterial({
        map: glowTex,
        size,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
    const bones = new THREE.Points(new THREE.BufferGeometry(), mat(0.1));
    bones.geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(BONES.length * PER_BONE * 3), 3),
    );
    const joints = new THREE.Points(new THREE.BufferGeometry(), mat(0.22));
    joints.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(21 * 3), 3));
    for (const o of [bones, joints]) {
      o.frustumCulled = false;
      scene.add(o);
    }
    return { bones, joints, world: Array.from({ length: 21 }, () => new THREE.Vector3()) };
  }

  const newSlot = () => ({
    on: false,
    alpha: 0,
    seen: -1e9,
    x: 0.5,
    y: 0.5,
    z: 1.3,
    sx: 0.5,
    sy: 0.5,
    sz: 1.3, // posición en pantalla (0..1)
    rx: 0.5,
    ry: 0.5,
    srx: 0.5,
    sry: 0.5,
    prev: null, // posición cruda en la cámara, sin topes: para girar
    mode: 'open',
    cand: 'open',
    candN: 0,
    world: new THREE.Vector3(),
    ndc: new THREE.Vector2(),
    lm: null,
    slm: null,
    skel: handSkeleton(),
    sprite: new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0,
      }),
    ),
  });
  const slots = [newSlot(), newSlot()];
  slots.forEach(s => scene.add(s.sprite));

  function classify(h) {
    if (h.g === 'Closed_Fist') return 'grab';
    if (h.g === 'Open_Palm') return 'open';
    if (h.o < 1.2 && h.g !== 'Pointing_Up' && h.g !== 'Victory') return 'grab';
    return 'open';
  }

  // Asigna las manos detectadas a los 2 slots manteniendo identidad por cercanía
  function ingestHands(raw) {
    const used = new Set();
    for (const s of slots) {
      if (!s.on) continue;
      let best = -1,
        bd = s.mode === 'grab' ? 0.4 : 0.25;
      raw.forEach((h, i) => {
        if (used.has(i)) return;
        const d = Math.hypot(h.rx - s.rx, h.ry - s.ry);
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      if (best >= 0) {
        used.add(best);
        feed(s, raw[best]);
      }
    }
    raw.forEach((h, i) => {
      if (used.has(i)) return;
      const s = slots.find(s => !s.on);
      if (!s) return;
      s.on = true;
      s.mode = s.cand = h.raw ? h.mode : classify(h);
      s.candN = 0;
      feed(s, h);
    });
  }

  function feed(s, h) {
    const now = performance.now();
    const gap = now - s.seen;
    s.seen = now;
    s.x = h.x;
    s.y = h.y;
    s.rx = h.rx;
    s.ry = h.ry;
    if (h.z) s.z = h.z;
    if (gap > 150) {
      s.sx = h.x;
      s.sy = h.y;
      s.srx = h.rx;
      s.sry = h.ry;
      s.prev = null;
    } // reaparece: sin saltos de giro
    if (h.lm) {
      s.lm = h.lm;
      if (!s.slm || gap > 150) s.slm = Float32Array.from(h.lm);
    }
    const c = h.raw ? h.mode : classify(h);
    if (c === s.cand) s.candN++;
    else {
      s.cand = c;
      s.candN = 1;
    }
    // soltar el agarre exige más confirmación que tomarlo: evita que se caiga por un cuadro dudoso
    const need = h.raw ? 1 : s.mode === 'grab' && c !== 'grab' ? 6 : 3;
    if (s.candN >= need) s.mode = s.cand;
    state.lastHandTime = now;
  }

  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const lmNdc = new THREE.Vector2();

  function updateSkeleton(s, k, grab, now) {
    const { bones, joints, world } = s.skel;
    // detectada: brillante; perdida pero aún sujetando: se queda congelada y tenue (no desaparece)
    const op = !s.on || !s.slm ? 0 : now - s.seen < 200 ? 0.85 : 0.35;
    bones.material.opacity += (op * s.alpha - bones.material.opacity) * 0.25;
    joints.material.opacity += (op * s.alpha * 1.2 - joints.material.opacity) * 0.25;
    if (!s.slm || bones.material.opacity < 0.01) return;
    const col = COL_OPEN.clone().lerp(COL_GRAB, grab);
    bones.material.color.copy(col);
    joints.material.color.copy(col);
    if (now - s.seen < 200) for (let j = 0; j < 42; j++) s.slm[j] += (s.lm[j] - s.slm[j]) * k;
    const jp = joints.geometry.attributes.position.array;
    for (let j = 0; j < 21; j++) {
      lmNdc.set(s.slm[j * 2] * 2 - 1, -(s.slm[j * 2 + 1] * 2 - 1));
      ray.setFromCamera(lmNdc, camera);
      ray.ray.intersectPlane(plane, world[j]) || world[j].copy(s.world);
      world[j].toArray(jp, j * 3);
    }
    const bp = bones.geometry.attributes.position.array;
    let n = 0;
    for (const [a, b] of BONES)
      for (let q = 0; q < PER_BONE; q++) {
        const f = (q + 0.5) / PER_BONE;
        bp[n++] = world[a].x + (world[b].x - world[a].x) * f;
        bp[n++] = world[a].y + (world[b].y - world[a].y) * f;
        bp[n++] = world[a].z + (world[b].z - world[a].z) * f;
      }
    joints.geometry.attributes.position.needsUpdate = bones.geometry.attributes.position.needsUpdate = true;
  }

  // Coloca la mano en 3D: más cerca de la cámara = más adelante en la escena.
  function place(s) {
    s.ndc.set(s.sx * 2 - 1, -(s.sy * 2 - 1));
    plane.constant = -THREE.MathUtils.lerp(1.4, -0.6, remap(s.sz, 0.6, 2.2));
    ray.setFromCamera(s.ndc, camera);
    ray.ray.intersectPlane(plane, s.world);
  }

  return Object.assign(state, { slots, ingest: ingestHands, place, updateSkeleton, COL_OPEN, COL_GRAB });
}
