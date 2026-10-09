// Página independiente del reloj (reloj.html): escena three.js con el reloj de partículas
// controlado por las manos (OAK-D por WebSocket) o por el ratón para probar sin cámara.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { AfterimagePass } from 'three/addons/postprocessing/AfterimagePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createWatchParticles, WATCH_TILT } from './watch-particles.js';
import { createClockAmbient } from './ambient.js';
import { createHandSlots } from './hand-slots.js';

// ---------- Configuración por URL: ?n=70000&titulo=...&color=%2339ff88&trails=0&ws=8765 ----------
const params = new URLSearchParams(location.search);
const N = parseInt(params.get('n') || '70000', 10);
const TRAILS = params.get('trails') !== '0';
const MAGIC = new THREE.Color(params.get('color') || '#39ff88');
document.getElementById('title').textContent = params.get('titulo') || '';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const remap = (v, a, b) => clamp((v - a) / (b - a), 0, 1);

// ---------- Escena ----------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1));
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0, 6.5);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
if (TRAILS) composer.addPass(new AfterimagePass(0.7));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 1.0, 0.6, 0.05);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------- Reloj de partículas, ambiente y manos ----------
const { U, hero, tiltG, spinG } = await createWatchParticles({ scene, renderer, magic: MAGIC, count: N });
const { rings, dust, fitRain, updateSilhouette } = createClockAmbient({ scene, camera, spinG, U });
const hands = createHandSlots({ scene, camera, magic: MAGIC });

let camOk = false,
  camFps = 0,
  lastMsg = 0,
  presence = 0;
const mouse = { active: -1e9, x: 0.5, y: 0.5, down: false };

// ---------- WebSocket ----------
function connect() {
  const ws = new WebSocket(`ws://${location.hostname || 'localhost'}:${params.get('ws') || 8765}`);
  ws.onmessage = ev => {
    const d = JSON.parse(ev.data);
    lastMsg = performance.now();
    camOk = d.cam;
    camFps = d.fps || 0;
    if (d.sil) updateSilhouette(d.sil);
    presence = d.pres || 0;
    if (performance.now() - mouse.active > 2500) {
      hands.ingest(
        (d.hands || []).map(h => ({
          ...h,
          rx: h.x,
          ry: h.y,
          // la zona útil del encuadre se estira a toda la pantalla
          x: remap(h.x, 0.12, 0.88),
          y: remap(h.y, 0.08, 0.78),
          lm: h.lm && h.lm.map((v, j) => (j % 2 ? (v - 0.08) / 0.7 : (v - 0.12) / 0.76)),
        })),
      );
    }
  };
  ws.onclose = () => {
    camOk = false;
    setTimeout(connect, 1500);
  };
  ws.onerror = () => ws.close();
}
connect();

// ---------- Mouse / teclado (para probar sin cámara) ----------
let scaleTarget = 1,
  guideHidden = false;
addEventListener('pointermove', e => {
  mouse.active = performance.now();
  mouse.x = e.clientX / innerWidth;
  mouse.y = e.clientY / innerHeight;
});
addEventListener('pointerdown', () => {
  mouse.down = true;
  mouse.active = performance.now();
});
addEventListener('pointerup', () => {
  mouse.down = false;
});
addEventListener('wheel', e => {
  scaleTarget = clamp(scaleTarget * (e.deltaY > 0 ? 0.92 : 1.08), 0.5, 2);
});
addEventListener('keydown', e => {
  if (e.key === 'd') document.body.classList.toggle('debug');
  if (e.key === 'h') guideHidden = !guideHidden;
  if (e.key === 'f')
    document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
});

function clockAngles() {
  const d = new Date();
  const sec = d.getSeconds() + d.getMilliseconds() / 1000;
  const min = d.getMinutes() + sec / 60;
  const hr = (d.getHours() % 12) + min / 60;
  const T = Math.PI * 2;
  return [(hr / 12) * T, (min / 60) * T, (sec / 60) * T];
}

// ---------- Bucle principal ----------
const tmpQ = new THREE.Quaternion(),
  AX = new THREE.Vector3(1, 0, 0),
  AY = new THREE.Vector3(0, 1, 0);
