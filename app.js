// Punto de entrada de la experiencia: crea la escena three.js, conecta captura, avatar,
// estudio, galería y configuración, y ejecuta el bucle de animación frame().
import * as THREE from 'three';
import { createSceneSetup } from './app/scene-setup.js';
import { createBodyParticles } from './app/body-particles.js';
import { createAmbientEffects } from './app/ambient-effects.js';
import { createClockSprite } from './app/clock-sprite.js';
import { createPoseTracker } from './app/pose-tracker.js';
import { createCrowdAvatars } from './app/crowd-avatars.js';
import { createCaptureSources, captureTrackingOptions } from './app/capture-sources.js';
import { createHud } from './app/hud.js';
import { installScenePointer } from './app/scene-pointer.js';
import { installFloatingPanels } from './app/floating-panels.js';
import { installSceneEditor } from './app/scene-editor.js';
import { installButtonEditor } from './app/button-editor.js';
import { createCalibration } from './app/calibration.js';
import { createRenderQuality } from './app/render-quality.js';
import { createFramePacer } from './app/frame-pacing.js';
import { installControls, toast } from './app/controls.js';
import { createWatchGesture } from './app/watch-gesture.js';
import { createCameraRig } from './app/camera-rig.js';
import { installOfflineCache } from './app/offline-cache.js';
import { installLocalAdmin } from './app/local-admin.js';
import { createQualityRamp } from './app/quality-ramp.js';

import {
  MID_H,
  createHumanAvatar,
  APPEARANCES,
  FINISHES,
  createStage,
  createCustomModel,
} from './modules/avatar/index.js';
import {
  demoPose,
  assessBodyFrame,
  DEFAULT_HAND_ZONE,
  HandInput,
  cursorObservation,
  createParticipants,
  createParticipantCursorZone,
} from './modules/tracking/index.js';
import { createStudio } from './modules/studio/index.js';
import { createEventStage } from './modules/event/index.js';
import { createProductGallery, BUILT_IN_MODELS, DEFAULT_CATALOG } from './modules/products/index.js';
import {
  loadCatalog,
  catalogMessage,
  createNavigator,
  createLocalCollections,
  LAYOUTS,
  adminToken,
} from './modules/collections/index.js';
import { PRESETS, center, resourceStore, reduceQuality } from './modules/settings/index.js';
import { createSceneBackground, createParticleEffects } from './modules/effects/index.js';

