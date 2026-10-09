import * as THREE from 'three';

// Bake decorative meshes into one draw per material. Moving assembly modules
// remain separate, while tiny contacts, engraving and links stay inexpensive.
export function batchDetails(source, { mergeRoles = false } = {}) {
  source.updateMatrixWorld(true);
  const groups = new Map(),
    extras = [];
  source.traverse(o => {
    if (o.isMesh && !Array.isArray(o.material)) {
      const key = mergeRoles ? (o.material.userData.role ?? o.material.uuid) : o.material.uuid;
      const bucket = groups.get(key) ?? { material: o.material, geometries: [] };
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      bucket.geometries.push(g);
      groups.set(key, bucket);
    } else if (o.isPoints) {
      const p = new THREE.Points(o.geometry.clone().applyMatrix4(o.matrixWorld), o.material);
      extras.push(p);
    }
  });
  const out = new THREE.Group();
  for (const { material, geometries } of groups.values()) {
    const geometry = new THREE.BufferGeometry();
    for (const [name, size] of [
      ['position', 3],
      ['normal', 3],
      ['uv', 2],
    ]) {
      const count = geometries.reduce((n, g) => n + g.attributes.position.count, 0),
        array = new Float32Array(count * size);
      let offset = 0;
      for (const g of geometries) {
        if (g.attributes[name]) array.set(g.attributes[name].array, offset);
        offset += g.attributes.position.count * size;
      }
      geometry.setAttribute(name, new THREE.BufferAttribute(array, size));
    }
    geometry.computeBoundingSphere();
    out.add(new THREE.Mesh(geometry, material));
    geometries.forEach(g => g.dispose());
  }
  if (extras.length) out.add(...extras);
  return out;
}

// Rounded rectangle outline for gallery panels (Shape for faces, Path for holes).
export function rounded(w, h, r, Path = THREE.Shape) {
  const s = new Path(),
    x = -w / 2,
    y = -h / 2;
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

// Thin bevelled slab centred on z = 0.
export function extrude(shape, depth) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSize: 0.012,
    bevelThickness: 0.012,
    bevelSegments: 2,
    curveSegments: 10,
    steps: 1,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}
