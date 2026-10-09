// Catálogo de productos (PRODUCTS) y construcción de sus modelos 3D por piezas
// (createProductModels), incluido el reloj desmontable.
import * as THREE from 'three';
import { batchDetails } from './product-geometry.js';
import { buildChronograph } from './chronograph.js';
import { measureModel } from './loaded-model.js';

// Original conceptual models. Every assembly has named, independently moving
// physical modules; no flat images are swapped when the product is opened.
export const PRODUCTS = [
  { id: 'watch', name: 'Reloj', icon: 'watch' },
  { id: 'headphones', name: 'Auriculares', icon: 'audio' },
  { id: 'camera', name: 'Cámara', icon: 'camera' },
  { id: 'speaker', name: 'Altavoz', icon: 'speaker' },
  { id: 'avatar', name: 'Avatar', icon: 'avatar' },
];
// Built-in models a catalog item can name with "model" (docs/contracts.md §5).
export const BUILT_IN_MODELS = PRODUCTS.filter(p => p.id !== 'avatar').map(p => p.id);
// Default collection when the catalog cannot be loaded: the same five experiences as always.
export const DEFAULT_CATALOG = {
  version: 1,
  collections: [
    {
      slug: 'coleccion',
      name: 'Colección',
      start: true,
      items: PRODUCTS.map(p =>
        p.id === 'avatar'
          ? { id: p.id, type: 'avatar', name: p.name, icon: p.icon }
          : { id: p.id, type: 'model', name: p.name, model: p.id, icon: p.icon },
      ),
    },
  ],
};
const TAU = Math.PI * 2;
function roundedPath(w, h, r, Path = THREE.Shape) {
  const s = new Path(),
    x = -w / 2,
    y = -h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
function rounded(w, h, d, r = 0.15, hole = null) {
  const shape = roundedPath(w, h, r);
  if (hole) shape.holes.push(roundedPath(hole[0], hole[1], hole[2], THREE.Path));
  const bevel = Math.min(0.028, d / 4);
  const small = Math.max(w, h, d) < 0.4;
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: d - bevel * 2,
    bevelEnabled: true,
    bevelSegments: small ? 2 : 3,
    steps: 1,
    bevelSize: bevel,
    bevelThickness: bevel,
    curveSegments: small ? 4 : 12,
  });
  g.translate(0, 0, -d / 2 + bevel);
  g.computeVertexNormals();
  return g;
}
const cylinder = (radius, depth, inner = radius) => {
  const g = new THREE.CylinderGeometry(radius, inner, depth, 64);
  g.rotateX(Math.PI / 2);
  return g;
};

