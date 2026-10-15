// Independent visitor skeletons share immutable particle and human mesh assets.
// Camera-aware cells keep complete bodies inside the presentation viewport.
import * as THREE from 'three';
import { JOINTS, MID_H, createHumanAvatar } from '../modules/avatar/index.js';
import { createPoseTracker } from './pose-tracker.js';

export async function createCrowdAvatars({ scene, camera, body, scale, appearance, geometryCache }) {
  const ownsGeometry = !geometryCache;
  geometryCache ??= new Map();
  const slots = await Promise.all(
    Array.from({ length: 4 }, async (_, index) => {
      const J = Array.from({ length: JOINTS }, () => new THREE.Vector3(0, -20, 0));
      const V = Array(JOINTS).fill(0);
      const U = { ...body.U, uJ: { value: J }, uV: { value: V }, uHeadR: { value: 0.1 * scale } };
      const geometry = new THREE.BufferGeometry();
      for (const [name, attribute] of Object.entries(body.geo.attributes)) geometry.setAttribute(name, attribute);
      geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(body.N), 1));
      geometry.boundingSphere = body.geo.boundingSphere;
      const material = body.particles.material.clone();
      material.uniforms = U;
      const particles = new THREE.Points(geometry, material);
      particles.frustumCulled = false;
      const human = await createHumanAvatar(U, scale, appearance, geometryCache);
      const group = new THREE.Group();
      group.add(particles, human.mesh);
      group.visible = false;
      scene.add(group);
      return {
        slot: index,
        id: null,
        observedAt: -Infinity,
        lastIngest: -Infinity,
        admitted: false,
        cellCenter: new THREE.Vector3(),
        cellScale: 0,
        layoutInitialized: false,
        J,
        V,
        U,
        geometry,
        particles,
        human,
        group,
        tracker: createPoseTracker({ J, V, U, scale }),
      };
    }),
  );
  let count = 0;
  let active = false;
  let settings = {};
  const screen = new THREE.Vector3();
  const center = new THREE.Vector3();
  const corner = new THREE.Vector3();

  function configure(options) {
    settings = options;
    for (const slot of slots) {
      slot.tracker.configure(options);
      slot.human.configure(options);
    }
  }

  function ingest(participants, now) {
    for (const slot of slots) slot.admitted = false;
    for (const person of participants) {
      if (!Number.isInteger(person.slot) || person.slot < 0 || person.slot >= slots.length) continue;
      const slot = slots[person.slot];
      const fresh = slot.id !== person.id;
      if (fresh) {
        slot.tracker.reset();
        slot.id = person.id;
        slot.lastIngest = -Infinity;
        slot.layoutInitialized = false;
      }
      slot.admitted = true;
      slot.observedAt = person.observedAt;
      if (slot.lastIngest !== person.observedAt) {
        const dt = fresh ? 1 / 30 : Math.min(0.15, Math.max(0.001, (now - slot.lastIngest) / 1000));
        slot.tracker.ingest(person.pose, person.hands, dt);
        slot.lastIngest = person.observedAt;
        if (fresh) slot.tracker.follow(1);
      }
    }
    count = slots.reduce((total, slot) => total + Number(slot.admitted), 0);
  }

  function onPlane(x, y, target) {
    screen.set(x, y, 0.5).unproject(camera).sub(camera.position);
    return target.copy(camera.position).addScaledVector(screen, -camera.position.z / screen.z);
  }

  function position(slot, rank, reservedLeft, dt) {
    const columns = count > 1 ? 2 : 1;
    const rows = count > 2 ? 2 : 1;
    const left = count === 2 && Number.isFinite(reservedLeft) ? Math.min(0.45, Math.max(0, reservedLeft)) : 0;
    const width = 1 - left;
    const nx = -1 + 2 * left + (((rank % columns) + 0.5) * 2 * width) / columns;
    const ny = 1 - ((Math.floor(rank / columns) + 0.5) * 2) / rows;
    onPlane(nx, ny, center);
    onPlane(nx + (0.82 * width) / columns, ny + 0.82 / rows, corner);
    let halfWidth = 1.6,
      halfHeight = 2.9;
    const hip = slot.J[MID_H];
    for (let j = 0; j < 75; j++) {
      halfWidth = Math.max(halfWidth, Math.abs(slot.J[j].x - hip.x) + 0.12 * scale);
      halfHeight = Math.max(halfHeight, Math.abs(slot.J[j].y - hip.y) + 0.16 * scale);
    }
    const fit = Math.min(Math.abs(corner.x - center.x) / halfWidth, Math.abs(corner.y - center.y) / halfHeight);
    if (!slot.layoutInitialized) {
      slot.cellCenter.copy(center);
      slot.cellScale = fit;
      slot.layoutInitialized = true;
    } else {
      const blend = 1 - Math.exp(-dt * 12);
      slot.cellCenter.lerp(center, blend);
      slot.cellScale += (fit - slot.cellScale) * blend;
    }
    slot.group.scale.setScalar(slot.cellScale);
    slot.group.position.copy(slot.cellCenter).addScaledVector(hip, -slot.cellScale);
  }

  function update({
    now,
    dt,
    active: enabled,
    surfaceOn,
    appearance: selected,
    options = settings,
    particleDensity,
    reservedLeft = 0,
  }) {
    active = enabled && count > 0;
    let rank = 0;
    for (const slot of slots) {
      slot.group.visible = active && slot.admitted;
      if (!slot.group.visible) continue;
      slot.tracker.follow(1 - Math.exp(-dt * 26), now);
      slot.tracker.updateVirtualJoints();
      slot.human.select(selected);
      slot.human.update(slot.J, slot.V);
      slot.human.mesh.visible = surfaceOn;
      slot.particles.visible = options.particles !== false && particleDensity > 0;
      const amount = Math.floor((body.N * particleDensity) / count);
      if (slot.geometry.drawRange.count !== amount) {
        const indices = slot.geometry.index;
        for (let i = 0; i < amount; i++) indices.array[i] = Math.floor((i * body.N) / amount);
        indices.needsUpdate = true;
        slot.geometry.setDrawRange(0, amount);
      }
      position(slot, rank++, reservedLeft, dt);
    }
    return { active, count };
  }

  return {
    configure,
    ingest,
    update,
    state() {
      return {
        active,
        count,
        slots: slots
          .filter(slot => slot.admitted)
          .map(slot => ({
            slot: slot.slot,
            id: slot.id,
            observedAt: slot.observedAt,
            lastPose: slot.tracker.lastPose,
            center: slot.group.position.toArray(),
            cellCenter: slot.cellCenter.toArray(),
            scale: slot.group.scale.x,
            joints: slot.J.map(joint => joint.toArray()),
            visibility: slot.V.slice(),
            particleCount: slot.geometry.drawRange.count,
          })),
      };
    },
    dispose() {
      for (const slot of slots) {
        slot.group.removeFromParent();
        slot.particles.material.dispose();
        slot.human.dispose();
        // Detach shared buffers before disposing this geometry view.
        slot.geometry.attributes = {};
        slot.geometry.dispose();
      }
      if (ownsGeometry) {
        geometryCache.forEach(asset => asset.then(({ geo }) => geo.dispose()));
        geometryCache.clear();
      }
    },
  };
}
