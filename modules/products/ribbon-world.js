// Tambor de paneles de la galería: un panel por producto, tangente al cilindro, con arcos
// de luz que responden al giro de la mano. createRibbon(products, { labels }).
import * as THREE from 'three';
import { batchDetails, rounded, extrude } from './product-geometry.js';
import { cardTexture } from './card-label.js';

export function createRibbon(products, { labels = false } = {}) {
  const group = new THREE.Group(),
    drum = new THREE.Group();
  group.add(drum);
  const step = (Math.PI * 2) / (products.length * 3),
    radius = 1.88,
    width = 2.44,
    height = 0.65,
    cards = [],
    fades = [];
  let focused = 0,
    opening = 0,
    angle = 0,
    yaw = 0,
    clock = 0,
    motion = 0,
    lastAngle = 0;
  const motionArcs = [];
  const outer = rounded(width, height, 0.095);
  outer.holes.push(rounded(width - 0.06, height - 0.06, 0.075, THREE.Path));
  const capGeometry = new THREE.BoxGeometry(0.024, height * 0.64, 0.126).toNonIndexed();
  const frameParts = new THREE.Group(),
    temporaryMaterial = new THREE.MeshBasicMaterial();
  for (const g of [
    extrude(outer, 0.095),
    capGeometry.clone().translate(-width / 2, 0, 0),
    capGeometry.clone().translate(width / 2, 0, 0),
  ])
    frameParts.add(new THREE.Mesh(g, temporaryMaterial));
  const rimGeometry = batchDetails(frameParts).children[0].geometry,
    bodyGeometry = extrude(rounded(width - 0.055, height - 0.055, 0.085), 0.065);
  frameParts.children.forEach(m => m.geometry.dispose());
  temporaryMaterial.dispose();
  capGeometry.dispose();
  const textures = products.map((product, index) => cardTexture(product, index, { labels }));
  for (let i = 0; i < products.length * 3; i++) {
    const holder = new THREE.Group(),
      theta = i * step;
    holder.position.set(0, -Math.sin(theta) * radius, Math.cos(theta) * radius);
    holder.rotation.x = theta;
    const edge = new THREE.MeshStandardMaterial({
      color: '#8bb8a0',
      metalness: 0.72,
      roughness: 0.23,
      emissive: '#28b965',
      emissiveIntensity: 0.4,
      transparent: true,
    });
    const body = new THREE.MeshPhysicalMaterial({
      color: '#08100c',
      metalness: 0.22,
      roughness: 0.42,
      clearcoat: 0.08,
      clearcoatRoughness: 0.28,
      transparent: true,
      opacity: 1,
    });
    holder.add(new THREE.Mesh(bodyGeometry, body), new THREE.Mesh(rimGeometry, edge));
    const type = new THREE.MeshBasicMaterial({
      map: textures[i % products.length],
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    const text = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.13, height - 0.1), type);
    text.position.z = 0.051;
    holder.add(text);
    // Solid, luminous end caps give the panels visible thickness on the turn.
    drum.add(holder);
    cards.push({ holder, edge, body, type, index: i % products.length, theta });
  }
  for (const side of [-1, 1]) {
    const color = '#57da82';
    for (const [r, thickness, power] of [
      [radius, 0.013, 0.9],
      [radius + 0.055, 0.005, 0.4],
      [radius - 0.1, 0.007, 0.28],
    ]) {
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(color).multiplyScalar(power),
        transparent: true,
        opacity: 0.85,
        toneMapped: false,
      });
      const rail = new THREE.Mesh(new THREE.TorusGeometry(r, thickness, 8, 128), mat);
      rail.rotation.y = Math.PI / 2;
      rail.position.x = side * (width / 2 + 0.065);
      drum.add(rail);
      fades.push([mat, 0.85]);
    }
    const skinMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.07,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    });
    const skin = new THREE.Mesh(new THREE.RingGeometry(radius - 0.1, radius + 0.055, 128), skinMat);
    skin.rotation.y = Math.PI / 2;
    skin.position.x = side * (width / 2 + 0.06);
    drum.add(skin);
    fades.push([skinMat, 0.07]);

    // Short light arcs reveal the circular depth when a hand turns the wheel.
    // Their response comes from its movement, not a perpetual spinning overlay.
    for (let k = 0; k < 3; k++) {
      const points = Array.from({ length: 38 }, (_, i) => {
        const a = (i / 37) * 0.82 + k * 2.1;
        return new THREE.Vector3(
          side * (width / 2 + 0.095),
          -Math.sin(a) * (radius + 0.035),
          Math.cos(a) * (radius + 0.035),
        );
      });
      const mat = new THREE.LineBasicMaterial({
        color: new THREE.Color('#baffcf').multiplyScalar(1.35),
        transparent: true,
        opacity: 0,
        toneMapped: false,
        depthWrite: false,
      });
      const arc = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), mat);
      drum.add(arc);
      motionArcs.push(mat);
    }

    const tickMat = new THREE.MeshBasicMaterial({
      color: '#badbc4',
      transparent: true,
      opacity: 0.4,
      toneMapped: false,
    });
    fades.push([tickMat, 0.4]);
    const ticks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.009, 0.011, 0.047), tickMat, 50),
      placement = new THREE.Object3D();
    for (let j = 0; j < 50; j++) {
      const a = (j / 50) * Math.PI * 2;
      placement.position.set(side * (width / 2 + 0.069), -Math.sin(a) * radius, Math.cos(a) * radius);
      placement.rotation.x = a;
      placement.scale.z = j % 5 === 0 ? 2.3 : 1;
      placement.updateMatrix();
      ticks.setMatrixAt(j, placement.matrix);
    }
    drum.add(ticks);
  }
  const progressMat = new THREE.MeshBasicMaterial({ color: '#71f3a0', toneMapped: false });
  const progress = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.18, 0.028), progressMat);
  progress.geometry.translate((width - 0.18) / 2, 0, 0);
  progress.position.set(-(width - 0.18) / 2, -height / 2 - 0.066, radius + 0.16);
  group.add(progress);
  function arrange(nextAngle, focus, hold = 0, { dt = 0.016, idle = false, reducedMotion = false, viewYaw = 0 } = {}) {
    const speed = Math.min(
      1,
      (Math.abs(nextAngle - lastAngle) / Math.max(0.016, dt)) * 0.18 + Math.abs(viewYaw - yaw) * 2,
    );
    motion += (speed - motion) * (1 - Math.exp(-dt * 10));
    if (reducedMotion) motion = 0;
    lastAngle = nextAngle;
    angle = nextAngle;
    focused = focus;
    opening = 0;
    group.visible = true;
    group.scale.setScalar(1);
    if (!reducedMotion) clock += dt;
    const targetYaw = viewYaw + (idle && !reducedMotion ? Math.sin(clock * 0.4) * 0.46 : 0);
    yaw += (targetYaw - yaw) * (1 - Math.exp(-dt * 8));
    group.rotation.set(0, yaw, 0);
    // The drum itself turns. Every panel remains physically tangent to it.
    drum.rotation.x = angle;
    for (const c of cards) {
      const front = Math.cos(c.theta + angle),
        selected = c.index === focus && front > 0.91;
      c.edge.emissive.set(selected ? '#5bff98' : '#249c4c');
      c.edge.emissiveIntensity = selected ? 1.25 : 0.35;
      c.edge.opacity = front > 0 ? 1 : 0.16;
      c.body.color.set(selected ? '#d1edda' : '#08110d');
      c.body.metalness = selected ? 0.12 : 0.22;
      c.body.opacity = front > 0 ? 1 : 0.18;
      c.type.color.set(selected ? '#082518' : '#e2eee7');
      c.type.opacity = front > 0 ? 1 : 0;
      c.holder.scale.setScalar(selected ? 1.045 : 1);
      const lift = (selected ? 0.085 : 0) + motion * Math.max(0, front) * 0.075;
      c.holder.position.set(0, -Math.sin(c.theta) * (radius + lift), Math.cos(c.theta) * (radius + lift));
    }
    for (const [mat, opacity] of fades) mat.opacity = opacity;
    for (const mat of motionArcs) mat.opacity = motion * 0.85;
    progress.scale.x = Math.max(0.001, hold);
    progress.visible = hold > 0;
  }
  arrange(0, 0);
  return {
    group,
    step,
    arrange,
    state: () => ({ angle, yaw, roll: group.rotation.z, motion }),
    open(amount) {
      opening = amount;
      group.visible = amount < 0.999;
      group.rotation.y = yaw + amount * Math.PI * 0.65;
      group.scale.setScalar(1 + amount * 0.12);
      drum.rotation.x = angle + amount * 0.7;
      for (const c of cards) {
        c.edge.opacity = 1 - amount;
        c.body.opacity = 0.94 * (1 - amount);
        c.type.opacity = Math.max(0, 1 - amount * 1.8);
      }
      for (const [mat, opacity] of fades) mat.opacity = opacity * (1 - amount);
      for (const mat of motionArcs) mat.opacity = motion * 0.85 * (1 - amount);
      progress.visible = false;
    },
    labels(camera, rect) {
      group.updateMatrixWorld(true);
      return products.map((p, index) => {
        const card = cards
          .filter(c => c.index === index)
          .sort((a, b) => Math.cos(b.theta + angle) - Math.cos(a.theta + angle))[0];
        const points = [
          [-width / 2, -height / 2],
          [width / 2, -height / 2],
          [width / 2, height / 2],
          [-width / 2, height / 2],
        ].map(([x, y]) => new THREE.Vector3(x, y, 0.075).applyMatrix4(card.holder.matrixWorld).project(camera));
        const xs = points.map(p => rect.left + ((p.x + 1) * rect.width) / 2),
          ys = points.map(p => rect.top + ((1 - p.y) * rect.height) / 2),
          x = Math.min(...xs),
          y = Math.min(...ys);
        return {
          id: p.id,
          x,
          y,
          width: Math.max(...xs) - x,
          height: Math.max(...ys) - y,
          front: index === focused,
          visible: Math.cos(card.theta + angle) > 0.2 && opening < 0.5,
        };
      });
    },
  };
}
