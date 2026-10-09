import * as THREE from 'three';

// A small photographic studio, generated locally once. The gradients in the
// diffusers produce continuous silver reflections instead of white rectangles.
export function createProductLighting(renderer) {
  const room = new THREE.Scene();
  room.background = new THREE.Color(0.024, 0.026, 0.025);
  const width = 128,
    height = 256,
    pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const u = x / (width - 1),
        v = y / (height - 1);
      const edge = Math.pow(Math.sin(Math.PI * u) * Math.sin(Math.PI * v), 0.38);
      const rolloff = 0.24 + 0.76 * Math.exp(-Math.pow((u - 0.35) * 2.3, 2));
      const value = Math.round(255 * edge * rolloff);
      pixels.set([value, value, value, 255], (y * width + x) * 4);
    }
  const diffusion = new THREE.DataTexture(pixels, width, height);
  diffusion.needsUpdate = true;
  diffusion.minFilter = diffusion.magFilter = THREE.LinearFilter;
  const boxes = [
    [-4, 3, 3, 3.0, 8.0, 4.5], // long key: reads the curvature of every bracelet link
    [4, 1, 2, 1.0, 7.0, 5.0], // narrow polished rim
    [0, 5, -1, 7.0, 2.5, 2.0],
    [0, 0, 6, 5.5, 5.5, 0.78], // broad fill preserves the dark side of the mechanism
    [-3, -3, 1, 4.0, 1.1, 1.1],
    [2, 1, -5, 2.0, 5.0, 2.3],
  ];
  for (const [x, y, z, w, h, power] of boxes) {
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        map: diffusion,
        color: new THREE.Color(power, power, power),
        side: THREE.DoubleSide,
      }),
    );
    panel.position.set(x, y, z);
    panel.lookAt(0, 0, 0);
    room.add(panel);
  }
  const pmrem = new THREE.PMREMGenerator(renderer),
    env = pmrem.fromScene(room, 0.025, 0.1, 100, { size: 512 });
  pmrem.dispose();
  room.traverse(o => {
    o.geometry?.dispose();
    o.material?.dispose();
  });
  diffusion.dispose();
  return env;
}
