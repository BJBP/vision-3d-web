// Mundo 3D de la galería: vista de la colección (layouts.js) con los modelos de
// product-models.js, iluminación y transición al producto elegido.
import * as THREE from 'three';
import { createProductModels } from './product-models.js';
import { loadCatalogModel } from './loaded-model.js';
import { createLayout } from './layouts.js';
import { createProductLighting } from './product-lighting.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export function createProductWorld(renderer, background, items, kind = 'ribbon', options = {}) {
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(33, 1, 0.1, 100);
  const paintCamera = camera.clone();
  // Canvas antialiasing does not reach postprocessing targets. Multisample the
  // actual scene buffer so polished edges and small watch parts stay clean.
  const requestedQuality = new URLSearchParams(location.search).get('quality');
  const samples = requestedQuality === 'low' ? 0 : requestedQuality === 'high' ? 4 : 2;
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples: Math.min(samples, renderer.capabilities.maxSamples),
  });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(background.scene, background.camera));
  const beauty = new RenderPass(scene, paintCamera);
  beauty.clear = false;
  beauty.clearDepth = true;
  composer.addPass(beauty);
  // Gesture feedback stays in front of the object it manipulates. The body
  // field remains behind it, so the product does not disappear into particles.
  const gestures = new RenderPass(background.foreground.scene, background.foreground.camera);
  gestures.clear = false;
  gestures.clearDepth = true;
  composer.addPass(gestures);
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.46, 0.32, 1.05);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  let screenW = 0,
    screenH = 0,
    pixelRatio = 0,
    viewYaw = 0;
  const models = createProductModels(),
    mount = new THREE.Group();
  scene.add(mount);
  function mountModel(m) {
    mount.add(m.group);
    m.group.visible = false;
    m.parts.forEach(p =>
      p.materials.forEach(mat => {
        mat.userData.baseEmission = mat.emissive.clone();
        mat.userData.baseIntensity = mat.emissiveIntensity;
      }),
    );
  }
  Object.values(models).forEach(mountModel);
  const loading = new Map();
  scene.add(new THREE.HemisphereLight(0xf1f5f2, 0x070a08, 0.42));
  for (const [color, intensity, x, y, z] of [
    [0xffffff, 1.6, -4, 6, 5],
    [0xe8f1eb, 1.1, 5, 1, -3],
    [0xffffff, 1.2, 1, 5, -4],
  ]) {
    const light = new THREE.DirectionalLight(color, intensity);
    light.position.set(x, y, z);
    scene.add(light);
  }
  const env = createProductLighting(renderer);
  scene.environment = env.texture;
  let layout = createLayout(kind, items, options);
  scene.add(layout.group);
  let carousel = false;
  const raycaster = new THREE.Raycaster(),
    fitCenter = new THREE.Vector3(),
    fitCorner = new THREE.Vector3();
  let selected = 'watch',
    amount = 0,
    exploded = false,
    zoom = 1,
    yaw = -0.52,
    pitch = -0.24,
    appear = 1,
    hover = null;
  let targetYaw = yaw,
    targetPitch = pitch,
    targetZoom = zoom,
    idleTime = 0,
    appearStarted = performance.now(),
    explodeStarted = 0,
    explodeFrom = 0;
  const model = () => models[selected];
  // Animación del GLB abierto (si tiene): `animation` es el nombre del clip, false para ninguna o nada para el primero.
  let mixer = null;
  let playingClip = null;
  function stopAnimation() {
    if (!mixer) return;
    mixer.stopAllAction();
    mixer.uncacheRoot(mixer.getRoot());
    mixer = null;
    playingClip = null;
  }
  function playAnimation(m, animation) {
    stopAnimation();
    if (!m.animations?.length || animation === false) return;
    const clip = m.animations.find(c => c.name === animation) ?? m.animations[0];
    mixer = new THREE.AnimationMixer(m.root);
    mixer.clipAction(clip).play();
    playingClip = clip.name;
  }
  function select(id, { animation } = {}) {
    if (!models[id]) return;
    selected = id;
    amount = 0;
    exploded = false;
    appear = 0;
    hover = null;
    appearStarted = performance.now();
    explodeFrom = 0;
    explodeStarted = 0;
    targetYaw = yaw = id === 'watch' ? -0.38 : id === 'speaker' ? -0.38 : -0.52;
    targetPitch = pitch = id === 'watch' ? -0.9 : id === 'speaker' ? 0.17 : -0.24;
    targetZoom = zoom = 1;
    for (const [key, m] of Object.entries(models)) m.group.visible = key === id;
    for (const p of model().parts) p.node.position.copy(p.base);
    playAnimation(model(), animation);
  }
  select('watch');
  // Read-only render diagnostic for the browser regression suite.
  if (new URLSearchParams(location.search).has('validateRender'))
    window.__galleryBufferStats = () => {
      const report = {};
      for (const [name, target] of [
        ['read', composer.readBuffer],
        ['bright', bloom.renderTargetBright],
      ]) {
        const data = new Uint16Array(target.width * target.height * 4);
        renderer.readRenderTargetPixels(target, 0, 0, target.width, target.height, data);
        report[name] = { nonFinite: data.reduce((n, v) => n + ((v & 0x7c00) === 0x7c00), 0), pixels: data.length };
      }
      return report;
    };
  return {
    configure({ bloom: enabled = true, quality = requestedQuality } = {}) {
      bloom.enabled = enabled;
      const samples = Math.min(quality === 'low' ? 0 : quality === 'high' ? 4 : 2, renderer.capabilities.maxSamples);
      for (const buffer of [composer.readBuffer, composer.writeBuffer])
        if (buffer.samples !== samples) {
          buffer.samples = samples;
          buffer.dispose();
        }
    },
    get step() {
      return layout.step;
    },
    get axis() {
      return layout.axis;
    },
    get columns() {
      return layout.columns;
    },
    // Replaces the layout (and frees the previous one) when the gallery opens another collection.
    setItems(nextItems, nextKind = layout.kind, nextOptions = {}) {
      layout.dispose();
      layout = createLayout(nextKind, nextItems, nextOptions);
      scene.add(layout.group);
    },
    select,
    stopAnimation,
    // Catalog GLB files are loaded once and kept under their path as model id.
    loadModel(src, name) {
      if (models[src]) return Promise.resolve();
      if (!loading.has(src))
        loading.set(
          src,
          loadCatalogModel(src, name)
            .then(model => {
              models[src] = model;
              mountModel(model);
            })
            .finally(() => loading.delete(src)),
        );
      return loading.get(src);
    },
    orient(delta) {
      viewYaw = THREE.MathUtils.clamp(viewYaw + delta, -0.85, 0.85);
    },
    setOrientation(value) {
      viewYaw = Number.isFinite(value) ? THREE.MathUtils.clamp(value, -0.9, 0.9) : 0;
    },
    toggle() {
      explodeFrom = amount;
      explodeStarted = performance.now();
      exploded = !exploded;
      hover = null;
      return exploded;
    },
    rotate(dx, dy) {
      targetYaw += dx;
      targetPitch = THREE.MathUtils.clamp(targetPitch + dy, -1.15, 1.15);
    },
    zoom(value) {
      targetZoom = THREE.MathUtils.clamp(value, 0.72, 1.45);
    },
    state() {
      return {
        wheel: layout.state(),
        appear,
        selected,
        exploded,
        amount,
        yaw: targetYaw,
        pitch: targetPitch,
        zoom: targetZoom,
        parts: model().parts.length,
        hover: hover?.name ?? null,
        // Clip en reproducción y su tiempo (diagnóstico para las pruebas de navegador).
        animation: mixer ? { clip: playingClip, time: mixer.time } : null,
        maxDisplacement: Math.max(...model().parts.map(p => p.node.position.distanceTo(p.base))),
      };
    },
    pick(x, y, rect) {
      if (!rect || rect.width < 1 || x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
        hover = null;
        return null;
      }
      raycaster.setFromCamera(
        new THREE.Vector2(((x - rect.left) / rect.width) * 2 - 1, 1 - ((y - rect.top) / rect.height) * 2),
        camera,
      );
      hover =
        raycaster.intersectObject(model().group, true).find(h => h.object.userData.part)?.object.userData.part ?? null;
      return hover?.name ?? null;
    },
    clearHover() {
      hover = null;
    },
    carousel(angle, focus, progress = 0, options = {}) {
      carousel = true;
      mount.visible = false;
      layout.arrange(angle, focus, progress, { ...options, viewYaw });
    },
    labels(rect) {
      return layout.labels(camera, rect);
    },
    update({ dt, reducedMotion, idle }) {
      carousel = false;
      mount.visible = true;
      const target = exploded ? 1 : 0,
        elapsed = THREE.MathUtils.clamp((performance.now() - explodeStarted) / (reducedMotion ? 220 : 1050), 0, 1);
      amount = THREE.MathUtils.lerp(explodeFrom, target, elapsed * elapsed * (3 - 2 * elapsed));
      appear = reducedMotion ? 1 : Math.min(1, (performance.now() - appearStarted) / 480);
      layout.open(appear);
      idleTime += dt;
      if (idle && !reducedMotion) targetYaw += dt * 0.12;
      yaw += (targetYaw - yaw) * (1 - Math.exp(-dt * 12));
      pitch += (targetPitch - pitch) * (1 - Math.exp(-dt * 12));
      zoom += (targetZoom - zoom) * (1 - Math.exp(-dt * 8));
      const m = model();
      // Con «reducir movimiento», la animación se queda en su primera pose.
      if (mixer && !reducedMotion) mixer.update(dt);
      m.group.rotation.set(pitch, yaw, 0);
      m.group.scale.setScalar((0.66 + 0.34 * (1 - Math.pow(1 - appear, 3))) * zoom);
      mount.position
        .copy(m.assembledCenter)
        .lerp(m.explodedCenter, amount)
        .applyQuaternion(m.group.quaternion)
        .multiplyScalar(-m.group.scale.x);
      if (!reducedMotion) mount.position.y += Math.sin(idleTime * 0.75) * 0.025;
      m.parts.forEach((p, i) => {
        const delay = reducedMotion ? 0 : (i % 5) * 0.027,
          t = THREE.MathUtils.smoothstep(THREE.MathUtils.clamp((amount - delay) / (1 - delay), 0, 1), 0, 1);
        p.node.position.copy(p.base).addScaledVector(p.travel, t);
        p.materials.forEach(mat => {
          mat.emissive.copy(mat.userData.baseEmission);
          mat.emissiveIntensity = mat.userData.baseIntensity;
          if (p === hover) {
            mat.emissive.lerp(new THREE.Color('#57c77c'), 0.1);
            mat.emissiveIntensity = Math.max(0.18, mat.emissiveIntensity);
          }
        });
      });
    },
    render(rect) {
      if (!rect || rect.width < 1 || rect.height < 1) return;
      camera.aspect = rect.width / rect.height;
      const m = model(),
        halfFov = THREE.MathUtils.degToRad(camera.fov / 2),
        tanY = Math.tan(halfFov),
        tanX = tanY * camera.aspect;
      fitCenter.copy(m.assembledCenter).lerp(m.explodedCenter, amount);
      let distance = 0;
      for (const part of m.parts)
        for (let i = 0; i < 8; i++) {
          const { min, max } = part.fitBounds;
          fitCorner
            .set(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z)
            .add(part.node.position)
            .sub(fitCenter)
            .applyQuaternion(m.group.quaternion);
          distance = Math.max(
            distance,
            fitCorner.z + Math.max(Math.abs(fitCorner.x) / tanX, Math.abs(fitCorner.y) / tanY) * 1.1,
          );
        }
      const menuDistance = Math.max(8.7, 1.85 / (Math.tan(halfFov) * camera.aspect) + 1.75);
      const d = carousel ? menuDistance : THREE.MathUtils.lerp(menuDistance, distance, 1 - Math.pow(1 - appear, 3));
      camera.position.set(0, 0.1, d);
      camera.lookAt(0, 0.1, 0);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      paintCamera.copy(camera);
      paintCamera.setViewOffset(rect.width, rect.height, -rect.left, -rect.top, innerWidth, innerHeight);
      const ratio = renderer.getPixelRatio();
      if (screenW !== innerWidth || screenH !== innerHeight || pixelRatio !== ratio) {
        screenW = innerWidth;
        screenH = innerHeight;
        pixelRatio = ratio;
        composer.setPixelRatio(ratio);
        composer.setSize(screenW, screenH);
      }
      const oldTone = renderer.toneMapping,
        oldExposure = renderer.toneMappingExposure;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, innerWidth, innerHeight);
      background.prepare(renderer);
      bloom.strength = carousel ? 0.075 : 0.025;
      bloom.radius = 0.06;
      bloom.threshold = carousel ? 1.65 : 2.2;
      composer.render();
      renderer.toneMapping = oldTone;
      renderer.toneMappingExposure = oldExposure;
    },
  };
}