const IDENT = new THREE.Quaternion();
const angVel = new THREE.Vector2();
let prevZoomDist = null,
  lastT = performance.now(),
  fpsAvg = 60,
  stage = 0;
const edges = { left: $('edge-l'), right: $('edge-r'), top: $('edge-t'), bottom: $('edge-b') };

function frame() {
  const now = performance.now();
  const dt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now;
  const t = (U.uTime.value += dt);
  fpsAvg += (1 / Math.max(dt, 1e-3) - fpsAvg) * 0.05;

  // mouse como mano virtual
  if (now - mouse.active < 2500) {
    hands.ingest([
      {
        x: mouse.x,
        y: mouse.y,
        rx: mouse.x * 0.76 + 0.12,
        ry: mouse.y * 0.7 + 0.08,
        z: 1.3,
        raw: true,
        mode: mouse.down ? 'grab' : 'open',
      },
    ]);
  }

  const k = 1 - Math.exp(-dt * 16);
  const active = [];
  hands.slots.forEach((s, i) => {
    // si se pierde la detección, el agarre aguanta 1,5 s con la mano congelada
    if (s.on && now - s.seen > (s.mode === 'grab' ? 1500 : 400)) s.on = false;
    s.alpha += ((s.on ? 1 : 0) - s.alpha) * (1 - Math.exp(-dt * 8));
    if (s.on) {
      s.sx += (s.x - s.sx) * k;
      s.sy += (s.y - s.sy) * k;
      s.sz += (s.z - s.sz) * k * 0.6;
      s.srx += (s.rx - s.srx) * k;
      s.sry += (s.ry - s.sry) * k;
      hands.place(s);
      active.push(s);
    }
    U.uHand.value[i].copy(s.world);
    U.uHandOn.value[i] = s.alpha;
    U.uHandGrab.value[i] += ((s.mode === 'grab' ? 1 : 0) - U.uHandGrab.value[i]) * k;
    const grab = U.uHandGrab.value[i];
    s.sprite.position.copy(s.world);
    s.sprite.material.color.copy(hands.COL_OPEN).lerp(hands.COL_GRAB, grab);
    s.sprite.material.opacity = s.alpha * (s.slm ? 0.3 : 0.9); // con esqueleto, la palma es solo un brillo sutil
    s.sprite.scale.setScalar(s.slm ? 0.35 : 0.55);
    hands.updateSkeleton(s, k, grab, now);
  });

  // aviso de borde: la mano se acerca al límite de lo que ve la cámara
  const near = { left: false, right: false, top: false, bottom: false };
  for (const s of active) {
    if (s.rx < 0.1) near.left = true;
    if (s.rx > 0.9) near.right = true;
    if (s.ry < 0.08) near.top = true;
    if (s.ry > 0.92) near.bottom = true;
  }
  for (const key in edges) edges[key].classList.toggle('on', near[key]);

  // agarrar y girar: usa el movimiento crudo de la mano (sin topes en los bordes)
  const grabbing = active.filter(s => s.mode === 'grab');
  let heldRot = null;
  if (grabbing.length >= 2) {
    const d = grabbing[0].world.distanceTo(grabbing[1].world);
    if (prevZoomDist) scaleTarget = clamp(scaleTarget * (d / prevZoomDist), 0.5, 2);
    prevZoomDist = d;
  } else prevZoomDist = null;
  if (grabbing.length === 1) {
    const g = grabbing[0];
    if (g.prev) {
      heldRot = [(g.srx - g.prev[0]) * 7.0, (g.sry - g.prev[1]) * 5.5];
      angVel.x += (heldRot[0] / dt - angVel.x) * 0.3;
      angVel.y += (heldRot[1] / dt - angVel.y) * 0.3;
    }
  }
  for (const s of hands.slots) s.prev = s.on && s.mode === 'grab' ? [s.srx, s.sry] : null;

  // rotación: sujeto = sigue a la mano 1:1; al soltar, inercia y vuelve a su pose
  if (!grabbing.length) angVel.multiplyScalar(Math.exp(-dt * 1.4));
  else if (!heldRot) angVel.multiplyScalar(Math.exp(-dt * 8));
  const [ry, rx] = heldRot ?? (grabbing.length ? [0, 0] : [angVel.x * dt, angVel.y * dt]);
  tmpQ.setFromAxisAngle(AY, ry);
  hero.quaternion.premultiply(tmpQ);
  tmpQ.setFromAxisAngle(AX, rx);
  hero.quaternion.premultiply(tmpQ);
  if (!grabbing.length && angVel.length() < 0.8) hero.quaternion.slerp(IDENT, 1 - Math.exp(-dt * 1.0));
  U.uSpeed.value += (clamp((angVel.length() - 1.5) / 5, 0, 1) - U.uSpeed.value) * (1 - Math.exp(-dt * 4));
  const pk = 1 - Math.exp(-dt * 1.5);
  tiltG.rotation.x += (WATCH_TILT * clamp(stage - 1, 0, 1) - tiltG.rotation.x) * pk; // el logo mira de frente
  spinG.rotation.y += (Math.sin(t * 0.5) * 0.35 - spinG.rotation.y) * pk; // leve vaivén para que se note el 3D

  const idle = now - hands.lastHandTime > 8000;
  if (idle) scaleTarget += (1 - scaleTarget) * (1 - Math.exp(-dt * 0.8));
  hero.scale.setScalar(THREE.MathUtils.lerp(hero.scale.x, scaleTarget, 1 - Math.exp(-dt * 6)));

  // armado inicial, agujas, barrido de energía y efectos mágicos
  // sin nadie: logo HT flotando; alguien levanta la mano: el logo se transforma en el reloj
  const target = now - hands.lastHandTime < 15000 ? 2 : 1;
  stage = stage < 1 ? Math.min(1, stage + dt / 3.0) : clamp(stage + (Math.sign(target - stage) * dt) / 2.6, 1, 2);
  U.uStage.value = stage;
  U.uClockAng.value.fromArray(clockAngles());
  U.uScan.value = -3.2 + ((t % 6) / 6) * 8;
  const fx = clamp((stage - 0.7) / 0.3, 0, 1);
  rings.material.uniforms.uOn.value = fx;
  dust.material.uniforms.uOn.value = fx;
  dust.rotation.y = t * 0.02;

  // leve paralaje de cámara siguiendo a la mano principal
  const lead = active[0];
  const tx = lead ? lead.ndc.x * 0.5 : Math.sin(t * 0.1) * 0.3;
  const ty = lead ? lead.ndc.y * 0.3 : Math.cos(t * 0.13) * 0.15;
  camera.position.x += (tx - camera.position.x) * dt * 1.5;
  camera.position.y += (ty - camera.position.y) * dt * 1.5;
  camera.lookAt(0, 0, 0);

  // HUD
  $('invite').classList.toggle('hidden', !idle);
  $('guide').classList.toggle('hidden', idle || guideHidden);
  const cur = grabbing.length >= 2 ? 'zoom' : grabbing.length ? 'grab' : lead ? 'open' : '';
  document.querySelectorAll('#guide span').forEach(el => el.classList.toggle('on', el.dataset.g === cur));
  $('dot').classList.toggle('ok', camOk && now - lastMsg < 1500);
  if (document.body.classList.contains('debug')) {
    $('debug').textContent =
      `render ${fpsAvg.toFixed(0)} fps · cámara ${camOk ? camFps + ' fps' : 'OFF'} · presencia ${(presence * 100).toFixed(0)}%\n` +
      hands.slots
        .map(
          (s, i) =>
            `mano ${i}: ${s.on ? `${s.mode.padEnd(5)} x${s.srx.toFixed(2)} y${s.sry.toFixed(2)} z${s.sz.toFixed(2)}m${now - s.seen > 200 ? ' (perdida)' : ''}` : '-'}`,
        )
        .join('\n');
  }

  composer.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  bloom.resolution.set(innerWidth / 2, innerHeight / 2);
  fitRain();
});
