// Modelo de configuración: valores por defecto (DEFAULTS), presets, validación y
// persistencia en localStorage (createSettings, loadSettings).
import { RESOURCE_LABELS, resourceStore } from './resources.js';
import { downloadBlob as download } from './download.js';
import { validButtonLayout } from './button-layout.js';
import { CURSOR_PROFILES, matchingCursorProfile } from './cursor-profiles.js';
export const STORAGE_KEY = 'vision3d.beta.settings.v2';
export const LEGACY_STORAGE_KEY = 'vision3d.beta.settings.v1';
export const PRE_CURSOR_PROFILES_KEY = `${STORAGE_KEY}.before-cursor-profiles`;
export const PRE_CLASSIC_DEFAULT_KEY = `${STORAGE_KEY}.before-classic-default`;
export const CLASSIC_DEFAULT_APPLIED_KEY = `${STORAGE_KEY}.classic-default-applied`;
export const RIG_ROLES = Object.freeze([
  'hips',
  'spine',
  'chest',
  'neck',
  'head',
  'leftUpperArm',
  'leftLowerArm',
  'leftHand',
  'rightUpperArm',
  'rightLowerArm',
  'rightHand',
  'leftUpperLeg',
  'leftLowerLeg',
  'leftFoot',
  'rightUpperLeg',
  'rightLowerLeg',
  'rightFoot',
]);
export const DEFAULTS = Object.freeze({
  initialView: 'avatar',
  autoReturnToMenu: false,
  maxParticipants: 2,
  controllerSlot: 0,
  showMissingParts: true,
  participantCursor: false,
  cursorStability: 'legacy',
  cursorProfile: 'classic',
  participationZone: { x: 0, y: 0, width: 1, height: 1 },
  buttonLayout: {},
  background: 'solid',
  bgColor: '#050b0c',
  bgEnd: '#12352a',
  color: '#66efbc',
  surface: false,
  appearance: 'neutral',
  finish: 'natural',
  skin: '#c98e6b',
  portrait: false,
  rain: true,
  particles: true,
  bloom: true,
  trails: false,
  reducedMotion: false,
  quality: 'auto',
  renderScale: 1,
  particleDensity: 0.6,
  captureWidth: 1280,
  analysisFps: 15,
  // Optimizaciones de videojuego (app/frame-pacing.js): escala la resolución para mantener los FPS
  // y, opcionalmente, limita los FPS para ahorrar batería y calor. 0 = sin límite.
  dynamicResolution: true,
  fpsLimit: 0,
  preview: true,
  // Las manos mueven el cursor (galería, evento, estudio). Apagado, el avatar sigue el cuerpo y las manos igual.
  handCursor: true,
  // Zona de la imagen de la cámara (0–1) que ocupa toda la pantalla para el cursor; se edita en el editor de áreas.
  handZoneX: 0.12,
  handZoneY: 0.08,
  handZoneWidth: 0.76,
  handZoneHeight: 0.84,
  // Distancia de la cámara de la escena al escenario, en unidades de escena.
  cameraDistance: 8.6,
  particleShape: 'circle',
  particleSize: 1,
  particleLayout: 'auto',
  particleTarget: 'both',
  particleColorMode: 'single',
  particlePalette: ['#66efbc', '#ff668c', '#6699ff'],
  particleColorBy: 'particle',
  particleColorSpeed: 0,
  clickEffect: 'none',
  clickIntensity: 1,
  clickRadius: 0.6,
  clickDuration: 1,
  videoId: '',
  videoUrl: '',
  videoSource: 'local',
  videoLoop: true,
  videoPaused: false,
  videoDim: 0.45,
  modelId: '',
  modelUse: 'display',
  modelAnimation: '',
  modelPlaying: true,
  modelScale: 1,
  modelYaw: 0,
  modelRig: {},
});
export const PRESETS = Object.freeze({
  low: { renderScale: 0.7, particleDensity: 0.25, bloom: false, trails: false, captureWidth: 640, analysisFps: 10 },
  balanced: { renderScale: 1, particleDensity: 0.6, bloom: true, trails: false, captureWidth: 1280, analysisFps: 15 },
  high: { renderScale: 1, particleDensity: 1, bloom: true, trails: true, captureWidth: 1280, analysisFps: 20 },
});
const enums = {
  cursorProfile: [...Object.keys(CURSOR_PROFILES), 'custom'],
  cursorStability: ['smooth', 'normal', 'fast', 'legacy'],
  initialView: ['avatar', 'collection'],
  background: ['solid', 'gradient', 'video'],
  appearance: ['neutral', 'feminine', 'masculine', 'tree'],
  finish: ['natural', 'sculpture', 'hologram'],
  quality: ['auto', 'low', 'balanced', 'high', 'custom'],
  particleShape: ['circle', 'square', 'diamond', 'star'],
  particleLayout: ['auto', 'cloud', 'sphere', 'waves'],
  particleTarget: ['ambient', 'central', 'both'],
  particleColorMode: ['single', 'rainbow', 'palette'],
  particleColorBy: ['particle', 'height'],
  clickEffect: ['none', 'wave', 'burst', 'attract', 'repel'],
  videoSource: ['local', 'url'],
  modelUse: ['display', 'tracking'],
};
const bounds = {
  renderScale: [0.5, 1.5],
  particleDensity: [0, 1],
  analysisFps: [5, 30],
  particleSize: [0.5, 4],
  particleColorSpeed: [0, 2],
  clickIntensity: [0, 2],
  clickRadius: [0.1, 2],
  clickDuration: [0.2, 3],
  videoDim: [0, 1],
  modelScale: [0.2, 3],
  modelYaw: [-180, 180],
  handZoneX: [0, 0.7],
  handZoneY: [0, 0.7],
  handZoneWidth: [0.3, 1],
  handZoneHeight: [0.3, 1],
  cameraDistance: [5, 14],
};
const hex = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
const safeText = value => typeof value === 'string' && value.length <= 200 && !/[\u0000-\u001f]/.test(value);
export function validateSettings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Configuración inválida.');
  const result = structuredClone(DEFAULTS);
  for (const [key, v] of Object.entries(value)) {
    if (!Object.hasOwn(DEFAULTS, key)) throw Error(`Opción desconocida: ${key}.`);
    let valid;
    if (enums[key]) valid = enums[key].includes(v);
    else if (key === 'maxParticipants' || key === 'controllerSlot')
      valid = Number.isInteger(v) && v >= (key === 'maxParticipants' ? 1 : 0) && v <= 4;
    else if (key === 'participationZone')
      valid =
        v &&
        !Array.isArray(v) &&
        Object.keys(v).length === 4 &&
        ['x', 'y', 'width', 'height'].every(
          k => typeof v[k] === 'number' && Number.isFinite(v[k]) && v[k] >= 0 && v[k] <= 1,
        ) &&
        v.width >= 0.3 &&
        v.height >= 0.3 &&
        v.x + v.width <= 1.000001 &&
        v.y + v.height <= 1.000001;
    else if (bounds[key])
      valid = typeof v === 'number' && Number.isFinite(v) && v >= bounds[key][0] && v <= bounds[key][1];
    else if (key === 'buttonLayout') valid = validButtonLayout(v);
    else if (key === 'captureWidth') valid = [640, 1280, 1920].includes(v);
    else if (key === 'fpsLimit') valid = [0, 30, 60].includes(v);
    else if (key === 'particlePalette') valid = Array.isArray(v) && v.length >= 2 && v.length <= 8 && v.every(hex);
    else if (key === 'modelRig')
      valid =
        v &&
        typeof v === 'object' &&
        !Array.isArray(v) &&
        Object.entries(v).every(([role, bone]) => RIG_ROLES.includes(role) && safeText(bone));
    else if (key === 'videoId' || key === 'modelId')
      valid = typeof v === 'string' && (v === '' || /^[a-zA-Z0-9-]{1,80}$/.test(v));
    else if (key === 'modelAnimation') valid = safeText(v);
    else if (key === 'videoUrl') {
      valid = v === '';
      if (typeof v === 'string' && v.length <= 2048 && v) {
        try {
          const url = new URL(v);
          valid = url.protocol === 'https:' && !url.username && !url.password;
        } catch {
          valid = false;
        }
      }
    } else if (typeof DEFAULTS[key] === 'boolean') valid = typeof v === 'boolean';
    else valid = hex(v);
    if (!valid) throw Error(`Valor inválido: ${key}.`);
    result[key] = structuredClone(v);
  }
  const EDGE = 1.0001;
  if (
    !Object.hasOwn(value, 'participantCursor') &&
    ['handZoneX', 'handZoneY', 'handZoneWidth', 'handZoneHeight'].some(key => result[key] !== DEFAULTS[key])
  )
    result.participantCursor = false;
  if (result.handZoneX + result.handZoneWidth > EDGE || result.handZoneY + result.handZoneHeight > EDGE)
    throw Error('La zona de las manos debe quedar dentro de la imagen de la cámara.');
  result.cursorProfile = matchingCursorProfile(result);
  return result;
}
export function validateStore(value) {
  if (!value || ![1, 2].includes(value.version) || !Array.isArray(value.profiles) || value.profiles.length > 50)
    throw Error('Archivo de perfiles incompatible.');
  const ids = new Set();
  const profiles = value.profiles.map(p => {
    if (
      !p ||
      typeof p.id !== 'string' ||
      !/^[a-zA-Z0-9-]{1,80}$/.test(p.id) ||
      ids.has(p.id) ||
      typeof p.name !== 'string' ||
      !p.name.trim() ||
      p.name.trim().length > 60 ||
      /[\u0000-\u001f]/.test(p.name)
    )
      throw Error('Nombre o identificador de perfil inválido.');
    ids.add(p.id);
    return { id: p.id, name: p.name.trim(), settings: validateSettings(p.settings) };
  });
  const previous = validateSettings(value.current);
  const current = Object.hasOwn(value.current, 'cursorProfile')
    ? previous
    : validateSettings({ ...previous, ...CURSOR_PROFILES.classic.settings });
  return { version: 2, current, profiles };
}
function readStored(storage) {
  const raw = storage?.getItem(STORAGE_KEY) ?? storage?.getItem(LEGACY_STORAGE_KEY);
  const data = raw ? validateStore(JSON.parse(raw)) : null;
  if (data?.current.cursorProfile === 'stable' && storage.getItem(CLASSIC_DEFAULT_APPLIED_KEY) === null)
    data.current = validateSettings({ ...data.current, ...CURSOR_PROFILES.classic.settings });
  return data;
}
export function loadSettings(storage) {
  try {
    const data = readStored(storage ?? globalThis.localStorage);
    if (data) return data.current;
  } catch {
    /* Keep defaults available when storage is blocked or damaged. */
  }
  return {
    ...structuredClone(DEFAULTS),
    reducedMotion: globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  };
}
export function createSettings({
  initial = loadSettings(),
  onChange = () => {},
  onSource = () => {},
  onPreview = () => {},
  onCalibrate = () => {},
  onVideoPlay = () => {},
  onVideoPause = () => {},
  onModelApply = () => {},
} = {}) {
  let current = validateSettings(initial),
    profiles = [],
    resources = [];
  // Paneles montados desde fuera (p. ej. el administrador de avatares) que se redibujan con cada cambio.
  const watchers = [];
  const notify = () => watchers.forEach(watcher => watcher(structuredClone(current), resources));
  let modelDetails = { animations: [], bones: [], mapping: {}, compatible: false, status: '' };
  let storedError = '',
    storageSnapshot = null;
  try {
    storageSnapshot = localStorage.getItem(STORAGE_KEY);
    const raw = storageSnapshot ?? localStorage.getItem(LEGACY_STORAGE_KEY),
      newDefault = localStorage.getItem(CLASSIC_DEFAULT_APPLIED_KEY) === null,
      data = raw ? readStored(localStorage) : null;
    if (newDefault) {
      if (localStorage.getItem(STORAGE_KEY) !== storageSnapshot)
        throw Error('Otra pestaña cambió los perfiles. Recarga antes de guardar.');
      if (localStorage.getItem(PRE_CLASSIC_DEFAULT_KEY) === null)
        localStorage.setItem(PRE_CLASSIC_DEFAULT_KEY, raw ?? '{}');
    }
    if (data) {
      profiles = data.profiles;
      if (newDefault || storageSnapshot === null || !Object.hasOwn(JSON.parse(raw).current, 'cursorProfile')) {
        if (localStorage.getItem(STORAGE_KEY) !== storageSnapshot)
          throw Error('Otra pestaña cambió los perfiles. Recarga antes de guardar.');
        if (localStorage.getItem(PRE_CURSOR_PROFILES_KEY) === null) localStorage.setItem(PRE_CURSOR_PROFILES_KEY, raw);
        const migrated = JSON.stringify(data);
        localStorage.setItem(STORAGE_KEY, migrated);
        storageSnapshot = migrated;
      }
    }
    // Mark adoption only after saving succeeds, so a failed write can be retried.
    if (newDefault) localStorage.setItem(CLASSIC_DEFAULT_APPLIED_KEY, '1');
  } catch (error) {
    storedError = `No se pudo recuperar el almacenamiento de perfiles. ${error.message}`;
  }
  const launch = document.querySelector('.masthead .settings-launch');
  const dialog = document.createElement('dialog');
  dialog.className = 'settings-dialog';
  dialog.setAttribute('aria-labelledby', 'settings-title');
  const select = (key, label, options) =>
    `<label class="settings-row"><span>${label}</span><select data-setting="${key}">${options.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>`;
  const color = (key, label) =>
    `<label class="settings-row"><span>${label}</span><input type="color" data-setting="${key}"></label>`;
  const check = (key, label) =>
    `<label class="settings-row"><span>${label}</span><input type="checkbox" data-setting="${key}"></label>`;
  const text = (key, label, placeholder = '') =>
    `<label class="settings-row"><span>${label}</span><input type="text" data-setting="${key}" placeholder="${placeholder}"></label>`;
  const group = (name, content, open = false) =>
    `<details class="settings-group" ${open ? 'open' : ''}><summary>${name}</summary>${content}</details>`;
  const categories = [
    ['camera', 'Cámara'],
    ['look', 'Apariencia'],
    ['particles', 'Partículas'],
    ['resources', 'Recursos'],
    ['performance', 'Rendimiento'],
    ['profiles', 'Perfiles'],
    ['collections', 'Colecciones'],
  ];
  const range = (key, label, min, max, step) =>
    `<label class="settings-row settings-range"><span>${label} <output data-output="${key}"></output></span><input type="range" min="${min}" max="${max}" step="${step}" data-setting="${key}"></label>`;
  dialog.innerHTML = `<header class="settings-header"><div><h2 id="settings-title">Configura tu escena</h2><p>Hardtech · Visión 3D beta</p></div><button type="button" data-action="close" aria-label="Cerrar configuración">×</button></header>
    <label class="settings-mobile-nav">Categoría<select id="settings-category">${categories.map(([id, label]) => `<option value="${id}">${label}</option>`).join('')}</select></label><div class="settings-tabs" role="tablist" aria-label="Configuración">${categories.map(([id, label], i) => `<button type="button" role="tab" id="settings-tab-${id}" aria-controls="settings-${id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${label}</button>`).join('')}</div>
    <section role="tabpanel" id="settings-camera" aria-labelledby="settings-tab-camera"><label class="settings-row"><span>Fuente</span><select id="settings-source"><option value="demo">Demostración</option><option value="webcam">Cámara del navegador</option><option value="oak">OAK-D</option></select></label><label class="settings-row" id="settings-device-row" hidden><span>Dispositivo</span><select id="settings-device"><option value="">Cámara predeterminada</option></select></label><label class="settings-row" id="settings-endpoint-row" hidden><span>Servicio OAK-D</span><input type="url" id="settings-endpoint" placeholder="wss://servidor/cámara"></label><div class="settings-actions"><button type="button" data-action="start">Iniciar</button><button type="button" data-action="stop">Detener</button></div><p id="settings-source-status" role="status">Fuente detenida</p>${check('preview', 'Mostrar vista previa')}${check('handCursor', 'Usar las manos como cursor')}<p class="settings-help">Sin cursor, el avatar te sigue igual pero las manos no seleccionan ni mueven nada.</p><p class="settings-help">La cámara del navegador sigue cuerpo y manos sin medir profundidad física. El vídeo se procesa en tu dispositivo. OAK-D necesita su servicio conectado y no tiene vista previa en esta beta.</p></section>
    <section role="tabpanel" id="settings-look" aria-labelledby="settings-tab-look" hidden>
      ${group(
        'Inicio de presentación',
        select('initialView', 'Vista inicial', [
          ['avatar', 'Avatar'],
          ['collection', 'Colección'],
        ]) +
          check('autoReturnToMenu', 'Volver al menú si no se detecta a nadie') +
          '<p class="settings-help">Desactívalo para mantener el Avatar o producto visible. Activado: vuelve al menú tras 12 segundos sin detección ni interacción.</p>',
        true,
      )}
      ${group(
        'Fondo',
        select('background', 'Tipo de fondo', [
          ['solid', 'Sólido'],
          ['gradient', 'Degradado'],
          ['video', 'Vídeo'],
        ]) +
          color('bgColor', 'Color del fondo') +
          color('bgEnd', 'Segundo color') +
          select('videoSource', 'Fuente de vídeo', [
            ['local', 'Biblioteca local'],
            ['url', 'URL externa'],
          ]) +
          select('videoId', 'Vídeo local', [['', 'Seleccionar vídeo']]) +
          text('videoUrl', 'URL del vídeo', 'https://ejemplo.com/fondo.mp4') +
          check('videoLoop', 'Repetir vídeo') +
          check('videoPaused', 'Pausar vídeo') +
          range('videoDim', 'Oscurecer vídeo', 0, 1, 0.05) +
          `<div class="settings-actions"><button type="button" data-action="video-play">Reproducir vídeo</button><button type="button" data-action="video-pause">Pausar vídeo</button></div><p id="settings-video-status" role="status"></p><p class="settings-help">Los vídeos locales permanecen en este navegador. Las URLs HTTPS deben apuntar directamente a un vídeo MP4/WebM compatible. La reproducción es silenciosa.</p>`,
        true,
      )}
      ${group(
        'Avatar y acabado',
        check('surface', 'Avatar humano sólido') +
          select('appearance', 'Apariencia', [
            ['neutral', 'Neutra'],
            ['feminine', 'Femenina'],
            ['masculine', 'Masculina'],
            ['tree', 'Árbol'],
          ]) +
          select('finish', 'Acabado', [
            ['natural', 'Natural'],
            ['sculpture', 'Marfil y oro'],
            ['hologram', 'Holograma'],
          ]) +
          color('skin', 'Tono de piel') +
          check('portrait', 'Vista de retrato'),
      )}
      ${group(
        'Modelo personalizado',
        select('modelId', 'Fuente del avatar', [['', 'Avatar integrado']]) +
          `<p class="settings-help">Al elegir un modelo se recupera la distribución Automática.</p>` +
          select('modelUse', 'Uso del modelo', [
            ['display', 'Exhibición'],
            ['tracking', 'Seguimiento corporal'],
          ]) +
          select('modelAnimation', 'Animación', [['', 'Sin animación seleccionada']]) +
          check('modelPlaying', 'Reproducir animación') +
          range('modelScale', 'Escala', 0.2, 3, 0.05) +
          range('modelYaw', 'Rotación horizontal', -180, 180, 5) +
          `<p id="settings-model-status" role="status">Añade un modelo GLB desde Recursos.</p><details class="settings-rig"><summary>Mapeo del esqueleto</summary><p class="settings-help">Asigna huesos para seguir el cuerpo. Pecho, cuello y manos son opcionales. Calibra frente a la cámara con postura neutra.</p><div id="settings-rig-roles"></div><button type="button" data-action="calibrate">Calibrar postura</button></details>`,
      )}
      ${group('Efectos generales', color('color', 'Color de efectos') + check('rain', 'Lluvia digital') + check('bloom', 'Brillo') + check('trails', 'Estelas') + check('reducedMotion', 'Reducir movimiento'))}
    </section>
    <section role="tabpanel" id="settings-particles" aria-labelledby="settings-tab-particles" hidden>
      ${group(
        'Forma y distribución',
        check('particles', 'Activar partículas') +
          range('particleDensity', 'Cantidad', 0, 1, 0.05) +
          select('particleShape', 'Forma', [
            ['circle', 'Círculo'],
            ['square', 'Cuadrado'],
            ['diamond', 'Rombo'],
            ['star', 'Estrella'],
          ]) +
          range('particleSize', 'Tamaño', 0.5, 4, 0.1) +
          select('particleLayout', 'Distribución', [
            ['auto', 'Automática'],
            ['cloud', 'Nube'],
            ['sphere', 'Esfera'],
            ['waves', 'Ondas'],
          ]) +
          `<p class="settings-help">Una distribución central manual sustituye el avatar; vuelve a Automática para recuperarlo.</p>` +
          select('particleTarget', 'Aplicar a', [
            ['ambient', 'Ambiente'],
            ['central', 'Figura central'],
            ['both', 'Ambas'],
          ]),
        true,
      )}
      ${group(
        'Color',
        select('particleColorMode', 'Modo de color', [
          ['single', 'Un color'],
          ['rainbow', 'Arcoíris'],
          ['palette', 'Paleta'],
        ]) +
          color('color', 'Color único') +
          `<div class="settings-palette"><p>Paleta de colores (2–8)</p><div id="settings-palette-colors"></div><button type="button" data-action="palette-add">Añadir color</button></div>` +
          select('particleColorBy', 'Distribuir color por', [
            ['particle', 'Partícula'],
            ['height', 'Altura'],
          ]) +
          range('particleColorSpeed', 'Velocidad del color', 0, 2, 0.05),
      )}
      ${group(
        'Interacción al pulsar',
        select('clickEffect', 'Efecto', [
          ['none', 'Ninguno'],
          ['wave', 'Onda y destello'],
          ['burst', 'Explosión'],
          ['attract', 'Atracción'],
          ['repel', 'Repulsión'],
        ]) +
          range('clickIntensity', 'Intensidad', 0, 2, 0.05) +
          range('clickRadius', 'Radio', 0.1, 2, 0.05) +
          range('clickDuration', 'Duración (segundos)', 0.2, 3, 0.1) +
          `<p class="settings-help">Pulsa sobre la escena para activar el efecto. Los botones y el panel no activan partículas.</p>`,
      )}
    </section>
    <section role="tabpanel" id="settings-resources" aria-labelledby="settings-tab-resources" hidden><h3>Biblioteca local</h3><p class="settings-help">Vídeos MP4/WebM de hasta 200 MiB y modelos .glb autocontenidos de hasta 50 MiB. Se guardan en este navegador, sin subirse al servidor.</p><div class="settings-actions"><label class="settings-import">Añadir vídeo<input type="file" data-resource-upload="video" accept="video/mp4,video/webm,.mp4,.webm"></label><label class="settings-import">Añadir modelo GLB<input type="file" data-resource-upload="model" accept=".glb,model/gltf-binary"></label></div><label class="settings-row"><span>Recurso guardado</span><select id="settings-resource"><option value="">Seleccionar recurso</option></select></label><p id="settings-resource-info" role="status">Biblioteca vacía</p><label class="settings-row"><span>Nombre del recurso</span><input id="settings-resource-name" maxlength="120" type="text"></label><div class="settings-actions"><button type="button" data-action="resource-apply">Usar en escena</button><button type="button" data-action="resource-rename">Renombrar</button><button type="button" data-action="resource-download">Descargar</button><button type="button" data-action="resource-delete">Eliminar</button></div><p class="settings-help">Los recursos utilizados por la escena o un perfil no se pueden eliminar. Los JSON de perfiles contienen referencias; descarga los archivos por separado para conservarlos.</p></section>
    <section role="tabpanel" id="settings-performance" aria-labelledby="settings-tab-performance" hidden>${select(
      'quality',
      'Calidad',
      [
        ['auto', 'Automática'],
        ['low', 'Ligera'],
        ['balanced', 'Equilibrada'],
        ['high', 'Alta'],
        ['custom', 'Personalizada'],
      ],
    )}${range('renderScale', 'Escala de renderizado', 0.5, 1.5, 0.05)}${check(
      'dynamicResolution',
      'Resolución dinámica',
    )}${select('fpsLimit', 'Límite de FPS', [
      ['0', 'Sin límite'],
      ['60', '60 FPS'],
      ['30', '30 FPS (ahorro de batería)'],
    ])}${select('captureWidth', 'Resolución de captura', [
      ['640', '640 × 360'],
      ['1280', '1280 × 720'],
      ['1920', '1920 × 1080'],
    ])}${range('analysisFps', 'Análisis máximo (FPS)', 5, 30, 1)}<p class="settings-help">La resolución dinámica baja o sube la resolución de render para mantener los FPS, como en los videojuegos. La resolución final de captura depende de la cámara. Auto reduce además partículas y efectos si, con la resolución al mínimo, el rendimiento sigue bajo. La calidad efectiva puede diferir de estos controles; tus preferencias guardadas se conservan.</p><dl class="settings-metrics"><dt>Renderizado</dt><dd data-metric="renderFps">—</dd><dt>Análisis</dt><dd data-metric="analysisFps">—</dd><dt>Captura</dt><dd data-metric="captureFps">—</dd><dt>Calidad efectiva</dt><dd data-metric="effectiveQuality">—</dd></dl></section>
    <section role="tabpanel" id="settings-profiles" aria-labelledby="settings-tab-profiles" class="settings-profiles" hidden><h3>Tus perfiles</h3><label class="settings-row"><span>Perfil guardado</span><select id="settings-profile"><option value="">Sin seleccionar</option></select></label><label class="settings-row"><span>Nombre</span><input id="settings-profile-name" type="text" maxlength="60" placeholder="Mi configuración"></label><div class="settings-actions"><button type="button" data-action="save">Guardar nuevo</button><button type="button" data-action="apply">Aplicar</button><button type="button" data-action="update">Actualizar</button><button type="button" data-action="duplicate">Duplicar</button><button type="button" data-action="delete">Eliminar</button></div><div class="settings-actions"><button type="button" data-action="export">Exportar JSON</button><label class="settings-import">Importar JSON<input type="file" id="settings-import" accept=".json,application/json"></label><button type="button" data-action="reset">Restablecer escena</button></div><p class="settings-help">Guardados en este navegador. Los perfiles no incluyen permisos, dispositivos ni conexiones de cámara. Los recursos locales se conservan por referencia y no se incluyen en el JSON.</p></section><section role="tabpanel" id="settings-collections" aria-labelledby="settings-tab-collections" class="settings-collections" hidden></section><p class="settings-message" role="alert"></p>`;
  document.body.append(dialog);
  [...dialog.querySelectorAll('.settings-group')].find(
    group => group.querySelector('summary').textContent === 'Modelo personalizado',
  ).id = 'settings-model-group';
  dialog.querySelector('#settings-camera').insertAdjacentHTML(
    'beforeend',
    group(
      'Participantes',
      select('maxParticipants', 'Máximo de avatares', [
        [1, '1'],
        [2, '2'],
        [3, '3'],
        [4, '4'],
      ]) +
        select('controllerSlot', 'Quién controla los botones', [
          [0, 'Automático: primer participante'],
          [1, 'Participante 1'],
          [2, 'Participante 2'],
          [3, 'Participante 3'],
          [4, 'Participante 4'],
        ]) +
        check('showMissingParts', 'Mostrar partes sin detección') +
        check('participantCursor', 'Cursor centrado en quien controla') +
        select('cursorProfile', 'Perfil de control', [
          ...Object.entries(CURSOR_PROFILES).map(([id, profile]) => [id, profile.label]),
          ['custom', 'Personalizado'],
        ]) +
        '<p class="settings-help">Estable usa un área fija y suavizado Suave. Clásico recupera el cursor original de GitHub Pages: una persona, dos manos y toda la imagen, sin fijación ni exigir torso completo. Conserva tus ajustes de participantes y zona para recuperarlos al cambiar de perfil, además de la apariencia y los botones.</p>' +
        select('cursorStability', 'Estabilidad del cursor', [
          ['normal', 'Equilibrado'],
          ['smooth', 'Suave'],
          ['fast', 'Rápido'],
          ['legacy', 'Original de GitHub Pages'],
        ]) +
        '<p class="settings-help">Suave prioriza estabilidad; Rápido responde antes. Mantén la mano quieta dos segundos para fijar el cursor y muévela claramente para soltarlo. Original de GitHub Pages usa el suavizado antiguo sin fijación; cualquier mano detectada puede controlar, incluso sin cuerpo visible.</p>' +
        '<p class="settings-help">Las partes ausentes conservan brevemente su postura y vuelven suavemente a una posición neutra. En los perfiles actuales solo las manos del controlador activan botones; puedes elegirlo y limitar la zona para dejar el público fuera. Clásico usa el primer cuerpo y las dos manos detectadas en toda la imagen. Los GLB propios usan un participante.</p>',
      true,
    ),
  );
  const q = s => dialog.querySelector(s),
    message = text => {
      q('.settings-message').textContent = text;
    };
  q('[data-setting="cursorProfile"] option[value="custom"]').disabled = true;
  const sync = () => {
    for (const el of dialog.querySelectorAll('[data-setting]')) {
      const v = current[el.dataset.setting];
      if (el.type === 'checkbox') el.checked = v;
      else el.value = Array.isArray(v) ? v.join(', ') : v;
      const out = q(`[data-output="${el.dataset.setting}"]`);
      if (out) out.value = el.dataset.setting === 'particleDensity' ? `${Math.round(v * 100)}%` : v;
    }
    syncRig();
    syncPalette();
    notify();
  };
  const profileOptions = (selected = '') => {
    const el = q('#settings-profile');
    el.replaceChildren(new Option('Sin seleccionar', ''));
    for (const p of profiles) el.add(new Option(p.name, p.id));
    el.value = selected;
  };
  const persist = (next, nextProfiles = profiles) => {
    const data = validateStore({ version: 2, current: next, profiles: nextProfiles });
    if (localStorage.getItem(STORAGE_KEY) !== storageSnapshot)
      throw Error(
        'Otra pestaña cambió la configuración o los perfiles. Recarga antes de guardar para conservar esos cambios.',
      );
    const serialized = JSON.stringify(data);
    localStorage.setItem(STORAGE_KEY, serialized);
    storageSnapshot = serialized;
    current = data.current;
    profiles = data.profiles;
    sync();
    return data;
  };
  const change = next => {
    const previous = current.preview;
    persist(next);
    populateResourceOptions();
    onChange({ ...current });
    if (previous !== current.preview) onPreview(current.preview);
  };
  sync();
  profileOptions();
  message(storedError);
  launch.onclick = () => dialog.showModal();
  const tabs = [...dialog.querySelectorAll('[role=tab]')];
  const activate = tab => {
    q('#settings-category').value = tab.id.replace('settings-tab-', '');
    for (const t of tabs) {
      const active = t === tab;
      t.setAttribute('aria-selected', String(active));
      t.tabIndex = active ? 0 : -1;
      q(`#${t.getAttribute('aria-controls')}`).hidden = !active;
    }
  };
  q('#settings-category').onchange = () => activate(q(`#settings-tab-${q('#settings-category').value}`));
  for (const tab of tabs) {
    tab.onclick = () => activate(tab);
    tab.onkeydown = e => {
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
        e.preventDefault();
        const i =
          e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? tabs.length - 1
              : (tabs.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
        activate(tabs[i]);
        tabs[i].focus();
      }
    };
  }
  for (const el of dialog.querySelectorAll('[data-setting]'))
    el.onchange = () => {
      try {
        const key = el.dataset.setting;
        let value =
          key === 'particlePalette'
            ? el.value.split(',').map(v => v.trim())
            : el.type === 'checkbox'
              ? el.checked
              : typeof DEFAULTS[key] === 'number'
                ? Number(el.value)
                : el.value;
        let next = { ...current, [key]: value };
        if (key === 'cursorProfile' && Object.hasOwn(CURSOR_PROFILES, value))
          Object.assign(next, CURSOR_PROFILES[value].settings);
        if (key === 'modelId' && value !== current.modelId) {
          next.modelRig = {};
          next.modelAnimation = '';
          if (value) next.particleLayout = 'auto';
        }
        if (key === 'quality' && value !== 'custom')
          Object.assign(next, PRESETS[value === 'auto' ? 'balanced' : value]);
        else if (['renderScale', 'particleDensity', 'captureWidth', 'analysisFps', 'bloom', 'trails'].includes(key))
          next.quality = 'custom';
        change(next);
        message('');
      } catch (e) {
        sync();
        message(`No se guardaron los cambios. ${e.message}`);
      }
    };
  q('#settings-source').onchange = () => {
    const source = q('#settings-source').value;
    q('#settings-device-row').hidden = source !== 'webcam';
    q('#settings-endpoint-row').hidden = source !== 'oak';
    onSource({ source: 'off' });
  };
  q('#settings-profile').onchange = () => {
    q('#settings-profile-name').value = profiles.find(p => p.id === q('#settings-profile').value)?.name || '';
  };
  const profileName = () => {
    const name = q('#settings-profile-name').value.trim();
    if (!name || name.length > 60 || /[\u0000-\u001f]/.test(name))
      throw Error('Escribe un nombre de 1 a 60 caracteres.');
    return name;
  };
  dialog.addEventListener('click', async e => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    try {
      const selected = q('#settings-profile').value,
        p = profiles.find(p => p.id === selected);
      if (action === 'close') return dialog.close();
      if (action === 'calibrate') return await onCalibrate();
      if (action === 'video-play') {
        change({ ...current, videoPaused: false });
        return await onVideoPlay();
      }
      if (action === 'video-pause') {
        change({ ...current, videoPaused: true });
        return await onVideoPause();
      }
      if (action === 'stop') return await onSource({ source: 'off' });
      if (action === 'start') {
        const source = q('#settings-source').value,
          endpoint = q('#settings-endpoint').value.trim();
        if (source === 'oak') {
          let url;
          try {
            url = new URL(endpoint);
          } catch {
            throw Error('Escribe la conexión WebSocket de tu servicio OAK-D.');
          }
          if (!['ws:', 'wss:'].includes(url.protocol) || url.username || url.password)
            throw Error('Usa una conexión ws:// o wss:// sin credenciales.');
        }
        await onSource({ source, deviceId: q('#settings-device').value, endpoint });
        return;
      }
      if (action.startsWith('palette-')) {
        const colors = [...current.particlePalette],
          index = Number(e.target.closest('[data-action]').dataset.index);
        if (action === 'palette-add' && colors.length < 8) colors.push('#ffffff');
        if (action === 'palette-remove' && colors.length > 2) colors.splice(index, 1);
        if (action === 'palette-up' && index > 0)
          [colors[index - 1], colors[index]] = [colors[index], colors[index - 1]];
        if (action === 'palette-down' && index < colors.length - 1)
          [colors[index], colors[index + 1]] = [colors[index + 1], colors[index]];
        change({ ...current, particlePalette: colors });
      }
      if (action.startsWith('resource-')) {
        const entry = resources.find(item => item.id === q('#settings-resource').value);
        if (!entry) throw Error('Selecciona un recurso.');
        if (action === 'resource-apply') {
          if (entry.type === 'audio')
            throw Error('Los sonidos se usan al abrir un elemento: añádelos en Configuración → Colecciones.');
          change({
            ...current,
            ...(entry.type === 'video'
              ? { videoId: entry.id, videoSource: 'local', background: 'video' }
              : {
                  modelId: entry.id,
                  particleLayout: 'auto',
                  ...(current.modelId !== entry.id ? { modelRig: {}, modelAnimation: '' } : {}),
                }),
          });
          activate(q('#settings-tab-look'));
          if (entry.type === 'model') {
            q('#settings-model-group').open = true;
            await onModelApply();
          } else q('#settings-look .settings-group').open = true;
        }
        if (action === 'resource-rename') {
          await resourceStore.rename(entry.id, q('#settings-resource-name').value);
          await refreshResources(entry.id);
        }
        if (action === 'resource-download') {
          const suffix =
            entry.type === 'model'
              ? '.glb'
              : (entry.blob.name?.match(/\.(mp4|webm|mp3|ogg|oga|wav|m4a)$/i)?.[0] ??
                (entry.type === 'audio' ? '.mp3' : null) ??
                (entry.blob.type === 'video/webm' ? '.webm' : '.mp4'));
          download(
            entry.blob,
            entry.name.toLowerCase().endsWith(suffix.toLowerCase()) ? entry.name : entry.name + suffix,
          );
        }
        if (action === 'resource-delete') {
          assertResourceUnused(entry.id);
          if (!confirm(`¿Eliminar el recurso «${entry.name}» de este navegador?`)) return;
          assertResourceUnused(entry.id);
          await resourceStore.remove(entry.id);
          await refreshResources();
        }
      }
      if (action === 'save' || action === 'duplicate') {
        if (profiles.length >= 50) throw Error('Máximo 50 perfiles. Exporta o elimina alguno.');
        if (action === 'duplicate' && !p) throw Error('Selecciona un perfil.');
        const id = crypto.randomUUID();
        const name = action === 'duplicate' ? `${p.name.slice(0, 54)} copia` : profileName();
        persist(current, [...profiles, { id, name, settings: action === 'duplicate' ? p.settings : current }]);
        profileOptions(id);
        q('#settings-profile-name').value = name;
      }
      if (['apply', 'update', 'delete'].includes(action)) {
        if (!p) throw Error('Selecciona un perfil.');
        if (action === 'apply') {
          change(p.settings);
          if (p.settings.modelId) await onModelApply();
        }
        if (action === 'update') {
          persist(
            current,
            profiles.map(item => (item.id === p.id ? { ...item, name: profileName(), settings: current } : item)),
          );
          profileOptions(p.id);
        }
        if (action === 'delete') {
          if (!confirm(`¿Eliminar el perfil «${p.name}»?`)) return;
          persist(
            current,
            profiles.filter(item => item.id !== p.id),
          );
          profileOptions();
          q('#settings-profile-name').value = '';
        }
      }
      if (action === 'reset')
        change({ ...DEFAULTS, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches });
      if (action === 'export') {
        const url = URL.createObjectURL(
          new Blob([JSON.stringify({ version: 2, current, profiles }, null, 2)], { type: 'application/json' }),
        );
        const a = document.createElement('a');
        a.href = url;
        a.download = 'vision3d-perfiles.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      message('');
    } catch (e) {
      message(`No se completó la acción. ${e.message}`);
    }
  });
  q('#settings-import').onchange = async e => {
    try {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 524288) throw Error('El archivo debe ser menor de 512 KiB.');
      const data = JSON.parse(await file.text());
      if (profiles.length && !confirm('La importación reemplazará todos tus perfiles guardados. ¿Continuar?')) return;
      restore(data);
      message('Perfiles importados. Los recursos locales deben existir en este navegador; no se incluyen en el JSON.');
    } catch (error) {
      message(`No se importó el archivo. ${error.message}`);
    } finally {
      e.target.value = '';
    }
  };
  // Sustituye la escena y los perfiles por los de una copia (Importar JSON o copia completa del dispositivo).
  function restore(raw) {
    const data = validateStore(raw);
    const previous = current.preview;
    persist(data.current, data.profiles);
    profileOptions();
    populateResourceOptions();
    onChange({ ...current });
    if (previous !== current.preview) onPreview(current.preview);
  }
  function assertResourceUnused(id) {
    const latest = readStored(localStorage);
    if (
      [current, latest?.current, ...(latest?.profiles ?? profiles).map(profile => profile.settings)]
        .filter(Boolean)
        .some(settings => settings.videoId === id || settings.modelId === id)
    )
      throw Error(
        'Este recurso está utilizado por la escena o un perfil. Cambia esas referencias antes de eliminarlo.',
      );
  }
  function resourceSelection() {
    const entry = resources.find(item => item.id === q('#settings-resource').value);
    q('#settings-resource-name').value = entry?.name ?? '';
    q('#settings-resource-info').textContent = entry
      ? `${RESOURCE_LABELS[entry.type] ?? 'Recurso'} · ${(entry.blob.size / 1024 / 1024).toFixed(1)} MiB`
      : 'Biblioteca vacía o sin selección';
  }
  function populateResourceOptions() {
    for (const [key, type, label] of [
      ['videoId', 'video', 'Seleccionar vídeo'],
      ['modelId', 'model', 'Avatar integrado'],
    ]) {
      const el = q(`[data-setting="${key}"]`);
      el.replaceChildren(new Option(label, ''));
      for (const entry of resources.filter(item => item.type === type)) el.add(new Option(entry.name, entry.id));
      if (current[key] && !resources.some(entry => entry.id === current[key] && entry.type === type))
        el.add(new Option('Recurso no disponible en este navegador', current[key]));
      el.value = current[key];
    }
  }
  async function refreshResources(selected = q('#settings-resource').value) {
    resources = await resourceStore.list();
    const el = q('#settings-resource');
    el.replaceChildren(new Option('Seleccionar recurso', ''));
    for (const entry of resources)
      el.add(new Option(`${RESOURCE_LABELS[entry.type] ?? 'Recurso'}: ${entry.name}`, entry.id));
    el.value = selected;
    populateResourceOptions();
    resourceSelection();
    notify();
  }
  q('#settings-resource').onchange = resourceSelection;
  for (const input of dialog.querySelectorAll('[data-resource-upload]'))
    input.onchange = async () => {
      try {
        const file = input.files[0];
        if (!file) return;
        const entry = await resourceStore.add(file, input.dataset.resourceUpload);
        await refreshResources(entry.id);
        message('Recurso guardado. Pulsa Usar en escena para aplicarlo.');
      } catch (error) {
        message(`No se guardó el recurso. ${error.message}`);
      } finally {
        input.value = '';
      }
    };
  function syncPalette() {
    const list = q('#settings-palette-colors');
    if (list.children.length !== current.particlePalette.length) {
      list.replaceChildren();
      current.particlePalette.forEach((color, index) => {
        const row = document.createElement('div');
        row.className = 'settings-palette-row';
        const label = document.createElement('label');
        label.textContent = `Color ${index + 1}`;
        const input = document.createElement('input');
        input.type = 'color';
        input.setAttribute('aria-label', `Color ${index + 1} de la paleta`);
        label.append(input);
        row.append(label);
        for (const [action, text] of [
          ['up', '↑'],
          ['down', '↓'],
          ['remove', 'Quitar'],
        ]) {
          const button = document.createElement('button');
          button.type = 'button';
          button.dataset.action = `palette-${action}`;
          button.dataset.index = String(index);
          button.textContent = text;
          button.setAttribute(
            'aria-label',
            `${action === 'up' ? 'Subir' : action === 'down' ? 'Bajar' : 'Quitar'} color ${index + 1}`,
          );
          row.append(button);
        }
        list.append(row);
        input.onchange = () => {
          try {
            const colors = [...current.particlePalette];
            colors[index] = input.value;
            change({ ...current, particlePalette: colors });
            message('');
          } catch (error) {
            syncPalette();
            message(`No se guardó la paleta. ${error.message}`);
          }
        };
      });
    }
    [...list.children].forEach((row, index) => {
      row.querySelector('input').value = current.particlePalette[index];
      row.querySelector('[data-action="palette-up"]').disabled = index === 0;
      row.querySelector('[data-action="palette-down"]').disabled = index === current.particlePalette.length - 1;
      row.querySelector('[data-action="palette-remove"]').disabled = current.particlePalette.length <= 2;
    });
    q('[data-action="palette-add"]').disabled = current.particlePalette.length >= 8;
  }
  function syncRig() {
    for (const select of dialog.querySelectorAll('[data-rig-role]'))
      select.value = current.modelRig[select.dataset.rigRole] ?? modelDetails.mapping[select.dataset.rigRole] ?? '';
  }
  function modelInfo(info) {
    modelDetails = { animations: [], bones: [], mapping: {}, compatible: false, status: '', ...info };
    const animations = q('[data-setting="modelAnimation"]');
    animations.replaceChildren(new Option('Sin animación seleccionada', ''));
    for (const name of modelDetails.animations) animations.add(new Option(name, name));
    animations.value = current.modelAnimation;
    const roles = q('#settings-rig-roles');
    roles.replaceChildren();
    const labels = {
      hips: 'Cadera',
      spine: 'Columna',
      chest: 'Pecho (opcional)',
      neck: 'Cuello (opcional)',
      head: 'Cabeza',
      leftUpperArm: 'Brazo izquierdo',
      leftLowerArm: 'Antebrazo izquierdo',
      leftHand: 'Mano izquierda (opcional)',
      rightUpperArm: 'Brazo derecho',
      rightLowerArm: 'Antebrazo derecho',
      rightHand: 'Mano derecha (opcional)',
      leftUpperLeg: 'Muslo izquierdo',
      leftLowerLeg: 'Pierna izquierda',
      leftFoot: 'Pie izquierdo',
      rightUpperLeg: 'Muslo derecho',
      rightLowerLeg: 'Pierna derecha',
      rightFoot: 'Pie derecho',
    };
    for (const role of RIG_ROLES) {
      const label = document.createElement('label');
      label.className = 'settings-row';
      const text = document.createElement('span');
      text.textContent = labels[role];
      const select = document.createElement('select');
      select.dataset.rigRole = role;
      select.add(new Option('Sin asignar', ''));
      for (const bone of modelDetails.bones) select.add(new Option(bone, bone));
      label.append(text, select);
      roles.append(label);
      select.onchange = () => {
        try {
          const mapping = { ...modelDetails.mapping, ...current.modelRig, [role]: select.value };
          change({ ...current, modelRig: mapping });
          message('');
        } catch (error) {
          syncRig();
          message(`No se guardó el mapeo. ${error.message}`);
        }
      };
    }
    syncRig();
    q('#settings-model-status').textContent =
      modelDetails.status ||
      (modelDetails.bones.length
        ? modelDetails.compatible
          ? 'Esqueleto compatible con seguimiento.'
          : 'Completa el mapeo del esqueleto para seguir el cuerpo.'
        : 'Modelo de exhibición sin esqueleto.');
    q('[data-action="calibrate"]').disabled = !modelDetails.compatible;
  }
  modelInfo({});
  refreshResources().catch(error => message(`Biblioteca local no disponible. ${error.message}`));
  return {
    get values() {
      return structuredClone(current);
    },
    connect(callbacks) {
      onChange = callbacks.onChange ?? onChange;
      onSource = callbacks.onSource ?? onSource;
      onPreview = callbacks.onPreview ?? onPreview;
      onCalibrate = callbacks.onCalibrate ?? onCalibrate;
      onVideoPlay = callbacks.onVideoPlay ?? onVideoPlay;
      onVideoPause = callbacks.onVideoPause ?? onVideoPause;
      onModelApply = callbacks.onModelApply ?? onModelApply;
    },
    set(values) {
      current = validateSettings({ ...current, ...values });
      populateResourceOptions();
      sync();
    },
    status(text) {
      q('#settings-source-status').textContent = text;
    },
    metrics(values) {
      for (const [key, value] of Object.entries(values)) {
        const el = q(`[data-metric="${key}"]`);
        if (el) el.textContent = typeof value === 'number' ? `${value.toFixed(1)} FPS` : String(value);
      }
    },
    devices(list) {
      const el = q('#settings-device'),
        selected = el.value;
      el.replaceChildren(new Option('Cámara predeterminada', ''));
      for (const device of list) el.add(new Option(device.label || `Cámara ${el.options.length}`, device.deviceId));
      el.value = [...el.options].some(o => o.value === selected) ? selected : '';
    },
    source(value) {
      q('#settings-source').value = value === 'off' ? 'demo' : value;
      q('#settings-device-row').hidden = value !== 'webcam';
      q('#settings-endpoint-row').hidden = value !== 'oak';
    },
    videoStatus(text) {
      q('#settings-video-status').textContent = text;
    },
    modelInfo,
    message,
    // Copia de la escena y los perfiles (mismo formato que «Exportar JSON») y su restauración.
    backup: () => ({ version: 2, current: { ...current }, profiles: structuredClone(profiles) }),
    restore,
    // Pestañas que rellena otro módulo (p. ej. «Colecciones»): el contenedor vacío de la categoría `id`.
    panel: id => q(`#settings-${id}`),
    refreshResources: () =>
      refreshResources().catch(error => message(`Biblioteca local no disponible. ${error.message}`)),
    // Guarda cambios hechos fuera del panel (p. ej. el editor de áreas sobre la escena), igual que un control propio.
    save(values) {
      change({ ...current, ...values });
    },
    // Administrador de avatares: recibe la escena y la biblioteca en cada cambio.
    watch(watcher) {
      watchers.push(watcher);
      watcher(structuredClone(current), resources);
    },
    // Cambia el avatar como el resto del panel: integrado ({ appearance }) o GLB de la biblioteca ({ modelId }).
    async useAvatar({ appearance, modelId = '' }) {
      change({
        ...current,
        modelId,
        ...(modelId ? { particleLayout: 'auto' } : { surface: true, appearance }),
        ...(modelId !== current.modelId ? { modelRig: {}, modelAnimation: '' } : {}),
      });
      if (modelId) await onModelApply();
    },
    resourceInUse(id) {
      try {
        assertResourceUnused(id);
        return false;
      } catch {
        return true;
      }
    },
  };
}
