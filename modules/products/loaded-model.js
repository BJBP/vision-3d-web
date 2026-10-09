// Convierte un GLB del catálogo en un modelo de la galería (una sola pieza, sin desarmar).
// loadCatalogModel(src) → { group, parts, ..., root, animations } con la misma forma que createProductModels(); las
// animaciones del GLB (si tiene) las reproduce product-world.js al abrir el modelo.
import * as THREE from 'three';

const TARGET_SIZE = 2.4;
const MAX_BYTES = 50 * 1024 * 1024;

// Bounds and centres that product-world.js uses to frame, open and pick a model.
export function measureModel(model) {
  model.group.rotation.order = 'YXZ';
  model.bounds = new THREE.Box3();
  for (const amount of [0, 1]) {
    for (const p of model.parts) p.node.position.copy(p.base).addScaledVector(p.travel, amount);
    model.group.updateMatrixWorld(true);
    model.bounds.union(new THREE.Box3().setFromObject(model.group));
  }
  for (const p of model.parts) p.node.position.copy(p.base);
  model.group.updateMatrixWorld(true);
  model.assembledBounds = new THREE.Box3().setFromObject(model.group);
  model.assembledCenter = model.assembledBounds.getCenter(new THREE.Vector3());
  for (const p of model.parts) p.node.position.copy(p.base).add(p.travel);
  model.group.updateMatrixWorld(true);
  model.explodedBounds = new THREE.Box3().setFromObject(model.group);
  model.explodedCenter = model.explodedBounds.getCenter(new THREE.Vector3());
  for (const p of model.parts) p.node.position.copy(p.base);
  model.assembledRadius = model.assembledBounds.getBoundingSphere(new THREE.Sphere()).radius;
  model.radius = model.bounds.getBoundingSphere(new THREE.Sphere()).radius;
  model.group.updateMatrixWorld(true);
  // Cache each physical module separately. Fitting their corners avoids the
  // empty space in a single large box shrinking a rotated or opened product.
  for (const p of model.parts) {
    p.fitBounds = new THREE.Box3().setFromObject(p.node);
    p.fitBounds.min.sub(p.base);
    p.fitBounds.max.sub(p.base);
  }
  return model;
}

function wrap(scene, name, animations = []) {
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  const largest = Math.max(size.x, size.y, size.z);
  if (box.isEmpty() || !Number.isFinite(largest) || largest < 1e-6)
    throw new Error('el modelo no tiene geometría visible.');
  scene.position.sub(box.getCenter(new THREE.Vector3()));
  const node = new THREE.Group();
  node.name = name;
  node.add(scene);
  node.scale.setScalar(TARGET_SIZE / largest);
  const group = new THREE.Group();
  group.add(node);
  const part = { name, node, base: new THREE.Vector3(), travel: new THREE.Vector3(), materials: [] };
  scene.traverse(o => {
    if (!o.isMesh) return;
    o.userData.part = part;
    for (const material of [o.material].flat())
      if (material.emissive && !part.materials.includes(material)) part.materials.push(material);
  });
  return measureModel({ group, parts: [part], root: scene, animations });
}

export async function loadCatalogModel(src, name, fetcher = globalThis.fetch.bind(globalThis)) {
  const response = await fetcher(src, { credentials: 'same-origin' });
  if (!response.ok) throw new Error(`el servidor respondió ${response.status}.`);
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_BYTES) throw new Error('el archivo supera 50 MiB.');
  const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
    import('three/addons/loaders/GLTFLoader.js'),
    // GLB comprimidos con `npm run compress:model` (EXT_meshopt_compression).
    import('three/addons/libs/meshopt_decoder.module.js'),
  ]);
  // Un GLB local (blob:, colecciones de este navegador) es autocontenido: no tiene carpeta de la que leer.
  const base = src.startsWith('blob:') ? '' : new URL('./', new URL(src, location.href)).href;
  const loaded = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(buffer, base);
  return wrap(loaded.scene, name, loaded.animations ?? []);
}
