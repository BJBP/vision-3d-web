// Aplica la calidad efectiva (escala de render, bloom, estela, densidad de partículas, captura) a la escena.
// createRenderQuality({...}).apply(effective, mode) se llama al cambiar opciones o al bajar calidad en Auto;
// setDynamicScale(scale) ajusta solo la resolución (resolución dinámica).
import * as THREE from 'three';

export function createRenderQuality({
  renderer,
  composer,
  bloom,
  afterimage,
  U,
  body,
  ambient,
  rain,
  effects,
  gallery,
  eventStage,
  webcam,
  center,
}) {
  // Índices propios por objeto: bajar la densidad muestrea toda la figura en vez de recortarla.
  const auxiliaryParticles = ambient.map(object => {
    const count = object.geometry.getAttribute('position').count,
      indices = new Uint16Array(count);
    object.geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    return { object, count, indices };
  });

  // Resolución = densidad de la pantalla × escala configurada × escala dinámica (app/frame-pacing.js).
  let baseRatio = 1,
    dynamicScale = 1;
  function applyPixelRatio() {
    renderer.setPixelRatio(baseRatio * dynamicScale);
    U.uPixelRatio.value = renderer.getPixelRatio();
    composer.setPixelRatio(renderer.getPixelRatio());
  }

  // Solo cambia la resolución; lo llama la resolución dinámica como mucho una vez por segundo.
  function setDynamicScale(scale) {
    dynamicScale = scale;
    applyPixelRatio();
  }

  // effective: opciones efectivas. mode: { quality, surfaceOn, reducedMotion, background }.
  function apply(effective, { quality, surfaceOn, reducedMotion, background }) {
    baseRatio = Math.min(devicePixelRatio, quality === 'high' ? 1.5 : 1) * effective.renderScale;
    applyPixelRatio();
    bloom.enabled = effective.bloom;
    bloom.strength = surfaceOn ? 0.4 : 0.85;
    bloom.radius = surfaceOn ? 0.45 : 0.6;
    bloom.threshold = surfaceOn ? 0.65 : 0.12;
    afterimage.enabled = effective.trails && !reducedMotion;
    const { N, geo, particleIndices, particles } = body;
    const count = Math.floor(N * effective.particleDensity);
    for (let i = 0; i < count; i++) particleIndices[i] = Math.floor((i * N) / count);
    geo.index.needsUpdate = true;
    geo.setDrawRange(0, count);
    particles.visible = effective.particles;
    for (const { object, count, indices } of auxiliaryParticles) {
      const amount = Math.floor(count * effective.particleDensity);
      for (let i = 0; i < amount; i++) indices[i] = Math.floor((i * count) / amount);
      object.geometry.index.needsUpdate = true;
      object.geometry.setDrawRange(0, amount);
      object.visible = object === rain ? effective.rain : effective.particles;
    }
    effects.configure(effective);
    gallery.configure?.({ ...effective, ...background });
    eventStage.configure?.(effective);
    void webcam
      .configure({ captureWidth: effective.captureWidth, analysisFps: effective.analysisFps })
      .catch(error => center?.message(error.message));
  }

  return { apply, setDynamicScale };
}