export function createProductModels() {
  const material = (color, metalness = 0.4, roughness = 0.3) =>
    new THREE.MeshStandardMaterial({ color, metalness, roughness });
  const brushed = new Uint8Array(256 * 128 * 4);
  let seed = 19;
  for (let y = 0; y < 128; y++)
    for (let x = 0; x < 256; x++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const v = 210 + Math.sin(y * 1.93) * 17 + (seed % 13);
      brushed.set([v, v, v, 255], (y * 256 + x) * 4);
    }
  const brush = new THREE.DataTexture(brushed, 256, 128);
  brush.wrapS = brush.wrapT = THREE.RepeatWrapping;
  brush.repeat.set(2, 8);
  brush.generateMipmaps = true;
  brush.minFilter = THREE.LinearMipmapLinearFilter;
  brush.magFilter = THREE.LinearFilter;
  brush.needsUpdate = true;
  // Some merged procedural UVs have degenerate tangents. Anisotropy produces
  // non-finite fragments there, which bloom spreads over the frame. The brush
  // texture remains; isotropic specular reflections keep every fragment finite.
  const metal = (color, roughness) =>
    new THREE.MeshPhysicalMaterial({
      color,
      metalness: 1,
      roughness,
      roughnessMap: brush,
      anisotropy: 0,
      clearcoat: 0.16,
      clearcoatRoughness: 0.1,
      envMapIntensity: 1.12,
    });
  // Neutral steel, polished rhodium edges and graphite create material contrast
  // without painting the collection blue. Green is reserved for tiny indicators.
  const m = {
    titanium: metal('#b5b6b3', 0.23),
    silver: metal('#eceee9', 0.115),
    dark: new THREE.MeshPhysicalMaterial({
      color: '#111411',
      metalness: 0.78,
      roughness: 0.31,
      clearcoat: 0.18,
      clearcoatRoughness: 0.2,
      envMapIntensity: 0.85,
    }),
    rubber: material('#10120f', 0, 0.72),
    glass: new THREE.MeshPhysicalMaterial({
      color: '#030805',
      metalness: 0.12,
      roughness: 0.075,
      clearcoat: 0.35,
      clearcoatRoughness: 0.035,
      envMapIntensity: 0.75,
    }),
    gold: metal('#d9dad4', 0.17),
    board: material('#152b1c', 0.3, 0.45),
    battery: material('#282a27', 0.83, 0.36),
    white: metal('#e0e2dc', 0.21),
    mint: new THREE.MeshStandardMaterial({
      color: '#b4e996',
      emissive: '#66bf49',
      emissiveIntensity: 0.2,
      roughness: 0.32,
      metalness: 0.35,
    }),
    blue: new THREE.MeshPhysicalMaterial({
      color: '#0a1810',
      metalness: 0.4,
      roughness: 0.1,
      clearcoat: 0.7,
      iridescence: 0.08,
      iridescenceIOR: 1.35,
    }),
  };
  for (const [role, mat] of Object.entries(m)) mat.userData.role = role;
  const mesh = (g, mat) => new THREE.Mesh(g, m[mat] ?? mat);
  const box = (w, h, d, mat, r = 0.06) => mesh(rounded(w, h, d, r), mat);
  const disk = (r, d, mat) => mesh(cylinder(r, d), mat);
  const torus = (r, t, mat) =>
    mesh(new THREE.TorusGeometry(r, t, t < 0.012 ? 6 : 12, r < 0.08 ? 32 : r < 0.25 ? 48 : 80), mat);
  const sphere = (x, y, z, mat) => {
    const o = mesh(new THREE.SphereGeometry(1, 40, 24), mat);
    o.scale.set(x, y, z);
    return o;
  };
  function model(id) {
    const group = new THREE.Group(),
      parts = [];
    function part(name, node, at, travel) {
      node = batchDetails(node);
      const wrapper = new THREE.Group();
      wrapper.name = name;
      wrapper.add(node);
      wrapper.position.fromArray(at);
      group.add(wrapper);
      const entry = {
        name,
        node: wrapper,
        base: new THREE.Vector3(...at),
        travel: new THREE.Vector3(...travel),
        materials: [],
      };
      node.traverse(o => {
        if (o.isMesh) {
          o.material = o.material.clone();
          entry.materials.push(o.material);
          o.userData.part = entry;
        }
      });
      parts.push(entry);
      return wrapper;
    }
    return { id, group, parts, part };
  }
  function screw(parent, name, x, y, z, travel) {
    const g = new THREE.Group(),
      body = disk(0.046, 0.036, 'silver');
    g.add(body);
    const slot = box(0.05, 0.009, 0.008, 'dark', 0.003);
    slot.position.z = 0.023;
    g.add(slot);
    const cross = slot.clone();
    cross.rotation.z = Math.PI / 2;
    g.add(cross);
    const shank = disk(0.021, 0.17, 'titanium');
    shank.position.z = -0.098;
    g.add(shank);
    for (let i = 0; i < 7; i++) {
      const thread = torus(0.021, 0.004, 'silver');
      thread.position.z = -0.04 - i * 0.021;
      g.add(thread);
    }
    parent.part(name, g, [x, y, z], travel);
  }
  function circuit(w, h) {
    const g = new THREE.Group();
    g.add(box(w, h, 0.065, 'board'));
    for (let i = 0; i < 7; i++) {
      const chip = box(0.13 + (i % 2) * 0.12, 0.12, 0.045, 'dark', 0.016);
      chip.position.set(((i % 3) - 1) * w * 0.27, (Math.floor(i / 3) - 1) * h * 0.28, 0.05);
      g.add(chip);
      for (let side of [-1, 1])
        for (let pin = 0; pin < 5; pin++) {
          const contact = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.008, 0.018), m.gold);
          contact.position
            .copy(chip.position)
            .add(new THREE.Vector3(side * (0.1 + (i % 2) * 0.06), (pin - 2) * 0.02, 0));
          g.add(contact);
        }
      const y = (i - 3) * h * 0.115;
      const points = [
        [-w * 0.43, y, 0.036],
        [-w * 0.2, y, 0.036],
        [-w * 0.13, y + 0.055, 0.036],
        [w * 0.23, y + 0.055, 0.036],
        [w * 0.3, y, 0.036],
        [w * 0.44, y, 0.036],
      ];
      const track = new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(
          points.map(p => new THREE.Vector3(...p)),
          false,
          'catmullrom',
          0,
        ),
        14,
        0.003,
        4,
        false,
      );
      g.add(mesh(track, 'gold'));
    }
    for (let i = 0; i < 16; i++) {
      const pad = disk(0.021, 0.009, 'gold');
      pad.position.set(((i % 4) - 1.5) * w * 0.2, (Math.floor(i / 4) - 1.5) * h * 0.21, 0.038);
      g.add(pad);
    }
    return g;
  }
  function engraving(text, w, h, color = '#858b81') {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.font = '500 42px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 64);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({
      map,
      transparent: true,
      depthWrite: false,
      roughness: 0.35,
      metalness: 0.35,
    });
    mat.userData.role = 'engraving:' + text;
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  }
  const watch = buildChronograph({ model, m, mesh, box, disk, torus, screw, engraving });

  const headphones = model('headphones');
  const archShape = new THREE.Shape();
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI,
      x = Math.cos(a) * 1.31,
      y = 0.18 + Math.sin(a) * 1.75;
    i ? archShape.lineTo(x, y) : archShape.moveTo(x, y);
  }
  for (let i = 64; i >= 0; i--) {
    const a = (i / 64) * Math.PI;
    archShape.lineTo(Math.cos(a) * 1.23, 0.18 + Math.sin(a) * 1.64);
  }
  archShape.closePath();
  const archGeo = new THREE.ExtrudeGeometry(archShape, {
    depth: 0.19,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: 0.018,
    bevelThickness: 0.018,
    steps: 1,
    curveSegments: 48,
  });
  archGeo.translate(0, 0, -0.095);
  const arch = new THREE.Group();
  arch.add(mesh(archGeo, 'silver'));
  for (const z of [-0.105, 0.105]) {
    const spine = Array.from({ length: 49 }, (_, i) => {
      const a = (i / 48) * Math.PI;
      return new THREE.Vector3(Math.cos(a) * 1.285, 0.18 + Math.sin(a) * 1.724, z);
    });
    arch.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(spine), 64, 0.007, 6, false), 'titanium'));
  }
  headphones.part('Diadema de acero laminado', arch, [0, 0, 0], [0, 0.8, 0]);
  const cushionPoints = Array.from({ length: 35 }, (_, i) => {
    const a = 0.35 + (i / 34) * (Math.PI - 0.7);
    return new THREE.Vector3(Math.cos(a) * 1.2, 0.17 + Math.sin(a) * 1.61, 0.015);
  });
  headphones.part(
    'Almohadilla superior',
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cushionPoints), 48, 0.13, 14, false), 'rubber'),
    [0, 0, 0],
    [0, 0.32, 0.4],
  );
  for (const side of [-1, 1]) {
    const suffix = side < 0 ? 'izquierdo' : 'derecho',
      x = side * 1.23;
    const shell = new THREE.Group();
    shell.add(box(0.95, 1.42, 0.31, 'silver', 0.45));
    const back = box(0.84, 1.31, 0.024, 'titanium', 0.39);
    back.position.z = -0.171;
    shell.add(back);
    for (let j = 0; j < 9; j++) {
      const vent = box(0.029, 0.12, 0.008, 'dark', 0.012);
      vent.position.set((j - 4) * 0.048, -0.46, -0.19);
      shell.add(vent);
    }
    for (const y of [-0.5, 0.5])
      for (const xx of [-0.26, 0.26]) {
        const head = disk(0.02, 0.008, 'silver');
        head.position.set(xx, y, -0.189);
        shell.add(head);
      }
    const inscription = engraving('H A R D T E C H', 0.52, 0.082, '#686e64');
    inscription.position.set(0, 0.14, -0.189);
    inscription.rotation.y = Math.PI;
    shell.add(inscription);
    headphones.part('Carcasa mecanizada ' + suffix, shell, [x, -0.37, -0.1], [side * 0.95, 0, -0.9]);
    const badge = new THREE.Group();
    badge.add(disk(0.125, 0.01, 'gold'));
    for (let j = 0; j < 8; j++) badge.add(torus(0.03 + j * 0.012, 0.0015, 'titanium'));
    headphones.part('Disco torneado ' + suffix, badge, [x, -0.58, -0.287], [side * 0.95, 0, -1.35]);
    const plate = new THREE.Group();
    plate.add(box(0.7, 1.13, 0.09, 'titanium', 0.34));
    headphones.part('Soporte ' + suffix, plate, [x, -0.37, 0.13], [side * 0.42, 0, -0.25]);
    headphones.part('Electrónica ' + suffix, circuit(0.57, 0.76), [x, -0.35, 0.14], [side * 0.42, 0.28, 0.3]);
    headphones.part('Imán ' + suffix, disk(0.3, 0.13, 'gold'), [x, -0.4, 0.23], [side * 0.42, 0, 0.66]);
    const coil = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const wire = torus(0.23 + i * 0.006, 0.004, 'gold');
      wire.position.z = i * 0.003;
      coil.add(wire);
    }
    headphones.part('Bobina de voz ' + suffix, coil, [x, -0.4, 0.29], [side * 0.5, 0, 0.96]);
    const cone = new THREE.Group(),
      membrane = disk(0.43, 0.045, 'dark');
    membrane.scale.y = 1.27;
    cone.add(membrane);
    for (let j = 0; j < 5; j++) {
      const corrugation = torus(0.27 + j * 0.032, 0.008, 'dark');
      corrugation.scale.y = 1.27;
      corrugation.position.z = 0.03;
      cone.add(corrugation);
    }
    const dustCap = sphere(0.15, 0.19, 0.028, 'titanium');
    dustCap.position.z = 0.028;
    cone.add(dustCap);
    headphones.part('Diafragma ' + suffix, cone, [x, -0.37, 0.31], [side * 0.55, 0, 1.33]);
    const pad = new THREE.Group(),
      cushion = torus(0.42, 0.1, 'rubber');
    cushion.scale.y = 1.43;
    pad.add(cushion);
    const rim = torus(0.51, 0.022, 'gold');
    rim.scale.y = 1.31;
    rim.position.z = -0.065;
    pad.add(rim);
    for (let i = 0; i < 54; i++) {
      const a = (i * TAU) / 54,
        stitch = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.02, 0.005), m.titanium);
      stitch.position.set(Math.sin(a) * 0.47, Math.cos(a) * 0.65, 0.06);
      stitch.rotation.z = -a;
      pad.add(stitch);
    }
    headphones.part('Almohadilla cosida ' + suffix, pad, [x, -0.37, 0.39], [side * 0.55, 0, 1.93]);
    const joint = box(0.13, 0.73, 0.12, 'silver', 0.065);
    joint.rotation.z = side * -0.14;
    headphones.part('Brazo ' + suffix, joint, [x, 0.27, 0], [side * 0.9, 0.36, 0]);
  }
  // The first view presents machined outer cups. Their complete acoustic stack
  // stays visible from the opposite side and opens along its physical axis.
  for (const part of headphones.parts) {
    part.base.x *= -1;
    part.base.z *= -1;
    part.travel.x *= -1;
    part.travel.z *= -1;
    part.node.position.copy(part.base);
    part.node.rotation.y = Math.PI;
  }

  const camera = model('camera');
  const opticX = -0.18,
    opticY = 0.02;
  const annulus = (outer, inner, depth, mat) => {
    const profile = [
      [inner, -depth / 2],
      [outer - 0.018, -depth / 2],
      [outer, -depth / 2 + 0.018],
      [outer, depth / 2 - 0.018],
      [outer - 0.018, depth / 2],
      [inner, depth / 2],
      [inner, -depth / 2],
    ];
    const geo = new THREE.LatheGeometry(
      profile.map(([r, z]) => new THREE.Vector2(r, z)),
      96,
    );
    geo.rotateX(Math.PI / 2);
    return mesh(geo, mat);
  };
  const knurled = (radius, depth, count = 80) => {
    const g = new THREE.Group();
    g.add(disk(radius - 0.012, depth, 'titanium'));
    for (let i = 0; i < count; i++) {
      const a = (i * TAU) / count,
        ridge = box(0.008, 0.018, depth * 0.83, 'silver', 0.002);
      ridge.position.set(Math.sin(a) * radius, Math.cos(a) * radius, 0);
      ridge.rotation.z = -a;
      g.add(ridge);
    }
    return g;
  };
  const housing = new THREE.Group();
  housing.add(mesh(rounded(2.52, 1.48, 0.73, 0.15, [2.31, 1.27, 0.1]), 'silver'));
  for (const z of [-0.26, 0.25]) {
    const seam = mesh(rounded(2.5, 1.46, 0.016, 0.145, [2.43, 1.39, 0.12]), 'titanium');
    seam.position.z = z;
    housing.add(seam);
  }
  camera.part('Chasis monobloque', housing, [0, 0.05, -0.08], [0, 0, -0.25]);
  const front = new THREE.Group();
  front.add(box(2.38, 1.34, 0.095, 'titanium', 0.12));
  const signature = engraving('H A R D T E C H', 0.59, 0.075, '#62675e');
  signature.position.set(0.72, 0.48, 0.051);
  front.add(signature);
  camera.part('Placa frontal satinada', front, [0, 0.05, 0.3], [0, 0, 0.43]);
  camera.part('Tapa posterior', box(2.38, 1.34, 0.085, 'titanium', 0.12), [0, 0.05, -0.49], [0, 0, -1.35]);
  camera.part('Procesador de imagen', circuit(2.12, 1.06), [0, 0.05, -0.25], [0, 0, -0.87]);
  camera.part(
    'Sensor de formato completo',
    box(0.58, 0.4, 0.065, 'blue', 0.018),
    [opticX, opticY, -0.02],
    [0, 0, -0.4],
  );
  const barrel = new THREE.Group();
  barrel.add(annulus(0.658, 0.554, 0.26, 'titanium'));
  for (const z of [-0.125, 0.125]) {
    const lip = torus(0.643, 0.014, 'silver');
    lip.position.z = z;
    barrel.add(lip);
  }
  for (let i = 0; i < 96; i++) {
    const a = (i * TAU) / 96,
      ridge = box(0.009, 0.018, 0.15, 'silver', 0.002);
    ridge.position.set(Math.sin(a) * 0.661, Math.cos(a) * 0.661, 0);
    ridge.rotation.z = -a;
    barrel.add(ridge);
  }
  for (let i = 0; i < 12; i++) {
    const a = (i * TAU) / 12,
      tick = box(0.009, 0.045, 0.004, 'dark', 0.001);
    tick.position.set(Math.sin(a) * 0.599, Math.cos(a) * 0.599, 0.139);
    tick.rotation.z = -a;
    barrel.add(tick);
  }
  camera.part('Anillo de enfoque mecanizado', barrel, [opticX, opticY, 0.49], [0, 0, 0.95]);
  const aperture = new THREE.Group();
  aperture.add(annulus(0.53, 0.19, 0.025, 'titanium'));
  for (let i = 0; i < 9; i++) {
    const blade = box(0.18, 0.35, 0.009, 'dark', 0.025),
      a = (i * TAU) / 9;
    blade.position.set(Math.sin(a) * 0.27, Math.cos(a) * 0.27, i * 0.0018);
    blade.rotation.z = -a + 0.61;
    aperture.add(blade);
  }
  camera.part('Iris de nueve láminas', aperture, [opticX, opticY, 0.36], [0, 0, 0.57]);
  camera.part('Elemento óptico posterior', disk(0.5, 0.05, 'blue'), [opticX, opticY, 0.42], [0, 0, 1.32]);
  camera.part('Separador óptico', annulus(0.54, 0.5, 0.065, 'dark'), [opticX, opticY, 0.48], [0, 0, 1.65]);
  const optic = new THREE.Group();
  optic.add(sphere(0.492, 0.492, 0.052, 'glass'));
  const opticalCoating = torus(0.453, 0.003, 'titanium');
  opticalCoating.position.z = 0.036;
  optic.add(opticalCoating);
  camera.part('Elemento óptico frontal', optic, [opticX, opticY, 0.573], [0, 0, 2.05]);
  camera.part('Bisel del objetivo', annulus(0.586, 0.503, 0.048, 'silver'), [opticX, opticY, 0.632], [0, 0, 2.37]);
  const flex = box(0.23, 0.62, 0.012, 'gold', 0.012);
  flex.rotation.z = 0.24;
  camera.part('Conexión flexible del sensor', flex, [0.46, 0.02, -0.13], [0.72, 0, -0.5]);
  camera.part('Indicador de estado', disk(0.024, 0.011, 'mint'), [0.94, 0.38, 0.367], [0.3, 0.32, 0.66]);
  const topCover = box(2.23, 0.105, 0.65, 'silver', 0.065);
  camera.part('Placa de mandos', topCover, [0, 0.78, -0.06], [0, 0.54, 0]);
  const dial = knurled(0.24, 0.1, 64);
  dial.rotation.x = Math.PI / 2;
  camera.part('Selector estriado', dial, [-0.77, 0.89, -0.08], [-0.2, 1.02, 0]);
  const shutter = new THREE.Group();
  shutter.add(knurled(0.135, 0.095, 48));
  const button = disk(0.099, 0.021, 'silver');
  button.position.z = 0.06;
  shutter.add(button);
  shutter.rotation.x = -Math.PI / 2;
  camera.part('Pulsador de disparo', shutter, [0.83, 0.88, -0.02], [0.21, 0.85, 0]);
  const grip = new THREE.Group();
  grip.add(box(0.37, 1.17, 0.115, 'dark', 0.1));
  for (let j = 0; j < 11; j++) {
    const flute = box(0.014, 0.95, 0.008, 'titanium', 0.006);
    flute.position.set((j - 5) * 0.024, 0, 0.061);
    grip.add(flute);
  }
  camera.part('Empuñadura estriada', grip, [0.99, -0.03, 0.385], [0.8, 0, 0.56]);
  const display = new THREE.Group();
  display.add(box(1.65, 0.98, 0.04, 'dark', 0.06));
  const screen = box(1.48, 0.8, 0.01, 'glass', 0.025);
  screen.position.z = -0.032;
  display.add(screen);
  camera.part('Visor posterior', display, [-0.19, 0.07, -0.56], [0, 0, -1.81]);
  for (const x of [-1.05, 1.05])
    for (const y of [-0.48, 0.58]) screw(camera, 'Tornillo de chasis', x, y, -0.55, [x * 0.25, 0, -2.1]);

  const speaker = model('speaker');
  // The grille is genuinely perforated by an alpha-tested mask, so the opened
  // sleeve reveals the acoustic components through its holes. Fine stamped
  // apertures replace the coarse decorative diamonds of the previous model.
  const perforationPixels = new Uint8Array(64 * 64 * 4);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const row = Math.floor(y / 32),
        cx = 16 + (row % 2) * 16,
        dx = Math.min(Math.abs(x - cx), Math.abs(x - cx - 32), Math.abs(x - cx + 32)),
        dy = (y % 32) - 16;
      const v = Math.hypot(dx, dy) < 9 ? 0 : 255;
      perforationPixels.set([v, v, v, 255], (y * 64 + x) * 4);
    }
  const perforations = new THREE.DataTexture(perforationPixels, 64, 64);
  perforations.wrapS = perforations.wrapT = THREE.RepeatWrapping;
  perforations.repeat.set(36, 16);
  perforations.generateMipmaps = true;
  perforations.minFilter = THREE.LinearMipmapLinearFilter;
  perforations.needsUpdate = true;
  const grilleMetal = m.titanium.clone();
  grilleMetal.alphaMap = perforations;
  grilleMetal.alphaTest = 0.42;
  grilleMetal.side = THREE.DoubleSide;
  grilleMetal.roughness = 0.28;
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.93, 0.93, 2.36, 96, 1, true), grilleMetal);
  const jacket = new THREE.Group();
  jacket.add(sleeve);
  for (const y of [-1.17, 1.17]) {
    const edge = torus(0.935, 0.025, 'silver');
    edge.rotation.x = Math.PI / 2;
    edge.position.y = y;
    jacket.add(edge);
  }
  const seam = box(0.035, 2.31, 0.012, 'silver', 0.009);
  seam.position.z = -0.935;
  jacket.add(seam);
  speaker.part('Rejilla acústica', jacket, [0, 0, 0], [1.57, 0, 0]);
  const backingMaterial = m.dark.clone();
  backingMaterial.side = THREE.DoubleSide;
  speaker.part(
    'Malla acústica interior',
    new THREE.Mesh(new THREE.CylinderGeometry(0.899, 0.899, 2.29, 80, 1, true), backingMaterial),
    [0, 0, 0],
    [-1.57, 0, -0.25],
  );
  const top = new THREE.Group();
  top.add(disk(0.93, 0.1, 'titanium'));
  const touch = disk(0.78, 0.012, 'dark');
  touch.position.z = 0.058;
  top.add(touch);
  const bevel = torus(0.866, 0.012, 'silver');
  bevel.position.z = 0.051;
  top.add(bevel);
  for (const x of [-0.31, 0.31]) {
    const line = box(0.09, 0.014, 0.003, 'silver', 0.003);
    line.position.set(x, 0, 0.068);
    top.add(line);
    if (x > 0) {
      const cross = line.clone();
      cross.rotation.z = Math.PI / 2;
      top.add(cross);
    }
  }
  const brand = engraving('H A R D T E C H', 0.68, 0.084, '#818a79');
  brand.position.set(0, -0.33, 0.069);
  top.add(brand);
  top.rotation.x = -Math.PI / 2;
  speaker.part('Panel táctil', top, [0, 1.24, 0], [0, 1.16, 0]);
  const light = torus(0.905, 0.009, 'mint');
  light.rotation.x = Math.PI / 2;
  speaker.part('Anillo luminoso', light, [0, 1.18, 0], [0, 0.77, 0]);
  const bottom = disk(0.91, 0.13, 'titanium');
  bottom.rotation.x = Math.PI / 2;
  speaker.part('Base', bottom, [0, -1.24, 0], [0, -0.94, 0]);
  const driver = disk(0.74, 0.2, 'dark');
  driver.rotation.x = Math.PI / 2;
  speaker.part('Altavoz de graves', driver, [0, -0.68, 0], [0, -0.47, 0.3]);
  const subRing = torus(0.61, 0.07, 'rubber');
  subRing.rotation.x = Math.PI / 2;
  speaker.part('Suspensión acústica', subRing, [0, -0.55, 0], [0, -0.23, 0.4]);
  speaker.part('Placa de conexión', circuit(0.82, 1.12), [0, 0.2, 0.1], [-1.26, 0.2, 0.62]);
  speaker.part('Batería', box(0.55, 0.94, 0.48, 'battery', 0.1), [0, -0.02, -0.37], [-1.18, -0.3, -0.48]);
  speaker.part('Transductor frontal', disk(0.43, 0.17, 'titanium'), [0, 0.51, 0.4], [0, 0.25, 1.17]);
  const voiceCoil = new THREE.Group();
  for (let i = 0; i < 10; i++) {
    const wire = torus(0.23 + i * 0.005, 0.004, 'gold');
    wire.position.z = i * 0.004;
    voiceCoil.add(wire);
  }
  speaker.part('Bobina del transductor', voiceCoil, [0, 0.51, 0.45], [0, 0.25, 1.42]);
  speaker.part('Membrana frontal', disk(0.4, 0.06, 'dark'), [0, 0.51, 0.52], [0, 0.25, 1.6]);
  const antenna = torus(0.53, 0.023, 'gold');
  antenna.rotation.x = Math.PI / 2;
  speaker.part('Antena', antenna, [0, 0.86, 0], [0, 0.49, 0]);
  for (let i = 0; i < 4; i++) {
    const a = (i * TAU) / 4,
      mic = disk(0.048, 0.05, 'gold');
    mic.rotation.x = Math.PI / 2;
    speaker.part(
      'Micrófono ' + (i + 1),
      mic,
      [Math.sin(a) * 0.63, 0.99, Math.cos(a) * 0.63],
      [Math.sin(a) * 0.3, 0.71, Math.cos(a) * 0.3],
    );
  }
  for (let i = 0; i < 3; i++) {
    const a = (i * TAU) / 3;
    const foot = disk(0.14, 0.12, 'rubber');
    foot.rotation.x = Math.PI / 2;
    speaker.part(
      'Apoyo',
      foot,
      [Math.sin(a) * 0.62, -1.34, Math.cos(a) * 0.62],
      [Math.sin(a) * 0.25, -1.26, Math.cos(a) * 0.25],
    );
  }

  const models = { watch, headphones, camera, speaker };
  for (const model of Object.values(models)) measureModel(model);
  return models;
}
