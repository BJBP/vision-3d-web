// Miniaturas de avatares GLB: renderiza el modelo una vez fuera de pantalla con el renderer de la escena (sin abrir
// otro contexto WebGL) y devuelve una imagen PNG como data URL. createModelThumbnailer({ renderer, size }).render(blob).
import * as THREE from 'three';
import { releaseModel } from './custom-model.js';
import { validateGLB } from './model-rig.js';

const THUMBNAIL_SIZE = 96;
const FRAME_MARGIN = 1.15;

export function createModelThumbnailer({ renderer, size = THUMBNAIL_SIZE }) {
  const target = new THREE.WebGLRenderTarget(size, size, { colorSpace: THREE.SRGBColorSpace });
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4456, 2.4));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(1, 2, 3);
  scene.add(key);
  const pixels = new Uint8Array(size * size * 4),
    box = new THREE.Box3(),
    center = new THREE.Vector3(),
    extent = new THREE.Vector3(),
    clearColor = new THREE.Color();
  let loader = null;

  // Centra el modelo de frente y aleja la cámara hasta que quepa entero.
  function frame(model) {
    box.setFromObject(model, true);
    if (box.isEmpty()) throw new Error('El modelo no tiene geometría visible.');
    box.getCenter(center);
    box.getSize(extent);
    const radius = Math.max(extent.x, extent.y, extent.z) / 2,
      distance = (radius / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * FRAME_MARGIN;
    camera.position.set(center.x, center.y, center.z + distance + radius);
    camera.near = Math.max(distance / 100, 0.001);
    camera.far = distance * 4 + radius * 4;
    camera.updateProjectionMatrix();
    camera.lookAt(center);
  }

  // Dibuja en el render target y deja el renderer como estaba (destino y color de fondo).
  function draw() {
    const previousTarget = renderer.getRenderTarget(),
      previousAlpha = renderer.getClearAlpha();
    renderer.getClearColor(clearColor);
    try {
      renderer.setRenderTarget(target);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
    } finally {
      renderer.setRenderTarget(previousTarget);
      renderer.setClearColor(clearColor, previousAlpha);
    }
  }

  // WebGL lee las filas de abajo arriba: se invierten al pasarlas al lienzo.
  function toDataURL() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const context = canvas.getContext('2d'),
      image = context.createImageData(size, size),
      row = size * 4;
    for (let y = 0; y < size; y++) image.data.set(pixels.subarray((size - 1 - y) * row, (size - y) * row), y * row);
    context.putImageData(image, 0, 0);
    return canvas.toDataURL('image/png');
  }

  return {
    async render(blob) {
      const buffer = await blob.arrayBuffer();
      validateGLB(buffer);
      loader ??= new (await import('three/addons/loaders/GLTFLoader.js')).GLTFLoader();
      const gltf = await loader.parseAsync(buffer, '');
      try {
        frame(gltf.scene);
        scene.add(gltf.scene);
        draw();
        return toDataURL();
      } finally {
        scene.remove(gltf.scene);
        releaseModel(gltf);
      }
    },
    dispose() {
      target.dispose();
    },
  };
}
