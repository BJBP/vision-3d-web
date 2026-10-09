// Ambiente del reloj: ondas que salen de él, polvo orbitando y lluvia digital con la silueta (OAK-D).
// createClockAmbient({...}) añade los efectos a la escena; updateSilhouette(b64) recibe la máscara.
import * as THREE from 'three';
import { CLOCK_ADDITIVE } from './watch-particles.js';

const rand = () => Math.random();

export function createClockAmbient({ scene, camera, spinG, U }) {
  // ---------- Ondas de pulsar que salen del reloj ----------
  const RINGS = 3,
    PER_RING = 1800;
  const ringGeo = new THREE.BufferGeometry();
  const rAng = new Float32Array(RINGS * PER_RING),
    rIdx = new Float32Array(RINGS * PER_RING),
    rRnd = new Float32Array(RINGS * PER_RING);
  for (let i = 0; i < rAng.length; i++) {
    rAng[i] = rand() * Math.PI * 2;
    rIdx[i] = Math.floor(i / PER_RING);
    rRnd[i] = rand();
  }
  ringGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(rAng.length * 3), 3));
  ringGeo.setAttribute('aAng', new THREE.BufferAttribute(rAng, 1));
  ringGeo.setAttribute('aIdx', new THREE.BufferAttribute(rIdx, 1));
  ringGeo.setAttribute('aRand', new THREE.BufferAttribute(rRnd, 1));
  ringGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 50);
  const rings = new THREE.Points(
    ringGeo,
    new THREE.ShaderMaterial({
      ...CLOCK_ADDITIVE,
      uniforms: { uTime: U.uTime, uMagic: U.uMagic, uPixelRatio: U.uPixelRatio, uOn: { value: 0 } },
      vertexShader: /* glsl */ `
      uniform float uTime, uPixelRatio, uOn; uniform vec3 uMagic;
      attribute float aAng, aIdx, aRand;
      varying vec3 vColor; varying float vAlpha;
      void main(){
        float ph = fract(uTime / 4.2 + aIdx / 3.0);
        float r = 1.55 + ph * 4.5 + (aRand - 0.5) * 0.06 * (1.0 + ph * 4.0);
        vec3 p = vec3(cos(aAng) * r, sin(aAng) * r, -0.1 + (aRand - 0.5) * 0.1 * ph);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (2.0 + 2.5 * fract(aRand * 7.0)) * uPixelRatio * (6.5 / -mv.z);
        float fade = pow(1.0 - ph, 2.2) * smoothstep(0.0, 0.06, ph);
        vColor = uMagic * fade * 0.55 * uOn;
        vAlpha = 1.0;
      }`,
    }),
  );
  spinG.add(rings);

  // ---------- Polvo mágico orbitando ----------
  const DUST = 2600;
  const dustGeo = new THREE.BufferGeometry();
  const dOrb = new Float32Array(DUST * 4);
  for (let i = 0; i < DUST; i++)
    dOrb.set([2.3 + rand() * 2.2, rand() * Math.PI * 2, (rand() - 0.5) * 3.2, rand()], i * 4);
  dustGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DUST * 3), 3));
  dustGeo.setAttribute('aOrb', new THREE.BufferAttribute(dOrb, 4));
  dustGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 50);
  const dust = new THREE.Points(
    dustGeo,
    new THREE.ShaderMaterial({
      ...CLOCK_ADDITIVE,
      uniforms: { uTime: U.uTime, uMagic: U.uMagic, uPixelRatio: U.uPixelRatio, uOn: { value: 0 } },
      vertexShader: /* glsl */ `
      uniform float uTime, uPixelRatio, uOn; uniform vec3 uMagic;
      attribute vec4 aOrb;   // radio, ángulo inicial, altura, aleatorio
      varying vec3 vColor; varying float vAlpha;
      void main(){
        float sp = (0.12 + 0.25 * aOrb.w) * (aOrb.w > 0.5 ? 1.0 : -1.0);
        float a = aOrb.y + uTime * sp;
        float y = aOrb.z + sin(uTime * 0.6 + aOrb.w * 30.0) * 0.25;
        vec3 p = vec3(cos(a) * aOrb.x, y, sin(a) * aOrb.x * 0.55 - 0.6);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float tw = pow(0.5 + 0.5 * sin(uTime * (1.5 + aOrb.w * 3.0) + aOrb.w * 90.0), 3.0);
        gl_PointSize = (1.5 + 3.0 * tw) * uPixelRatio * (6.5 / -mv.z);
        vColor = mix(uMagic, vec3(0.8, 1.0, 0.95), tw * 0.4) * (0.15 + 0.7 * tw) * uOn;
        vAlpha = 1.0;
      }`,
    }),
  );
  dust.rotation.x = 0.25;
  scene.add(dust);

  // ---------- Lluvia digital de fondo; la silueta de la gente brilla dentro ----------
  const SW = 96,
    SH = 54;
  const silData = new Uint8Array(SW * SH);
  const silAcc = new Float32Array(SW * SH);
  const silTex = new THREE.DataTexture(silData, SW, SH, THREE.RedFormat, THREE.UnsignedByteType);
  silTex.magFilter = silTex.minFilter = THREE.LinearFilter;
  silTex.needsUpdate = true;

  const GX = 150,
    GY = 84;
  const rainGeo = new THREE.BufferGeometry();
  const cell = new Float32Array(GX * GY * 2),
    cRnd = new Float32Array(GX * GY);
  for (let j = 0, k = 0; j < GY; j++)
    for (let i = 0; i < GX; i++, k++) {
      cell[k * 2] = (i + 0.5) / GX;
      cell[k * 2 + 1] = (j + 0.5) / GY;
      cRnd[k] = rand();
    }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(GX * GY * 3), 3));
  rainGeo.setAttribute('aCell', new THREE.BufferAttribute(cell, 2));
  rainGeo.setAttribute('aRand', new THREE.BufferAttribute(cRnd, 1));
  rainGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 50);
  const RU = {
    uTime: U.uTime,
    uMagic: U.uMagic,
    uPixelRatio: U.uPixelRatio,
    uSil: { value: silTex },
    uPlane: { value: new THREE.Vector2(1, 1) },
  };
  const RAIN_Z = -3.5;
  const rain = new THREE.Points(
    rainGeo,
    new THREE.ShaderMaterial({
      ...CLOCK_ADDITIVE,
      uniforms: RU,
      vertexShader: /* glsl */ `
      uniform float uTime, uPixelRatio; uniform vec3 uMagic; uniform sampler2D uSil; uniform vec2 uPlane;
      attribute vec2 aCell; attribute float aRand;
      varying vec3 vColor; varying float vAlpha;
      float hash(float x){ return fract(sin(x * 127.1) * 43758.5453); }
      void main(){
        float col = aCell.x, y = aCell.y;
        float seed = hash(col * 917.3);
        float head = 1.0 - fract(uTime * (0.05 + seed * 0.13) + seed * 7.0);   // cae de arriba hacia abajo
        float d = fract(y - head);                                               // distancia por encima de la cabeza
        float L = 0.2 + 0.35 * hash(seed * 13.1);
        float trail = d < L ? pow(1.0 - d / L, 2.4) : 0.0;
        float headGlow = smoothstep(0.018, 0.0, d);
        float flick = step(0.3, hash(floor(uTime * 7.0 + aRand * 40.0) + aRand * 78.2));   // parpadeo de "símbolos"
        float s = texture2D(uSil, vec2(col, 1.0 - y)).r;
        float b = (trail * (0.3 + 0.7 * flick) * 0.4 + headGlow) * (0.3 + 1.8 * s) + s * 0.1;
        vec3 p = vec3((col - 0.5) * uPlane.x, (y - 0.5) * uPlane.y, s * 0.7);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (1.8 + headGlow * 1.6 + s * 1.2) * uPixelRatio;
        vColor = mix(uMagic, vec3(0.85, 1.0, 0.9), headGlow * 0.7) * b * 1.4;
        vAlpha = 1.0;
      }`,
    }),
  );
  rain.position.z = RAIN_Z;
  scene.add(rain);

  function fitRain() {
    const h = 2 * (camera.position.z - RAIN_Z) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    RU.uPlane.value.set(h * camera.aspect * 1.06, h * 1.06);
  }
  fitRain();

  function updateSilhouette(b64) {
    const bin = atob(b64);
    for (let i = 0; i < silAcc.length; i++) {
      silAcc[i] = silAcc[i] * 0.55 + bin.charCodeAt(i) * 0.45;
      silData[i] = silAcc[i];
    }
    silTex.needsUpdate = true;
  }

  return { rings, dust, fitRain, updateSilhouette };
}