// ---------- Configuración por URL: ?titulo=...&color=%2339ff88&trails=0&ws=8765 ----------
const params = new URLSearchParams(location.search);
installOfflineCache({ params });
const eventMode = params.get('event') !== '0' && params.get('studio') !== '1';
document.body.classList.toggle('event-mode', eventMode);
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
let options = center.values;
// El cursor de las manos se pausa durante la calibración aunque esté activado (handCursor).
let cursorPaused = false;
let buttonsEditing = false;
// URL overrides are temporary; they do not overwrite the saved profiles.
if (['auto', 'low', 'balanced', 'high'].includes(params.get('quality'))) {
  options = {
    ...options,
    ...PRESETS[params.get('quality') === 'auto' ? 'balanced' : params.get('quality')],
    quality: params.get('quality'),
  };
}
if (/^#[0-9a-f]{6}$/i.test(params.get('color') || '')) options.color = params.get('color');
if (params.has('trails')) options.trails = params.get('trails') === '1';
if (params.has('motion')) options.reducedMotion = params.get('motion') === '0';
if (params.has('surface') || params.has('appearance') || params.has('finish'))
  options.surface = params.get('surface') !== '0';
if (APPEARANCES.includes(params.get('appearance'))) options.appearance = params.get('appearance');
if (FINISHES.includes(params.get('finish'))) options.finish = params.get('finish');
if (params.has('view')) options.portrait = params.get('view') === 'portrait';
else if (params.has('surface') || params.has('appearance') || params.has('finish')) options.portrait = options.surface;
let reducedMotion = options.reducedMotion,
  demo = params.get('demo') === '1',
  surfaceOn = options.surface;
let quality = options.quality,
  appearance = options.appearance,
  finish = options.finish,
  portrait = options.portrait;
let effectiveOptions = { ...options };
// Auto arranca ligero y sube por escalones mientras el ritmo lo permita (app/quality-ramp.js).
const qualityRamp = createQualityRamp();
let rampMode = null;
center.set(options);
const MAGIC = new THREE.Color(options.color);
document.getElementById('title').textContent = params.get('titulo') || 'VISIÓN 3D';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const S = 2.7; // unidades de escena por metro real

// ---------- Escena ----------
const { renderer, scene, camera, composer, afterimage, bloom } = createSceneSetup({
  quality,
  trails: options.trails && !reducedMotion,
});

const effects = createParticleEffects();

// ---------- Partículas: nebulosa → logo HT → avatar ----------
const { N, geo, particleIndices, J, V, U, particles } = await createBodyParticles({
  scene,
  renderer,
  effects,
  magic: MAGIC,
  finish,
  surfaceOn,
  reducedMotion,
  scale: S,
});
const continuous = await createHumanAvatar(U, S, appearance);
const studio = createStudio({ enabled: params.has('studio') ? params.get('studio') === '1' : !eventMode });
const handInput = new HandInput(),
  eventStage = createEventStage();
// ?preview=1 muestra también los borradores si este navegador tiene abierta la sesión del panel (/_/).
const previewToken = params.get('preview') === '1' ? adminToken() : null;
const localCollections = createLocalCollections();
const localData = localCollections.read();
const catalog = await loadCatalog({
  api: location.hostname.endsWith('.github.io') ? null : { base: './', token: previewToken },
  knownModels: BUILT_IN_MODELS,
  fallback: DEFAULT_CATALOG,
  requested: params.get('collection'),
  drafts: Boolean(previewToken),
  // Colecciones creadas en Configuración → Colecciones; sus archivos están en el almacén de recursos.
  local: localData,
  getResource: id => resourceStore.get(id),
});
if (catalog.apiNote) console.info('Panel de colecciones no disponible; se usa el catálogo JSON:', catalog.apiNote);
if (catalog.errors.length) console.warn('Catálogo de colecciones:', catalog.errors);
const gallery = createProductGallery(renderer, {
  enabled: eventMode && params.get('products') !== '0',
  initial: params.get('product'),
  navigator: createNavigator(catalog),
  // ?layout= tiene prioridad sobre la vista guardada en cada colección.
  layout: LAYOUTS.includes(params.get('layout')) ? params.get('layout') : null,
});
if (catalog.errors.length) center.message(catalogMessage(catalog.errors));
installLocalAdmin({
  center,
  catalog,
  local: localCollections,
  resources: resourceStore,
  defaultCatalog: DEFAULT_CATALOG,
  renderer,
});
scene.add(continuous.mesh);
const customModel = await createCustomModel({
  renderer,
  onInfo: info => center.modelInfo?.(info),
  onError: error => center.message(error.message || String(error)),
});
scene.add(customModel.mesh);
let backgroundState = {};
const backgrounds = createSceneBackground({
  resources: resourceStore,
  onStatus: text => center.videoStatus?.(text),
  onChange: value => {
    backgroundState = value;
    scene.background = value.backgroundValue;
    scene.backgroundIntensity = value.backgroundIntensity;
    gallery.configure?.({ ...effectiveOptions, ...value });
  },
});

const stagePlatform = createStage(scene, MAGIC);

// ---------- Ambiente: ondas, plataforma, polvo, lluvia y silueta ----------
const { rings, floor, dust, rain, fitRain, silhouette } = createAmbientEffects({ scene, camera, effects, U });

// ---------- Holograma del reloj: aparece al levantar la muñeca para mirar la hora ----------
const clock = createClockSprite({ scene, color: MAGIC });

// ---------- Pose: suavizado One Euro y armado del esqueleto ----------
const tracker = createPoseTracker({ J, V, U, scale: S });
const participants = createParticipants();
const cursorZone = createParticipantCursorZone();
const crowd = await createCrowdAvatars({
  scene,
  camera,
  body: { geo, particles, U, N },
  scale: S,
  appearance,
  geometryCache: continuous.geometryCache,
});
let controllerId = null;
let trackedId = null;
let crowdState = crowd.state(),
  participantState = [];
let lastPoseMsg = performance.now(),
  camOk = false,
  camFps = 0,
  lastMsg = 0,
  presence = 0;

// ---------- Fuentes de captura: OAK-D, webcam o demo (un único camino validado) ----------
const sources = createCaptureSources({
  params,
  center,
  getCaptureOptions: () => ({
    captureWidth: effectiveOptions.captureWidth,
    analysisFps: effectiveOptions.analysisFps,
    preview: options.preview,
    ...captureTrackingOptions(options),
  }),
  onPacket: packet => consumeCapture(packet),
  onSwitch: source => {
    $('capture-error').hidden = true;
    demo = source === 'demo';
    tracker.reset();
    participants.reset();
    crowd.ingest([], performance.now());
    controllerId = null;
    trackedId = null;
    handInput.reset();
    cursorZone.reset();
    studio.resetHandInput();
    gallery.clearPresence();
    tracker.lastPose = -1e9;
    lastMsg = 0;
    camOk = false;
    camFps = 0;
    silhouette.clear();
    $('demo-button').setAttribute('aria-pressed', String(demo));
    $('demo-button').querySelector('span').textContent = demo ? 'Salir de demo' : 'Ver demo';
  },
  onFail: error => {
    camOk = false;
    $('capture-error-message').textContent = error.message || 'No se pudo iniciar la cámara. Revisa sus permisos.';
    $('capture-error').hidden = false;
  },
  onPreview: visible => {
    options.preview = visible;
    center?.set({ preview: visible });
  },
});
const webcam = sources.webcam;
function consumeCapture(d) {
  if (!d || typeof d !== 'object' || demo) return;
  const now = performance.now();
  lastMsg = now;
  camOk = d.cam === true;
  camFps = Number.isFinite(d.fps) ? d.fps : 0;
  if (camOk && d.sil && d.silw === silhouette.width && d.silh === silhouette.height && silhouette.update(d.sil))
    gallery.ingestSilhouette(silhouette.texture, now);
  presence = Number.isFinite(d.pres) ? d.pres : 0;
  if (camOk) {
    const people = participants.ingest(d, now);
    crowd.ingest(people, now);
    const controller = participants.controller(now);
    controllerId = controller?.id ?? null;
    const tracked = controller ?? people.find(p => p.observedAt === now && !p.ambiguous);
    if (tracked && tracked.id !== trackedId) {
      tracker.reset();
      if (options.cursorStability !== 'legacy') {
        handInput.reset();
        cursorZone.reset();
        studio.resetHandInput();
        gallery.ingestHands([], now);
      }
      trackedId = tracked.id;
    }
    const accepted = tracked
      ? tracker.ingest(tracked.pose, tracked.hands, clamp((now - lastPoseMsg) / 1000, 0.01, 0.2))
      : false;
    const { pose, hands: measuredHands } = cursorObservation(d, controller, accepted, options.cursorStability);
    if (options.participantCursor)
      applyHandZone(cursorZone.sample(pose, handZoneOf(options), now, options.cursorStability));
    // Sin cursor (Configuración → Cámara) las manos no llegan a la galería ni al estudio; el avatar las sigue igual.
    const points = handInput.sample(pose, measuredHands, now),
      cursor = cursorActive();
    gallery.ingestHands(cursor ? points : [], now, {
      available: eventMode && !studio.state().enabled,
      demo,
      blocked: guideHidden || !!document.querySelector('dialog[open]'),
    });
    studio.ingest(cursor ? pose : null, now, cursor ? measuredHands : []);
    const assessment = assessBodyFrame(tracked?.pose);
    tracker.issue = tracked ? 'uncertain' : 'searching';
    if (accepted) {
      tracker.issue = assessment.ok ? 'tracked' : 'partial';
      lastPoseMsg = now;
    }
  } else {
    participants.reset();
    crowd.ingest([], now);
    controllerId = null;
    trackedId = null;
    handInput.reset();
    gallery.ingestHands([], now);
    gallery.clearPresence();
    tracker.reset();
    tracker.lastPose = -1e9;
  }
}

let guideHidden = false,
  lastInteraction = performance.now();
function setDemo(value) {
  void sources.select(value ? { source: 'demo' } : sources.liveRequest());
  toast(value ? 'Demostración · movimiento simulado' : 'Elige tu fuente de captura en Configuración');
}
function toggleSurface() {
  surfaceOn = !surfaceOn;
  $('surface-button').setAttribute('aria-pressed', String(surfaceOn));
  $('surface-button').textContent = surfaceOn ? 'Humano' : 'Aura astral';
  U.uSize.value = surfaceOn ? 1.65 : 2.65;
  options.surface = surfaceOn;
  center?.set({ surface: surfaceOn });
  syncAppearance();
  applyQuality();
}
function syncMotion() {
  U.uMotion.value = reducedMotion ? 0 : 1;
  $('motion-button').setAttribute('aria-pressed', String(reducedMotion));
  $('motion-button').textContent = reducedMotion ? 'Calma' : 'Movimiento';
  afterimage.enabled = effectiveOptions.trails && !reducedMotion;
}
function toggleMotion() {
  center.set({ reducedMotion: !reducedMotion });
  applyOptions(center.values);
}
motionPreference.addEventListener('change', e => {
  center.set({ reducedMotion: params.get('motion') === '0' || e.matches });
  applyOptions(center.values);
});
let slowDuration = 0;
const pacer = createFramePacer();
const renderQuality = createRenderQuality({
  renderer,
  composer,
  bloom,
  afterimage,
  U,
  body: { N, geo, particleIndices, particles },
  ambient: [rings, dust, floor, rain],
  rain,
  effects,
  gallery,
  eventStage,
  webcam,
  center,
});
function applyEffectiveQuality() {
  renderQuality.apply(effectiveOptions, { quality, surfaceOn, reducedMotion, background: backgroundState });
}
function applyQuality() {
  // Solo al entrar en Auto empieza la subida; cambiar otra opción no vuelve a bajar la calidad.
  if (quality === 'auto' && rampMode !== 'auto') qualityRamp.reset(performance.now());
  rampMode = quality;
  effectiveOptions = quality === 'auto' ? qualityRamp.apply(options) : { ...options };
  slowDuration = 0;
  applyEffectiveQuality();
  $('quality-button').textContent = {
    auto: 'Auto',
    high: 'Alta',
    low: 'Ligera',
    balanced: 'Equilibrada',
    custom: 'Personalizada',
  }[quality];
}
function cycleQuality() {
  quality = { auto: 'high', high: 'low', low: 'balanced', balanced: 'auto', custom: 'auto' }[quality];
  options = { ...options, ...PRESETS[quality === 'auto' ? 'balanced' : quality], quality };
  center?.set(options);
  applyQuality();
}
function applyOptions(next) {
  const previousModel = options.modelId;
  if (options.cursorStability !== next.cursorStability || options.participantCursor !== next.participantCursor) {
    cursorZone.reset();
    handInput.reset();
    studio.resetHandInput();
    gallery.ingestHands([], performance.now());
  }
  if ((options.cursorStability === 'legacy') !== (next.cursorStability === 'legacy')) {
    participants.reset();
    controllerId = trackedId = null;
  }
  options = { ...next };
  handInput.setStability(options.cursorStability);
  studio.setCursorStability(options.cursorStability);
  tracker.configure(options);
  continuous.configure(options);
  participants.configure({ ...options, ...captureTrackingOptions(options) });
  crowd.configure(options);
  void webcam.configure(captureTrackingOptions(options)).catch(error => center.message(error.message));
  quality = options.quality;
  surfaceOn = options.surface;
  reducedMotion = options.reducedMotion;
  portrait = options.portrait;
  if (appearance !== options.appearance) {
    appearance = options.appearance;
    continuous.select(appearance);
  }
  finish = options.finish;
  U.uFinish.value = FINISHES.indexOf(finish);
  U.uSkin.value.set(options.skin);
  U.uSize.value = surfaceOn ? 1.65 : 2.65;
  MAGIC.set(options.color);
  renderer.setClearColor(options.bgColor, 1);
  void backgrounds.configure(options);
  void customModel.configure(options, resourceStore);
  if (options.modelId && options.modelId !== previousModel) gallery.showAvatar?.();
  document.querySelector('.atmosphere').style.opacity = '0';
  syncAppearance();
  syncMotion();
  applyQuality();
  webcam.setPreview(options.preview);
  applyHandZone(handZoneOf(options));
  $('cursor-button').setAttribute('aria-pressed', String(options.handCursor));
}
function cursorActive() {
  return options.handCursor && !cursorPaused && !buttonsEditing;
}
function toggleCursor() {
  center.save({ handCursor: !options.handCursor });
  toast(
    options.handCursor ? 'Cursor de las manos activado.' : 'Cursor de las manos desactivado: el avatar te sigue igual.',
  );
}
// Zona de la cámara que se usa como pantalla para el cursor (Configuración → editor de áreas).
function handZoneOf(values) {
  return { x: values.handZoneX, y: values.handZoneY, width: values.handZoneWidth, height: values.handZoneHeight };
}
function applyHandZone(zone) {
  handInput.setZone(zone);
  studio.setHandZone(zone);
}
const calibration = createCalibration({
  calibrate: () => customModel.calibrate(),
  setCursorPaused: value => (cursorPaused = value),
  announce: toast,
  closeDialogs: () => document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close()),
});
center.connect({
  onChange: applyOptions,
  onSource: request => void sources.select(request),
  onPreview: visible => webcam.setPreview(visible),
  onCalibrate: () => calibration.run(),
  onModelApply: () => gallery.showAvatar?.(),
  onVideoPlay: () => {
    center.set({ videoPaused: false });
    options.videoPaused = false;
    backgrounds.play();
  },
  onVideoPause: () => {
    center.set({ videoPaused: true });
    options.videoPaused = true;
    backgrounds.pause();
  },
});
if (sources.defaultEndpoint) document.getElementById('settings-endpoint').value = sources.defaultEndpoint;
applyOptions(center.values);
if (!params.has('product') && !params.has('collection') && options.initialView === 'avatar') gallery.showAvatar();
$('capture-retry').onclick = () => void sources.select(sources.liveRequest());
void sources.select({ source: sources.mode });
function toggleStudio() {
  studio.toggle();
  $('studio-button').setAttribute('aria-pressed', String(studio.state().enabled));
}
$('studio-button').setAttribute('aria-pressed', String(studio.state().enabled));
function syncAppearance() {
  $('surface-button').setAttribute('aria-pressed', String(surfaceOn));
  $('surface-button').textContent = surfaceOn ? 'Humano' : 'Aura astral';
  document
    .querySelectorAll('[data-skin]')
    .forEach(button =>
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.skin.toLowerCase() === `#${U.uSkin.value.getHexString()}`),
      ),
    );
  document
    .querySelectorAll('[data-render]')
    .forEach(b => b.setAttribute('aria-pressed', String((b.dataset.render === 'human') === surfaceOn)));
  document.querySelectorAll('.human-options').forEach(el => (el.hidden = !surfaceOn));
  document
    .querySelectorAll('[data-appearance]')
    .forEach(b => b.setAttribute('aria-pressed', String(b.dataset.appearance === appearance)));
  document
    .querySelectorAll('[data-finish]')
    .forEach(b => b.setAttribute('aria-pressed', String(b.dataset.finish === finish)));
  $('skin-options').hidden = !surfaceOn || finish !== 'natural';
  $('view-button').textContent = portrait ? 'Retrato' : 'Cuerpo';
  $('view-button').setAttribute('aria-pressed', String(portrait));
}
function toggleView() {
  portrait = !portrait;
  options.portrait = portrait;
  center?.set({ portrait });
  syncAppearance();
}
function setAppearance(value) {
  appearance = value;
  options.appearance = appearance;
  center?.set({ appearance });
  continuous.select(appearance);
  syncAppearance();
}
function setFinish(value) {
  finish = value;
  options.finish = finish;
  center?.set({ finish });
  U.uFinish.value = FINISHES.indexOf(finish);
  syncAppearance();
}
function setSkin(value, button) {
  U.uSkin.value.set(value);
  options.skin = value;
  center?.set({ skin: options.skin });
  document.querySelectorAll('[data-skin]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
}
function toggleClean() {
  guideHidden = !guideHidden;
  document.body.classList.toggle('clean', guideHidden);
  fitView();
}
syncAppearance();
function interact() {
  lastInteraction = performance.now();
  document.querySelector('.controls').classList.remove('idle');
}
installControls({
  demo: () => setDemo(!demo),
  surface: toggleSurface,
  cursor: toggleCursor,
  motion: toggleMotion,
  quality: cycleQuality,
  studio: toggleStudio,
  view: toggleView,
  clean: toggleClean,
  render: kind => {
    if ((kind === 'human') !== surfaceOn) toggleSurface();
  },
  appearance: setAppearance,
  finish: setFinish,
  skin: setSkin,
  interact,
});
$('demo-button').setAttribute('aria-pressed', String(demo));
$('demo-button').querySelector('span').textContent = demo ? 'Salir de demo' : 'Ver demo';
$('surface-button').setAttribute('aria-pressed', String(surfaceOn));
$('surface-button').textContent = surfaceOn ? 'Humano' : 'Aura astral';
syncMotion();
applyQuality();
const hud = createHud();
const cameraRig = createCameraRig({ camera, J, fitRain, getDistance: () => options.cameraDistance });
const watch = createWatchGesture({ clock, J, V, scale: S });
let lastHUD = 0;
function fitView() {
  const studioActive = studio.state().active;
  cameraRig.fit(studioActive, guideHidden || (eventMode && !studioActive));
}
fitView();

// ---------- Bucle principal ----------
let lastT = performance.now(),
  fpsAvg = 60,
  stage = 0,
  floorY = -2.4,
  demoTick = 0;

function frame() {
  const now = performance.now();
  // Límite de FPS: los fotogramas que llegan antes de tiempo no se procesan ni se dibujan.
  if (!pacer.shouldRun(now, options.fpsLimit)) {
    requestAnimationFrame(frame);
    return;
  }
  const rawDt = Math.max((now - lastT) / 1000, 0.001);
  const dt = Math.min(rawDt, 0.05);
  lastT = now;
  const t = (U.uTime.value += reducedMotion ? 0 : dt);
  effects.update(now / 1000);
  fpsAvg += (1 / rawDt - fpsAvg) * (1 - Math.exp(-dt * 2));
  if (demo && now - demoTick > 30) {
    const pose = demoPose(now / 1000, reducedMotion);
    tracker.ingest(pose, [], clamp((now - demoTick) / 1000, 0.01, 0.1));
    handInput.sample(pose, [], now);
    studio.ingest(pose, now, []);
    demoTick = now;
  }
  // Resolución dinámica: primero se ajusta la resolución para sostener los FPS objetivo…
  const nextScale = pacer.adapt(now, options.dynamicResolution, options.fpsLimit || 60);
  if (nextScale !== null) renderQuality.setDynamicScale(nextScale);
  // …y solo si ya está al mínimo, Auto recorta partículas y efectos.
  const resolutionExhausted = !options.dynamicResolution || pacer.atMinimum;
  if (quality === 'auto' && qualityRamp.frame(now, options.fpsLimit || 60)) {
    effectiveOptions = qualityRamp.apply(options);
    applyEffectiveQuality();
  }
  if (
    quality === 'auto' &&
    qualityRamp.state === 'estable' &&
    resolutionExhausted &&
    fpsAvg < 30 &&
    (stage > 0.9 || gallery.productVisible())
  )
    slowDuration += Math.min(rawDt, 0.5);
  else slowDuration = Math.max(0, slowDuration - rawDt * 2);
  if (slowDuration > 3) {
    effectiveOptions = reduceQuality(effectiveOptions);
    slowDuration = 0;
    applyEffectiveQuality();
  }

  const present = now - tracker.lastPose < 1000;
  const people = participants.current(now);
  const observedPresence = people.some(p => now - p.observedAt < 1000);
  crowd.ingest(people, now);
  const crowdActive =
    !demo && !options.modelId && options.maxParticipants > 1 && people.length > 0 && gallery.avatarVisible();
  const hands = handInput.current(now),
    dialogOpen = !!document.querySelector('dialog[open]');
  gallery.update({
    now,
    dt: Math.min(rawDt, 0.15),
    available: eventMode && !studio.state().enabled,
    present: !demo && (present || observedPresence),
    hands: demo || !cursorActive() ? [] : hands,
    reducedMotion,
    demo,
    blocked: guideHidden || dialogOpen,
  });
  const productMode = gallery.productVisible();
  const avatarPreview = gallery.state().active && gallery.avatarVisible() && !present && !demo;
  if (avatarPreview && people.length === 0) {
    // A static preview is an exhibit asset, not a detected visitor. Never update
    // lastPose, tracking confidence/state, or studio input from this preview.
    tracker.setNeutral(demoPose(0, true));
  }
  // el esqueleto se interpola entre mensajes de la cámara
  const k = 1 - Math.exp(-dt * 26);
  tracker.follow(k);
  tracker.updateVirtualJoints();
  if (!productMode) continuous.update(J, V);
  const custom = customModel.state();
  const manualCentral = options.particleLayout !== 'auto' && options.particleTarget !== 'ambient';
  const modelSelected = !!options.modelId && custom.loaded;
  if (!productMode && !manualCentral)
    customModel.update(J, V, dt, { trackingActive: present || demo || avatarPreview, reducedMotion });

  // etapas: sin nadie → logo HT; alguien frente a la cámara → avatar
  studio.update({
    now,
    dt: Math.min(rawDt, 0.15),
    present: present && stage > 1.95,
    demo,
    reducedMotion,
    blocked: guideHidden || !!document.querySelector('dialog[open]'),
  });
  const surfaceTarget = manualCentral ? 0 : modelSelected || surfaceOn ? 1 : 0;
  U.uSurface.value += (surfaceTarget - U.uSurface.value) * (1 - Math.exp(-Math.min(rawDt, 0.15) * 7));
  if (Math.abs(surfaceTarget - U.uSurface.value) < 0.005) U.uSurface.value = surfaceTarget;
  // A blink is aesthetic animation in demo only, never presented as face capture.
  const blinkPhase = (t + 0.4) % 4.7;
  U.uEyeOpen.value = demo && !reducedMotion ? 1 - 0.94 * Math.exp(-Math.pow((blinkPhase - 0.13) / 0.065, 2)) : 1;
  const goal = present || avatarPreview || manualCentral || modelSelected ? 2 : 1;
  stage =
    stage < 1
      ? Math.min(1, stage + Math.min(rawDt, 0.15) / (reducedMotion ? 0.2 : 2.4))
      : clamp(
          stage + (Math.sign(goal - stage) * Math.min(rawDt, 0.15)) / (reducedMotion ? 0.25 : goal > stage ? 1.8 : 2.1),
          1,
          2,
        );
  U.uStage.value = stage;
  const av = clamp(stage - 1, 0, 1);
  const fx = clamp((stage - 0.7) / 0.3, 0, 1);
  rings.material.uniforms.uOn.value = fx * (1 - av);
  dust.material.uniforms.uOn.value = fx * (reducedMotion ? 0.1 : 0.25);

  // Keep the anatomical silhouette stable: no random body glitches.
  U.uGlitch.value = 0;
  continuous.mesh.visible = !modelSelected && !manualCentral && stage > 1.4 && U.uSurface.value > 0.001;
  customModel.mesh.visible = modelSelected && !manualCentral && !productMode && stage > 1.4;

  // plataforma a la altura de los pies (solo si se ven las piernas)
  const feetVis = Math.min(V[27], V[28]);
  const lowest = Math.min(J[27].y, J[28].y, J[29].y, J[30].y, J[31].y, J[32].y);
  if (feetVis > 0.5) floorY += (lowest - 0.05 - floorY) * k * 0.3;
  floor.position.set(J[MID_H].x, floorY, J[MID_H].z);
  floor.material.uniforms.uOn.value += ((feetVis > 0.5 ? av : 0) - floor.material.uniforms.uOn.value) * k * 0.3;

  stagePlatform.group.position.copy(floor.position);
  stagePlatform.group.position.y -= 0.025;
  stagePlatform.update(portrait && innerWidth > 700 ? 0 : floor.material.uniforms.uOn.value);
  floor.visible = effectiveOptions.particles && effectiveOptions.particleDensity > 0 && !(portrait && innerWidth > 700);

  // "mirar la hora": muñeca izquierda levantada frente al pecho → holograma del reloj
  const watchAmt = watch.update(now, dt, !eventMode && !studio.state().active && av > 0.9);

  // la cámara sigue suavemente al avatar
  const eventActive = eventMode && !studio.state().enabled;
  cameraRig.follow(dt, present && !crowdActive, eventActive, studio.state().active, portrait, reducedMotion, fitView);
  camera.updateMatrixWorld();
  const menuRect = crowdActive && people.length === 2 ? $('product-menu')?.getBoundingClientRect() : null;
  crowd.update({
    now,
    dt,
    active: crowdActive,
    surfaceOn,
    appearance,
    options: effectiveOptions,
    particleDensity: effectiveOptions.particleDensity,
    reservedLeft:
      menuRect && menuRect.left < innerWidth * 0.15 && menuRect.right < innerWidth * 0.45
        ? (menuRect.right + 12) / innerWidth
        : 0,
  });
  if (crowdActive) {
    particles.visible = false;
    continuous.mesh.visible = false;
    floor.visible = false;
    stagePlatform.group.visible = false;
  } else {
    particles.visible = effectiveOptions.particles;
    stagePlatform.group.visible = true;
  }
  eventStage.update({
    now,
    dt: Math.min(rawDt, 0.1),
    hands,
    active: eventActive && !productMode && !dialogOpen,
    present,
    demo,
    reducedMotion,
    online: camOk && now - lastMsg < 2000,
    framing: tracker.issue === 'framing' || tracker.issue === 'uncertain',
    project: hand => {
      if (!present || stage < 1.95 || hand.side === null || V[hand.side] < 0.6) return null;
      const p = J[hand.side].clone().project(camera);
      return { x: (p.x + 1) / 2, y: (1 - p.y) / 2 };
    },
  });

  // HUD. No camera frame is uploaded; scene labels distinguish live capture from demo.
  if (now - lastHUD > 180) {
    lastHUD = now;
    crowdState = crowd.state();
    participantState = people.map(p => ({
      id: p.id,
      slot: p.slot,
      observedAt: p.observedAt,
      ambiguous: p.ambiguous,
      hands: p.hands.length,
    }));
    const capture = webcam.metrics();
    const webcamSource = sources.mode === 'webcam';
    center.metrics({
      renderFps: fpsAvg,
      analysisFps: webcamSource ? capture.analysisFps : camFps,
      captureFps: webcamSource ? capture.captureFps || 0 : camFps,
      effectiveQuality: `${quality === 'auto' ? `Auto (${qualityRamp.state})` : 'Manual'} · escala ${effectiveOptions.renderScale.toFixed(2)} · partículas ${Math.round(effectiveOptions.particleDensity * 100)}% · análisis máx. ${effectiveOptions.analysisFps} FPS`,
    });
    const online = camOk && now - lastMsg < 2000;
    hud.status({
      demo,
      present,
      online,
      incomplete: online && (tracker.issue === 'framing' || tracker.issue === 'uncertain'),
      webcam: webcamSource,
      torsoDist: tracker.torsoDist,
      idle: present && now - lastInteraction > 7000,
    });
  }
  hud.frame(present, stage, guideHidden, watchAmt > 0.5, camOk && now - lastMsg < 1500);
  if (hud.debugVisible())
    hud.debug({
      fps: fpsAvg,
      camOk,
      camFps,
      presence,
      present,
      torsoDist: tracker.torsoDist,
      feetVis,
      hands: tracker.handSeen.map(seen => now - seen < 300),
      watch: watchAmt,
    });

  renderer.info.reset();
  if (productMode) {
    renderer.clear();
    gallery.render();
    eventStage.render(renderer);
  } else {
    composer.render();
    studio.render(renderer, { dt: Math.min(rawDt, 0.15), time: t, reducedMotion });
    eventStage.render(renderer);
  }
  window.__vision3d = {
    ready: true,
    demo,
    present,
    stage,
    fps: Math.round(fpsAvg),
    quality,
    renderScale: effectiveOptions.renderScale,
    dynamicScale: pacer.scale,
    fpsLimit: options.fpsLimit,
    particles: Math.floor(N * effectiveOptions.particleDensity),
    capture: { source: sources.mode, ...webcam.metrics() },
    settings: { ...options },
    effectiveSettings: { ...effectiveOptions },
    triangles: modelSelected ? custom.triangles : surfaceOn ? continuous.triangles : 0,
    reducedMotion,
    surface: surfaceOn,
    surfaceAmount: U.uSurface.value,
    camera: camOk,
    tracking: tracker.issue,
    hands: tracker.handSeen.map(t => now - t < 300),
    finite: J.every(j => Number.isFinite(j.x + j.y + j.z)),
    watch: watchAmt,
    drawCalls: renderer.info.render.calls,
    appearance,
    finish,
    portrait,
    studio: studio.state(),
    event: eventStage.state(),
    gallery: gallery.state(),
    crowd: crowdState,
    participants: participantState,
    controllerId,
    particleEffects: effects.state(),
    background: backgrounds.state(),
    customModel: { ...custom, visible: customModel.mesh.visible },
  };
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

addEventListener('resize', () => {
  fitView();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  bloom.resolution.set(innerWidth / 2, innerHeight / 2);
  fitRain();
});

// A tap reacts once; dragging remains available for objects and never bursts.
const buttonEditor = installButtonEditor({ center, gallery, onEditing: value => (buttonsEditing = value) });
installScenePointer({
  effects,
  gallery,
  eventStage,
  customModel,
  getModelUse: () => options.modelUse,
  isBlocked: () => buttonEditor.editing,
});
installSceneEditor({
  center,
  handInput,
  onOpen: () => {
    if (options.participantCursor) center.save({ participantCursor: false });
  },
  defaults: { zone: DEFAULT_HAND_ZONE, distance: 8.6 },
  // Vista previa mientras se arrastra; al soltar, center.save guarda y applyOptions lo vuelve a aplicar.
  applyLive: ({ zone, distance }) => {
    if (zone) applyHandZone(zone);
    if (distance) options.cameraDistance = distance;
  },
});
installSceneEditor({
  center,
  handInput,
  participation: true,
  defaults: { zone: { x: 0, y: 0, width: 1, height: 1 }, distance: 8.6 },
  applyLive: ({ zone }) => {
    if (!zone) return;
    const tracking = captureTrackingOptions({ ...options, participationZone: zone });
    participants.configure({ ...options, ...tracking });
    void webcam.configure(tracking).catch(error => center.message(error.message));
  },
});
installFloatingPanels();
addEventListener('pagehide', event => {
  if (!event.persisted) {
    backgrounds.dispose();
    customModel.dispose();
    crowd.dispose();
  }
});

renderer.domElement.addEventListener('webglcontextlost', event => {
  event.preventDefault();
  $('fatal').hidden = false;
  $('fatal-detail').textContent = 'Se interrumpió la aceleración gráfica. Recarga la escena para recuperarla.';
});
