import * as THREE from 'three';

// Original round mechanical watch. The bracelet follows a closed wrist profile;
// gears, bridges, hands and sapphire are separate modules, not a face texture.
export function buildChronograph({ model, m, mesh, box, disk, torus, screw, engraving }) {
  const watch = model('watch'),
    TAU = Math.PI * 2;
  const turned = (profile, mat) => {
    const geo = new THREE.LatheGeometry(
      profile.map(([r, z]) => new THREE.Vector2(r, z)),
      128,
    );
    geo.rotateX(Math.PI / 2);
    return mesh(geo, mat);
  };
  const rim = (outer, inner, depth, mat) =>
    turned(
      [
        [inner, -depth / 2],
        [outer - 0.022, -depth / 2],
        [outer, -depth / 2 + 0.022],
        [outer, depth / 2 - 0.022],
        [outer - 0.022, depth / 2],
        [inner, depth / 2],
        [inner, -depth / 2],
      ],
      mat,
    );
  const satin = m.titanium.clone();
  satin.roughness = 0.32;
  satin.clearcoat = 0.06;
  satin.envMapIntensity = 1.05;
  const polish = m.silver.clone();
  polish.roughness = 0.13;
  polish.clearcoat = 0.1;
  polish.envMapIntensity = 1.05;
  const blackSteel = new THREE.MeshStandardMaterial({
    color: '#090c09',
    metalness: 0.55,
    roughness: 0.42,
    envMapIntensity: 0.58,
  });
  const engravingSteel = new THREE.MeshStandardMaterial({
    color: '#252b23',
    metalness: 0.68,
    roughness: 0.52,
    envMapIntensity: 0.5,
  });
  const casing = new THREE.Group();
  casing.add(
    turned(
      [
        [1.014, -0.18],
        [1.105, -0.18],
        [1.158, -0.15],
        [1.181, -0.09],
        [1.181, 0.025],
        [1.162, 0.077],
        [1.11, 0.118],
        [1.014, 0.118],
        [1.014, -0.18],
      ],
      satin,
    ),
  );
  casing.add(
    turned(
      [
        [1.02, 0.085],
        [1.134, 0.087],
        [1.164, 0.105],
        [1.174, 0.135],
        [1.146, 0.155],
        [1.02, 0.155],
      ],
      polish,
    ),
  );
  casing.add(
    turned(
      [
        [1.015, -0.192],
        [1.103, -0.192],
        [1.148, -0.165],
        [1.151, -0.148],
        [1.107, -0.165],
        [1.015, -0.165],
      ],
      polish,
    ),
  );
  // Integrated curved lugs taper in plan and drop towards the end link. The
  // changing cross section creates a continuous highlight instead of four blocks.
  for (const side of [-1, 1])
    for (const hand of [-1, 1]) {
      const shape = new THREE.Shape();
      shape.moveTo(0.46, 0.88);
      shape.bezierCurveTo(0.54, 0.87, 0.63, 0.84, 0.72, 0.84);
      shape.bezierCurveTo(0.81, 0.96, 0.82, 1.15, 0.73, 1.33);
      shape.quadraticCurveTo(0.68, 1.39, 0.57, 1.37);
      shape.lineTo(0.48, 1.3);
      shape.bezierCurveTo(0.56, 1.13, 0.56, 1.02, 0.46, 0.88);
      shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: 0.15,
        bevelEnabled: true,
        bevelSegments: 3,
        bevelSize: 0.022,
        bevelThickness: 0.018,
        curveSegments: 16,
        steps: 1,
      });
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        pos.setXYZ(i, pos.getX(i) * hand, y * side, pos.getZ(i) - 0.07 - Math.max(0, y - 0.87) * 0.38);
      }
      geo.computeVertexNormals();
      // Mirroring both planar axes changes winding only when their signs differ.
      if (hand * side < 0) {
        const index = geo.index;
        if (index) {
          for (let i = 0; i < index.count; i += 3) {
            const v = index.getX(i + 1);
            index.setX(i + 1, index.getX(i + 2));
            index.setX(i + 2, v);
          }
        } else
          for (const attr of Object.values(geo.attributes)) {
            for (let i = 0; i < attr.count; i += 3)
              for (let k = 0; k < attr.itemSize; k++) {
                const a = (i + 1) * attr.itemSize + k,
                  b = (i + 2) * attr.itemSize + k,
                  v = attr.array[a];
                attr.array[a] = attr.array[b];
                attr.array[b] = v;
              }
          }
        geo.computeVertexNormals();
      }
      casing.add(mesh(geo, polish));
    }
  for (const side of [-1, 1]) {
    const pin = disk(0.05, 1.08, 'titanium');
    pin.rotation.y = Math.PI / 2;
    pin.position.set(0, side * 1.245, -0.174);
    casing.add(pin);
    for (const x of [-0.565, 0.565]) {
      const cap = disk(0.051, 0.021, 'silver');
      cap.rotation.y = Math.PI / 2;
      cap.position.set(x, side * 1.245, -0.174);
      casing.add(cap);
    }
  }
  watch.part('Caja y asas integradas', casing, [0, 0, 0], [0, 0, 0]);
  const bezel = new THREE.Group();
  bezel.add(
    turned(
      [
        [1.035, -0.045],
        [1.149, -0.045],
        [1.182, -0.024],
        [1.187, 0.018],
        [1.166, 0.045],
        [1.116, 0.077],
        [1.045, 0.075],
        [1.025, 0.054],
        [1.025, 0.01],
        [1.035, -0.045],
      ],
      polish,
    ),
  );
  bezel.add(
    turned(
      [
        [1.078, 0.073],
        [1.112, 0.079],
        [1.162, 0.05],
        [1.15, 0.06],
        [1.112, 0.086],
        [1.08, 0.083],
      ],
      satin,
    ),
  );
  for (const [r, z] of [
    [1.032, 0.059],
    [1.175, 0.012],
  ]) {
    const edge = torus(r, 0.006, 'silver');
    edge.position.z = z;
    bezel.add(edge);
  }
  for (let i = 0; i < 60; i++) {
    const a = (i * TAU) / 60,
      tick = box(i % 5 ? 0.006 : 0.01, i % 5 ? 0.018 : 0.038, 0.002, 'dark', 0.001);
    tick.position.set(Math.sin(a) * 1.126, Math.cos(a) * 1.126, 0.08);
    tick.rotation.z = -a;
    bezel.add(tick);
  }
  watch.part('Bisel torneado y pulido', bezel, [0, 0, 0.205], [0, 0, 3.05]);
  const gears = [
    [-0.49, 0.27, 0.3, 38],
    [0.05, 0.36, 0.23, 32],
    [0.47, 0.14, 0.32, 40],
    [-0.2, -0.22, 0.29, 36],
    [0.33, -0.42, 0.27, 34],
    [-0.57, -0.39, 0.17, 26],
    [0.02, -0.65, 0.16, 24],
    [0.63, -0.35, 0.15, 24],
    [-0.42, 0.65, 0.14, 22],
  ];
  const plateShape = new THREE.Shape();
  plateShape.absarc(0, 0, 1.012, 0, TAU, false);
  for (const [x, y, r] of gears) {
    const hole = new THREE.Path();
    hole.absarc(x, y, r * 0.46, 0, TAU, true);
    plateShape.holes.push(hole);
  }
  const plate = new THREE.Group();
  const plateGeo = new THREE.ExtrudeGeometry(plateShape, {
    depth: 0.05,
    bevelEnabled: true,
    bevelSize: 0.003,
    bevelThickness: 0.003,
    bevelSegments: 2,
    curveSegments: 48,
    steps: 1,
  });
  plate.add(mesh(plateGeo, blackSteel));
  for (let row = -4; row <= 4; row++)
    for (let col = -4; col <= 4; col++) {
      const x = col * 0.19 + (row % 2) * 0.095,
        y = row * 0.17;
      if (Math.hypot(x, y) > 0.87 || gears.some(([gx, gy, r]) => Math.hypot(x - gx, y - gy) < r * 0.46 + 0.074))
        continue;
      for (let k = 0; k < 3; k++) {
        const etch = torus(0.058 + k * 0.005, 0.0008, engravingSteel);
        etch.position.set(x, y, 0.054);
        plate.add(etch);
      }
    }
  for (const [x, y, r] of gears) {
    const bearing = rim(r * 0.49, r * 0.455, 0.012, 'titanium');
    bearing.position.set(x, y, 0.055);
    plate.add(bearing);
  }
  watch.part('Platina negra calada y perlada', plate, [0, 0, -0.092], [0, 0, 0.55]);
  const dial = new THREE.Group();
  dial.add(rim(1.024, 0.858, 0.035, blackSteel));
  for (const r of [0.864, 1.014]) {
    const edge = torus(r, 0.0045, 'silver');
    edge.position.z = 0.028;
    dial.add(edge);
  }
  for (let i = 0; i < 60; i++) {
    const a = (i * TAU) / 60,
      major = i % 5 === 0;
    const tick = box(major ? 0.047 : 0.008, major ? 0.13 : 0.031, major ? 0.031 : 0.009, 'silver', 0.004);
    tick.position.set(Math.sin(a) * 0.951, Math.cos(a) * 0.951, 0.03);
    tick.rotation.z = -a;
    dial.add(tick);
    if (major) {
      const fill = box(0.015, 0.075, 0.004, 'mint', 0.002);
      fill.position.copy(tick.position);
      fill.position.z += 0.018;
      fill.rotation.z = -a;
      dial.add(fill);
    }
  }
  const cartouche = box(0.63, 0.099, 0.012, blackSteel, 0.012);
  cartouche.position.set(0, 0.7, 0.038);
  dial.add(cartouche);
  const brand = engraving('H A R D T E C H', 0.57, 0.082, '#d5dad0');
  brand.position.set(0, 0.7, 0.047);
  dial.add(brand);
  watch.part('Índices aplicados y minutería', dial, [0, 0, 0.143], [0, 0, 2.45]);

  function gear(radius, teeth, material) {
    const shape = new THREE.Shape();
    for (let j = 0; j < teeth * 4; j++) {
      const a = (j / (teeth * 4)) * TAU,
        r = radius * (j % 4 === 1 || j % 4 === 2 ? 1 : 0.88);
      j ? shape.lineTo(Math.cos(a) * r, Math.sin(a) * r) : shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    shape.closePath();
    const hole = new THREE.Path();
    hole.absarc(0, 0, radius * 0.7, 0, TAU, true);
    shape.holes.push(hole);
    const g = new THREE.Group(),
      geo = new THREE.ExtrudeGeometry(shape, {
        depth: 0.033,
        bevelEnabled: true,
        bevelSize: 0.0045,
        bevelThickness: 0.0045,
        bevelSegments: 2,
        steps: 1,
        curveSegments: 40,
      });
    g.add(mesh(geo, material));
    // Five spokes extend from the hub, rather than five crossing diameters.
    // Raised rims and recessed centres catch separate highlights when rotated.
    for (let i = 0; i < 5; i++) {
      const spoke = box(radius * 0.095, radius * 0.61, 0.025, satin, 0.006),
        a = (i * TAU) / 5;
      spoke.position.set(Math.sin(a) * radius * 0.43, Math.cos(a) * radius * 0.43, 0.017);
      spoke.rotation.z = -a;
      g.add(spoke);
    }
    for (const r of [radius * 0.72, radius * 0.86]) {
      const chamfer = torus(r, 0.0045, polish);
      chamfer.position.z = 0.037;
      g.add(chamfer);
    }
    g.add(disk(radius * 0.2, 0.055, satin));
    const hub = torus(radius * 0.17, 0.006, polish);
    hub.position.z = 0.032;
    g.add(hub);
    const jewel = disk(Math.min(0.023, radius * 0.105), 0.064, m.ruby);
    g.add(jewel);
    return g;
  }
  m.ruby = new THREE.MeshPhysicalMaterial({ color: '#4a061d', metalness: 0.25, roughness: 0.09, clearcoat: 1 });
  gears.forEach(([x, y, r, teeth], i) => {
    const part = watch.part(
      'Rueda del movimiento ' + (i + 1),
      gear(r, teeth, polish),
      [x, y, 0.008 + (i % 3) * 0.025],
      [x * 0.12, y * 0.12, 0.88 + (i % 3) * 0.3],
    );
    part.userData.gear = true;
  });
  const bridge = new THREE.Group();
  for (const [x, y, w, h, a] of [
    [-0.26, 0.21, 0.105, 1.23, -0.58],
    [0.32, -0.17, 0.093, 1.06, 0.77],
    [-0.3, -0.46, 0.082, 0.71, 1.16],
  ]) {
    const arm = box(w, h, 0.061, 'silver', 0.035);
    arm.position.set(x, y, 0.015);
    arm.rotation.z = a;
    bridge.add(arm);
    const face = box(w * 0.59, h - 0.032, 0.004, satin, 0.02);
    face.position.set(x, y, 0.049);
    face.rotation.z = a;
    bridge.add(face);
  }
  for (const [x, y] of [
    [-0.57, 0.61],
    [0.06, -0.13],
    [0.65, 0.1],
    [-0.02, -0.59],
    [-0.6, -0.62],
  ]) {
    const boss = disk(0.063, 0.034, 'silver');
    boss.position.set(x, y, 0.023);
    bridge.add(boss);
    const head = disk(0.032, 0.019, 'titanium');
    head.position.set(x, y, 0.051);
    bridge.add(head);
    const slot = box(0.039, 0.006, 0.004, 'dark', 0.001);
    slot.position.set(x, y, 0.063);
    slot.rotation.z = 0.5;
    bridge.add(slot);
  }
  watch.part('Puentes biselados', bridge, [0, 0, 0.105], [0, 0, 1.82]);
  const balance = new THREE.Group();
  balance.add(torus(0.225, 0.018, 'gold'));
  for (let i = 0; i < 8; i++) {
    const spring = torus(0.051 + i * 0.019, 0.0025, 'silver');
    spring.position.z = 0.016;
    balance.add(spring);
  }
  const arbor = box(0.03, 0.42, 0.018, 'silver', 0.01);
  arbor.rotation.z = 0.6;
  balance.add(arbor);
  balance.add(disk(0.029, 0.047, m.ruby));
  watch.part('Volante y espiral', balance, [-0.41, -0.36, 0.139], [-0.08, -0.04, 2.12]);
  function hand(length, width, angle, mat) {
    const g = new THREE.Group(),
      shape = new THREE.Shape();
    shape.moveTo(-width * 0.28, -length * 0.16);
    shape.lineTo(-width * 0.65, length * 0.22);
    shape.lineTo(-width * 0.36, length * 0.74);
    shape.lineTo(0, length * 0.91);
    shape.lineTo(width * 0.36, length * 0.74);
    shape.lineTo(width * 0.65, length * 0.22);
    shape.lineTo(width * 0.28, -length * 0.16);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.017,
      bevelEnabled: true,
      bevelSize: 0.0035,
      bevelThickness: 0.0035,
      bevelSegments: 2,
      steps: 1,
    });
    g.add(mesh(geo, mat));
    const lumen = box(width * 0.26, length * 0.42, 0.003, 'mint', 0.003);
    lumen.position.set(0, length * 0.42, 0.025);
    g.add(lumen);
    g.rotation.z = angle;
    return g;
  }
  watch.part('Aguja horaria', hand(0.53, 0.052, 0.75, 'silver'), [0, 0, 0.206], [0, 0, 2.67]);
  watch.part('Aguja minutera', hand(0.79, 0.035, -0.88, 'silver'), [0, 0, 0.239], [0, 0, 2.82]);
  const seconds = new THREE.Group();
  const needle = box(0.01, 1.02, 0.009, 'silver', 0.003);
  needle.position.y = 0.31;
  seconds.add(needle);
  const counterweight = torus(0.038, 0.008, 'silver');
  counterweight.position.y = -0.17;
  seconds.add(counterweight);
  const tip = box(0.012, 0.11, 0.01, 'mint', 0.002);
  tip.position.y = 0.79;
  seconds.add(tip);
  seconds.rotation.z = 0.12;
  watch.part('Segundero', seconds, [0, 0, 0.265], [0, 0, 2.95]);
  watch.part('Eje central', disk(0.059, 0.04, 'silver'), [0, 0, 0.275], [0, 0, 3.15]);
  const sapphire = new THREE.MeshPhysicalMaterial({
    color: '#f0f3ee',
    metalness: 0,
    roughness: 0.018,
    transparent: true,
    opacity: 0.034,
    depthWrite: false,
    clearcoat: 0.12,
    clearcoatRoughness: 0.02,
    envMapIntensity: 0.3,
  });
  watch.part('Cristal de zafiro', mesh(cylinderGeometry(1.038, 0.028), sapphire), [0, 0, 0.303], [0, 0, 3.4]);
  watch.part('Junta estanca', rim(1.055, 1.025, 0.025, 'rubber'), [0, 0, 0.18], [0, 0, 2.27]);
  const back = new THREE.Group();
  back.add(rim(1.11, 0.73, 0.09, 'silver'));
  back.add(disk(0.73, 0.025, 'glass'));
  watch.part('Fondo de exposición', back, [0, 0, -0.232], [0, 0, -0.86]);
  for (let j = 0; j < 6; j++) {
    const a = (j * TAU) / 6;
    screw(watch, 'Tornillo de fondo ' + (j + 1), Math.sin(a) * 0.95, Math.cos(a) * 0.95, -0.288, [
      Math.sin(a) * 0.13,
      Math.cos(a) * 0.13,
      -1.05,
    ]);
  }
  const crown = new THREE.Group();
  crown.add(disk(0.155, 0.2, 'silver'));
  for (let j = 0; j < 40; j++) {
    const a = (j * TAU) / 40,
      ridge = box(0.012, 0.022, 0.18, 'silver', 0.002);
    ridge.position.set(Math.sin(a) * 0.156, Math.cos(a) * 0.156, 0);
    ridge.rotation.z = -a;
    crown.add(ridge);
  }
  crown.rotation.y = Math.PI / 2;
  watch.part('Corona estriada', crown, [1.28, 0, 0], [0.6, 0, 0.05]);
  function linkBlock(width, length, depth, brushed) {
    // A convex section rolls the specular highlight across each real link.
    // Extruded chamfers join the curved crown to polished side facets.
    const shape = new THREE.Shape();
    shape.moveTo(-length * 0.47, -depth * 0.36);
    shape.lineTo(-length * 0.5, -depth * 0.15);
    for (let i = 0; i <= 12; i++) {
      const y = (-0.46 + (i / 12) * 0.92) * length,
        z = depth * (0.1 + 0.44 * Math.cos((Math.PI * y) / length));
      shape.lineTo(y, z);
    }
    shape.lineTo(length * 0.5, -depth * 0.15);
    shape.lineTo(length * 0.47, -depth * 0.36);
    shape.lineTo(-length * 0.47, -depth * 0.36);
    shape.closePath();
    const bevel = 0.012,
      geo = new THREE.ExtrudeGeometry(shape, {
        depth: width - bevel * 2,
        bevelEnabled: true,
        bevelSize: 0.009,
        bevelThickness: bevel,
        bevelSegments: 3,
        steps: 1,
        curveSegments: 12,
      });
    geo.translate(0, 0, -width / 2 + bevel);
    geo.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1));
    const group = new THREE.Group();
    group.add(mesh(geo, polish));
    if (brushed) {
      const positions = [],
        uv = [],
        indices = [];
      for (let j = 0; j <= 12; j++)
        for (let i = 0; i < 2; i++) {
          const x = (i - 0.5) * (width - 0.035),
            y = (-0.4 + (j / 12) * 0.8) * length,
            z = depth * (0.1 + 0.44 * Math.cos((Math.PI * y) / length)) + 0.01;
          positions.push(x, y, z);
          uv.push(i, j / 12);
        }
      for (let j = 0; j < 12; j++) {
        const a = j * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      const face = new THREE.BufferGeometry();
      face.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      face.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      face.setIndex(indices);
      face.computeVertexNormals();
      group.add(mesh(face, satin));
    }
    return group;
  }
  for (let j = 0; j < 24; j++) {
    const theta = 0.8 + ((TAU - 1.6) * (j + 0.5)) / 24,
      link = new THREE.Group(),
      taper = 0.87 + 0.13 * Math.abs(Math.cos(((theta - 0.8) / (TAU - 1.6)) * Math.PI));
    for (const x of [-0.414, 0.414]) {
      const flank = linkBlock(0.325 * taper, 0.255, 0.17, true);
      flank.position.x = x * taper;
      link.add(flank);
    }
    const center = linkBlock(0.455 * taper, 0.272, 0.186, false);
    center.position.set(0, 0.012, 0.016);
    link.add(center);
    for (const x of [-0.587, 0.587]) {
      const pin = disk(0.023, 0.015, satin);
      pin.rotation.y = Math.PI / 2;
      pin.position.set(x * taper, 0, -0.012);
      link.add(pin);
    }
    link.rotation.x = -Math.atan2(1.24 * Math.sin(theta), 1.54 * Math.cos(theta));
    watch.part(
      'Eslabón articulado ' + String(j + 1).padStart(2, '0'),
      link,
      [0, Math.sin(theta) * 1.54, -0.95 + Math.cos(theta) * 1.24],
      [0, Math.sin(theta) * 0.13, Math.cos(theta) * 0.13],
    );
  }
  return watch;
}
function cylinderGeometry(r, d) {
  const g = new THREE.CylinderGeometry(r, r, d, 128);
  g.rotateX(Math.PI / 2);
  return g;
}
